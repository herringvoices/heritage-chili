import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureClerkRehearsalUser,
  ensureRehearsalAccounts,
  removeRehearsalAccounts,
  removeClerkUsersExcept,
} from "@/server/auth/rehearsal-accounts";
import { runWithRuntimeEnv, type RuntimeEnv } from "@/server/runtime-env";

test("an existing exact Clerk rehearsal identity is reused", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), method: init?.method ?? "GET" });
    return Response.json([
      { id: "user_other", email_addresses: [{ email_address: "guest@test.com.invalid" }] },
      { id: "user_guest", email_addresses: [{ email_address: "GUEST@TEST.COM" }] },
    ]);
  };

  const id = await ensureClerkRehearsalUser(
    { email: "guest@test.com", username: "pepperpal" },
    "secret",
    "password",
    fetcher as typeof fetch,
  );

  assert.equal(id, "user_guest");
  assert.deepEqual(requests.map((request) => request.method), ["GET"]);
});

test("a missing Clerk rehearsal identity is created with its shared test password", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    if ((init?.method ?? "GET") === "GET") return Response.json([]);
    return Response.json({ id: "user_entrant", email_addresses: [{ email_address: "entrant@test.com" }] });
  };

  const id = await ensureClerkRehearsalUser(
    { email: "entrant@test.com", username: "smokysam" },
    "secret",
    "shared-password",
    fetcher as typeof fetch,
  );

  assert.equal(id, "user_entrant");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
    email_address: ["entrant@test.com"],
    username: "smokysam",
    password: "shared-password",
    skip_password_checks: true,
    private_metadata: { chili_cookoff_rehearsal: true },
  });
});

test("a stale Clerk-shaped ID is replaced when it belongs to another Clerk instance", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const batches: unknown[][] = [];
  const database = {
    prepare(sql: string) {
      return {
        async all() {
          return {
            results: [
              {
                id: 2,
                email: "guest@test.com",
                clerk_user_id: "user_from_development",
                role: "guest",
                registration_completed_at: "2026-07-22T13:05:00Z",
              },
            ],
          };
        },
        bind(...values: unknown[]) {
          return { sql, values };
        },
      };
    },
    async batch(statements: unknown[]) {
      batches.push(statements);
      return [];
    },
  };
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    requests.push({ url: String(input), method });
    if (method === "GET") return Response.json([]);
    return Response.json({ id: "user_from_production", email_addresses: [{ email_address: "guest@test.com" }] });
  };

  const provisioned = await runWithRuntimeEnv(
    {
      DB: database,
      CLERK_SECRET_KEY: "production-secret",
      REHEARSAL_ACCOUNT_PASSWORD: "shared-password",
    } as unknown as RuntimeEnv,
    () => ensureRehearsalAccounts(fetcher as typeof fetch),
  );

  assert.deepEqual(provisioned, ["guest@test.com"]);
  assert.deepEqual(requests.map((request) => request.method), ["GET", "POST"]);
  assert.equal(batches.length, 1);
  const statements = batches[0] as Array<{ sql: string; values: unknown[] }>;
  assert.match(statements[0].sql, /DELETE FROM users/);
  assert.deepEqual(statements[0].values, ["user_from_production", 2]);
  assert.match(statements[1].sql, /UPDATE users SET clerk_user_id/);
  assert.deepEqual(statements[1].values, ["user_from_production", 2]);
});

test("switching away from rehearsal data deletes both exact Clerk test identities", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method });
    if (method === "DELETE") return Response.json({ deleted: true });
    const email = new URL(url).searchParams.get("query");
    return Response.json([
      { id: `user_${email?.startsWith("guest") ? "guest" : "entrant"}`, email_addresses: [{ email_address: email }] },
      { id: "user_lookalike", email_addresses: [{ email_address: `${email}.invalid` }] },
    ]);
  };

  const removed = await runWithRuntimeEnv(
    { CLERK_SECRET_KEY: "secret" } as RuntimeEnv,
    () => removeRehearsalAccounts(fetcher as typeof fetch),
  );

  assert.deepEqual(removed, ["guest@test.com", "entrant@test.com"]);
  assert.deepEqual(
    requests.filter((request) => request.method === "DELETE").map((request) => request.url),
    ["https://api.clerk.com/v1/users/user_guest", "https://api.clerk.com/v1/users/user_entrant"],
  );
});

test("Clerk cleanup preserves the one requested identity and deletes every other user", async () => {
  const users = [
    { id: "user_organizer", email_addresses: [{ email_address: "organizer@example.com" }] },
    { id: "user_guest", email_addresses: [{ email_address: "guest@test.com" }] },
    { id: "user_old", email_addresses: [{ email_address: "old@example.com" }] },
  ];
  const deleted: string[] = [];
  const fetcher = async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "DELETE") {
      const id = decodeURIComponent(url.split("/").at(-1) ?? "");
      deleted.push(id);
      const index = users.findIndex((user) => user.id === id);
      if (index >= 0) users.splice(index, 1);
      return new Response(JSON.stringify({ id }), { status: 200 });
    }
    return new Response(JSON.stringify(users), { status: 200 });
  };

  const result = await runWithRuntimeEnv(
    { CLERK_SECRET_KEY: "secret" } as RuntimeEnv,
    () => removeClerkUsersExcept("ORGANIZER@example.com", fetcher as typeof fetch),
  );

  assert.deepEqual(deleted, ["user_guest", "user_old"]);
  assert.equal(result.preserved.id, "user_organizer");
  assert.deepEqual(result.removed.map((user) => user.id), ["user_guest", "user_old"]);
});
