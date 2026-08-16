import { getRuntimeEnv } from "@/server/runtime-env";

type RehearsalAccount = {
  email: string;
  username: string;
};

type RehearsalAccountRow = {
  id: number;
  email: string;
  clerk_user_id: string;
  role: string | null;
  registration_completed_at: string | null;
};

type ClerkUser = {
  id: string;
  email_addresses?: Array<{ email_address?: string }>;
};

export type ClerkUserSummary = {
  id: string;
  emails: string[];
};

const REHEARSAL_ACCOUNTS: RehearsalAccount[] = [
  { email: "guest@test.com", username: "pepperpal" },
  { email: "entrant@test.com", username: "smokysam" },
];

function clerkUsers(body: unknown): ClerkUser[] {
  if (Array.isArray(body)) return body as ClerkUser[];
  if (body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)) {
    return (body as { data: ClerkUser[] }).data;
  }
  return [];
}

function hasEmail(user: ClerkUser, email: string) {
  return user.email_addresses?.some((address) => address.email_address?.toLowerCase() === email) ?? false;
}

function summarizeClerkUser(user: ClerkUser): ClerkUserSummary {
  return {
    id: user.id,
    emails: user.email_addresses
      ?.map((address) => address.email_address?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)) ?? [],
  };
}

async function listAllClerkUsers(secret: string, fetcher: typeof fetch) {
  const users: ClerkUser[] = [];
  let offset = 0;

  while (true) {
    const listUrl = new URL("https://api.clerk.com/v1/users");
    listUrl.searchParams.set("limit", "100");
    listUrl.searchParams.set("offset", String(offset));
    const response = await fetcher(listUrl, { headers: { authorization: `Bearer ${secret}` } });
    if (!response.ok) throw new Error(`Clerk user listing failed (${response.status}).`);
    const page = clerkUsers(await response.json());
    users.push(...page);
    if (page.length < 100) return users;
    offset += page.length;
  }
}

export async function removeClerkUsersExcept(
  preservedEmail: string,
  fetcher: typeof fetch = fetch,
) {
  const secret = getRuntimeEnv().CLERK_SECRET_KEY;
  if (!secret) throw new Error("Clerk user cleanup is unavailable because Clerk is not configured.");

  const normalizedEmail = preservedEmail.trim().toLowerCase();
  const users = await listAllClerkUsers(secret, fetcher);
  const preserved = users.filter((user) => hasEmail(user, normalizedEmail));
  if (preserved.length !== 1) {
    throw new Error(`Expected exactly one Clerk identity for ${normalizedEmail}; found ${preserved.length}.`);
  }

  const removed: ClerkUserSummary[] = [];
  for (const user of users) {
    if (user.id === preserved[0].id) continue;
    const response = await fetcher(`https://api.clerk.com/v1/users/${encodeURIComponent(user.id)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${secret}` },
    });
    if (!response.ok) throw new Error(`Clerk user deletion failed for ${user.id} (${response.status}).`);
    removed.push(summarizeClerkUser(user));
  }

  const remaining = await listAllClerkUsers(secret, fetcher);
  if (remaining.length !== 1 || remaining[0].id !== preserved[0].id) {
    throw new Error("Clerk cleanup verification failed: the preserved identity is not the sole remaining user.");
  }

  return { preserved: summarizeClerkUser(preserved[0]), removed };
}

export async function ensureClerkRehearsalUser(
  account: RehearsalAccount,
  secret: string,
  password: string,
  fetcher: typeof fetch = fetch,
) {
  const headers = { authorization: `Bearer ${secret}`, "content-type": "application/json" };
  const existing = await findClerkRehearsalUser(account, secret, fetcher);
  if (existing) return existing.id;

  const createResponse = await fetcher("https://api.clerk.com/v1/users", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email_address: [account.email],
      username: account.username,
      password,
      skip_password_checks: true,
      private_metadata: { chili_cookoff_rehearsal: true },
    }),
  });
  if (!createResponse.ok) throw new Error(`Clerk user creation failed for ${account.email} (${createResponse.status}).`);
  const created = (await createResponse.json()) as ClerkUser;
  if (!created.id) throw new Error(`Clerk did not return an identity for ${account.email}.`);
  return created.id;
}

async function findClerkRehearsalUser(account: RehearsalAccount, secret: string, fetcher: typeof fetch) {
  const listUrl = new URL("https://api.clerk.com/v1/users");
  listUrl.searchParams.set("query", account.email);
  listUrl.searchParams.set("limit", "10");
  const response = await fetcher(listUrl, { headers: { authorization: `Bearer ${secret}` } });
  if (!response.ok) throw new Error(`Clerk user lookup failed (${response.status}).`);
  return clerkUsers(await response.json()).find((user) => hasEmail(user, account.email));
}

export async function ensureRehearsalAccounts(fetcher: typeof fetch = fetch) {
  const settings = getRuntimeEnv();
  const secret = settings.CLERK_SECRET_KEY;
  const password = settings.REHEARSAL_ACCOUNT_PASSWORD;
  if (!secret || !password) return [];

  const rows = await settings.DB.prepare(`
    SELECT id, email, clerk_user_id, role, registration_completed_at
    FROM users
    WHERE lower(email) IN ('guest@test.com', 'entrant@test.com')
    ORDER BY id
  `).all<RehearsalAccountRow>();

  const provisioned: string[] = [];
  for (const account of REHEARSAL_ACCOUNTS) {
    const candidates = rows.results.filter((row) => row.email.toLowerCase() === account.email);
    const canonical = candidates.find((row) => row.role && row.registration_completed_at) ?? candidates[0];
    if (!canonical) continue;

    // Clerk user IDs are instance-scoped. A production database can still contain
    // an ID created by the development Clerk instance, so always verify the email
    // against the instance selected by the current secret before trusting the ID.
    const clerkUserId = await ensureClerkRehearsalUser(account, secret, password, fetcher);
    await settings.DB.batch([
      settings.DB.prepare(`
        DELETE FROM users
        WHERE clerk_user_id = ? AND id <> ? AND role IS NULL AND registration_completed_at IS NULL
      `).bind(clerkUserId, canonical.id),
      settings.DB.prepare(`
        UPDATE users SET clerk_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(clerkUserId, canonical.id),
    ]);
    provisioned.push(account.email);
  }
  return provisioned;
}

export async function removeRehearsalAccounts(fetcher: typeof fetch = fetch) {
  const secret = getRuntimeEnv().CLERK_SECRET_KEY;
  if (!secret) return [];

  const removed: string[] = [];
  for (const account of REHEARSAL_ACCOUNTS) {
    const existing = await findClerkRehearsalUser(account, secret, fetcher);
    if (!existing) continue;
    const response = await fetcher(`https://api.clerk.com/v1/users/${encodeURIComponent(existing.id)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${secret}` },
    });
    if (!response.ok) throw new Error(`Clerk user deletion failed for ${account.email} (${response.status}).`);
    removed.push(account.email);
  }
  return removed;
}
