import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createMeHandler } from "@/app/api/me/route";
import { requireAuthenticatedIdentity } from "@/server/auth/clerk";
import { runWithRuntimeEnv, type RuntimeEnv } from "@/server/runtime-env";

test("/api/me verifies a signed Clerk JWT, syncs identity, and hides the Clerk ID", async (t) => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  const jwks = { keys: [{ ...publicJwk, kid: "test-key", use: "sig", alg: "RS256" }] };
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(jwks));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const issuer = "https://clerk.test";
  const token = await new SignJWT({ email: "verified@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("user_clerk_verified")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  const calls: string[] = [];
  const handler = createMeHandler({
    authenticate: requireAuthenticatedIdentity,
    createIdentityService: () => ({
      async syncAuthenticatedUser(identity) { calls.push(`sync:${identity.clerkUserId}:${identity.email}`); return {} as never; },
      async getCurrentUserContext(clerkUserId) {
        calls.push(`read:${clerkUserId}`);
        return {
          id: 7,
          email: "verified@example.com",
          displayName: null,
          registrationState: "status4" as const,
          role: null,
          isAdmin: false,
          hasInitialPledge: false,
          checkedIn: false,
          participation: { disabled: false, reason: null, canMutate: false },
          entryRoute: "/register" as const,
        };
      },
    }),
  });

  const response = await runWithRuntimeEnv({
    CLERK_ISSUER: issuer,
    CLERK_JWKS_URL: `http://127.0.0.1:${address.port}/.well-known/jwks.json`,
  } as RuntimeEnv, () => handler(new Request("https://cookoff.test/api/me", { headers: { authorization: `Bearer ${token}` } })));

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["sync:user_clerk_verified:verified@example.com", "read:user_clerk_verified"]);
  const body = await response.json();
  assert.equal(JSON.stringify(body).includes("user_clerk_verified"), false);
  assert.equal(body.data.entryRoute, "/register");
});

test("/api/me returns 401 when no bearer session is present", async () => {
  const handler = createMeHandler({
    authenticate: requireAuthenticatedIdentity,
    createIdentityService: () => { throw new Error("service should not be created"); },
  });
  const response = await runWithRuntimeEnv({ CLERK_JWKS_URL: "https://unused.test/jwks" } as RuntimeEnv, () => handler(new Request("https://cookoff.test/api/me")));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: { code: "UNAUTHENTICATED", message: "Please sign in to continue." } });
});

test("/api/me uses Clerk's client profile email when the default session token omits it", async () => {
  const calls: Array<{ clerkUserId: string; email: string | null }> = [];
  const handler = createMeHandler({
    authenticate: async () => ({ clerkUserId: "user_without_email_claim", email: null }),
    loadProfile: async () => null,
    createIdentityService: () => ({
      async syncAuthenticatedUser(identity) { calls.push(identity); return {} as never; },
      async getCurrentUserContext() {
        return {
          id: 8, email: "profile@example.com", displayName: null, registrationState: "status4" as const,
          role: null, isAdmin: false, hasInitialPledge: false, checkedIn: false,
          participation: { disabled: false, reason: null, canMutate: false }, entryRoute: "/register" as const,
        };
      },
    }),
  });
  const response = await handler(new Request("https://cookoff.test/api/me", {
    headers: { "x-clerk-primary-email": "profile@example.com" },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ clerkUserId: "user_without_email_claim", email: "profile@example.com", username: null }]);
});

test("/api/me syncs the Clerk username used throughout the site", async () => {
  const calls: Array<{ clerkUserId: string; email: string | null; username?: string | null }> = [];
  const handler = createMeHandler({
    authenticate: async () => ({ clerkUserId: "user_google", email: "google@example.com", username: null }),
    loadProfile: async () => ({ email: "google@example.com", username: "HeritageCook" }),
    createIdentityService: () => ({
      async syncAuthenticatedUser(identity) { calls.push(identity); return {} as never; },
      async getCurrentUserContext() {
        return {
          id: 9, email: "google@example.com", displayName: "HeritageCook", registrationState: "registered" as const,
          role: "guest" as const, isAdmin: false, hasInitialPledge: true, checkedIn: false,
          participation: { disabled: false, reason: null, canMutate: true }, entryRoute: "/dashboard" as const,
        };
      },
    }),
  });

  const response = await handler(new Request("https://cookoff.test/api/me"));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ clerkUserId: "user_google", email: "google@example.com", username: "HeritageCook" }]);
  assert.equal((await response.json()).data.displayName, "HeritageCook");
});

test("/api/me skips the Clerk profile request when JWT authentication already resolved the profile", async () => {
  let profileLoads = 0;
  const identities: Array<{ clerkUserId: string; email: string | null; username?: string | null }> = [];
  const handler = createMeHandler({
    authenticate: async () => ({ clerkUserId: "user_complete", email: "complete@example.com", username: "CompleteCook" }),
    loadProfile: async () => { profileLoads += 1; return null; },
    createIdentityService: () => ({
      async syncAuthenticatedUser(identity) { identities.push(identity); return {} as never; },
      async getCurrentUserContext() {
        return {
          id: 10, email: "complete@example.com", displayName: "CompleteCook", registrationState: "registered" as const,
          role: "guest" as const, isAdmin: false, hasInitialPledge: true, checkedIn: false,
          participation: { disabled: false, reason: null, canMutate: true }, entryRoute: "/dashboard" as const,
        };
      },
    }),
  });

  const response = await handler(new Request("https://cookoff.test/api/me"));

  assert.equal(response.status, 200);
  assert.equal(profileLoads, 0);
  assert.deepEqual(identities, [{ clerkUserId: "user_complete", email: "complete@example.com", username: "CompleteCook" }]);
});
