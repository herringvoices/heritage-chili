import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { DomainError } from "../domain-error";
import { extractBearerToken } from "./bearer";
import { getRuntimeEnv } from "../runtime-env";

export type ClerkIdentity = {
  clerkUserId: string;
  email: string | null;
  username?: string | null;
};

type ClerkUserResponse = {
  username?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: Array<{ id: string; email_address: string }>;
};

const jwksLoaders = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const profileCache = new Map<string, { profile: ClerkUserProfile; expiresAt: number }>();
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PROFILE_CACHE_ENTRIES = 256;

export type ClerkUserProfile = {
  email: string | null;
  username: string | null;
};

function jwksLoader(url: string) {
  let loader = jwksLoaders.get(url);
  if (!loader) {
    loader = createRemoteJWKSet(new URL(url));
    jwksLoaders.set(url, loader);
  }
  return loader;
}

function claimEmail(payload: JWTPayload) {
  const candidates = [payload.email, payload.email_address, payload.primary_email_address];
  return candidates.find((value): value is string => typeof value === "string" && value.includes("@"));
}

export async function fetchClerkUserProfile(clerkUserId: string): Promise<ClerkUserProfile | null> {
  const cached = profileCache.get(clerkUserId);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;
  if (cached) profileCache.delete(clerkUserId);

  const secret = getRuntimeEnv().CLERK_SECRET_KEY;
  if (!secret) return null;

  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  if (!response.ok) return null;
  const user = (await response.json()) as ClerkUserResponse;
  const primary = user.email_addresses?.find((address) => address.id === user.primary_email_address_id);
  const profile = {
    email: primary?.email_address ?? user.email_addresses?.[0]?.email_address ?? null,
    username: user.username?.trim() || null,
  };
  if (profileCache.size >= MAX_PROFILE_CACHE_ENTRIES) {
    profileCache.delete(profileCache.keys().next().value!);
  }
  profileCache.set(clerkUserId, { profile, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
  return profile;
}

export async function requireAuthenticatedIdentity(request: Request): Promise<ClerkIdentity> {
  const token = extractBearerToken(request);
  const settings = getRuntimeEnv();
  const issuer = settings.CLERK_ISSUER?.replace(/\/$/, "");
  const jwksUrl = settings.CLERK_JWKS_URL ?? (issuer ? `${issuer}/.well-known/jwks.json` : null);
  if (!jwksUrl) {
    throw new DomainError("AUTH_NOT_CONFIGURED", "Sign-in is not configured yet.", 503);
  }

  try {
    const { payload } = await jwtVerify(token, jwksLoader(jwksUrl), {
      ...(issuer ? { issuer } : {}),
    });
    if (!payload.sub) throw new Error("Missing sub claim");
    const claimedEmail = claimEmail(payload);
    const profile = claimedEmail ? null : await fetchClerkUserProfile(payload.sub);
    const claimedUsername = typeof payload.username === "string" ? payload.username.trim() || null : null;
    const username = claimedUsername ?? profile?.username ?? null;
    return { clerkUserId: payload.sub, email: claimedEmail ?? profile?.email ?? null, username };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("UNAUTHENTICATED", "Your session could not be verified. Please sign in again.", 401);
  }
}
