import baselineSql from "@/scripts/reset-profiles/baseline.sql?raw";
import fullSwingSql from "@/scripts/reset-profiles/full-swing.sql?raw";
import { ensureRehearsalAccounts, removeClerkUsersExcept, removeRehearsalAccounts } from "@/server/auth/rehearsal-accounts";
import { getRuntimeEnv } from "@/server/runtime-env";

const TABLES = [
  "users",
  "event_settings",
  "tags",
  "chilis",
  "chili_tags",
  "chili_votes",
  "pledges",
  "vote_adjustments",
  "audit_entries",
  "official_results",
  "idempotency_keys",
  "user_notice_states",
] as const;

type Profile = "baseline" | "full-swing";
type RequestBody =
  | { action: "backup" }
  | { action: "reset"; profile: Profile }
  | { action: "promote"; email: string }
  | {
      action: "prune-clerk-users";
      keepEmail: string;
      confirmation: "DELETE OTHER CLERK USERS";
    }
  | {
      action: "remove-unregistered-user";
      email: string;
      confirmation: "DELETE UNREGISTERED APP USER";
    };

function authorized(request: Request) {
  // Sites access control protects private deployments at the edge. The separate
  // secret keeps this destructive route protected if the event site becomes
  // public later, and a custom header prevents link/form based CSRF.
  const expected = getRuntimeEnv().DB_RESET_TOKEN;
  return Boolean(expected) && request.headers.get("x-chili-reset") === expected;
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function splitStatements(source: string) {
  const statements: string[] = [];
  let current = "";
  let inString = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    current += character;

    if (character === "'" && inString && next === "'") {
      current += next;
      index += 1;
      continue;
    }
    if (character === "'") inString = !inString;
    if (character === ";" && !inString) {
      const statement = current.slice(0, -1).trim();
      if (statement) statements.push(statement);
      current = "";
    }
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function prepareProfileSql(profile: Profile) {
  const database = getRuntimeEnv().DB;
  const identities = await database
    .prepare("SELECT lower(email) AS email, clerk_user_id FROM users WHERE lower(email) IN ('organizer@example.com','guest@test.com','entrant@test.com')")
    .all<{ email: string; clerk_user_id: string }>();
  const clerkIds = new Map(identities.results.map((row) => [row.email, row.clerk_user_id]));

  let source = profile === "baseline" ? baselineSql : fullSwingSql;
  source = source
    .replace(/PRAGMA foreign_keys = (?:OFF|ON);/g, "")
    .replace(/BEGIN TRANSACTION;/g, "")
    .replace(/COMMIT;/g, "")
    .replace(/DROP TABLE IF EXISTS _reset_identities;/g, "")
    .replace(/DROP TABLE _reset_identities;/g, "")
    .replace(/CREATE TEMP TABLE _reset_identities AS[\s\S]*?WHERE lower\(email\) IN \([^;]+\);/g, "");

  const fallbacks: Record<string, string> = {
    "organizer@example.com": "seed_admin_test",
    "guest@test.com": "seed_guest_test",
    "entrant@test.com": "seed_entrant_test",
  };

  source = source.replace(
    /COALESCE\(\(SELECT clerk_user_id FROM _reset_identities WHERE email='([^']+)'\),'([^']+)'\)/g,
    (_match, email: string, fallback: string) => sqlString(clerkIds.get(email) ?? fallbacks[email] ?? fallback),
  );

  return splitStatements(source);
}

async function snapshot() {
  const database = getRuntimeEnv().DB;
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    tables[table] = (await database.prepare(`SELECT * FROM ${table}`).all()).results;
  }
  return { exportedAt: new Date().toISOString(), tables };
}

async function removeChiliImages() {
  const settings = getRuntimeEnv();
  const images = await settings.DB.prepare("SELECT image_object_key FROM chilis WHERE image_object_key IS NOT NULL").all<{ image_object_key: string }>();
  await Promise.all(images.results.map((image) => settings.BUCKET.delete(image.image_object_key)));
  return images.results.length;
}

async function promote(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;
  const database = getRuntimeEnv().DB;
  const user = await database.prepare("SELECT id, role, registration_completed_at FROM users WHERE lower(email) = ? LIMIT 1").bind(normalizedEmail).first<{ id: number; role: string | null; registration_completed_at: string | null }>();
  if (!user) return null;
  await database.prepare(`
    UPDATE users
    SET role = 'admin',
        registration_completed_at = COALESCE(registration_completed_at, CURRENT_TIMESTAMP),
        party_size = 1,
        check_in_code = NULL,
        checked_in_at = NULL,
        checked_in_by_user_id = NULL,
        issued_vote_count = 0,
        available_vote_count = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(user.id).run();
  return database.prepare("SELECT id, email, display_name, role FROM users WHERE id = ?").bind(user.id).first();
}

async function removeUnregisteredUser(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const database = getRuntimeEnv().DB;
  const user = await database.prepare(`
    SELECT id, email, role, registration_completed_at
    FROM users
    WHERE lower(email) = ?
    LIMIT 1
  `).bind(normalizedEmail).first<{
    id: number;
    email: string;
    role: string | null;
    registration_completed_at: string | null;
  }>();
  if (!user) return null;
  if (user.role || user.registration_completed_at) {
    throw new Error("Refusing to delete an app user who has completed registration.");
  }

  await database.prepare(`
    DELETE FROM users
    WHERE id = ? AND role IS NULL AND registration_completed_at IS NULL
  `).bind(user.id).run();
  return { id: user.id, email: user.email };
}

async function summary(profile: Profile) {
  const database = getRuntimeEnv().DB;
  const counts = await database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM chilis) AS chilis,
      (SELECT COUNT(*) FROM chili_votes) AS votes,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM pledges) AS pledged_cents
  `).first();
  const testAccounts = await database.prepare(`
    SELECT email, role, party_size, checked_in_at, issued_vote_count, available_vote_count
    FROM users
    WHERE lower(email) IN ('organizer@example.com','guest@test.com','entrant@test.com')
    ORDER BY id
  `).all();
  return { profile, ...counts, testAccounts: testAccounts.results };
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (body?.action === "backup") {
    return Response.json(await snapshot(), { headers: { "cache-control": "no-store" } });
  }

  if (body?.action === "promote") {
    const user = await promote(body.email);
    if (!user) return Response.json({ error: "No account exists for that email yet." }, { status: 404 });
    return Response.json({ user }, { headers: { "cache-control": "no-store" } });
  }

  if (body?.action === "prune-clerk-users") {
    if (body.confirmation !== "DELETE OTHER CLERK USERS") {
      return Response.json({ error: "Exact Clerk cleanup confirmation is required." }, { status: 400 });
    }
    const result = await removeClerkUsersExcept(body.keepEmail);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  }

  if (body?.action === "remove-unregistered-user") {
    if (body.confirmation !== "DELETE UNREGISTERED APP USER") {
      return Response.json({ error: "Exact unregistered-user cleanup confirmation is required." }, { status: 400 });
    }
    const removed = await removeUnregisteredUser(body.email);
    if (!removed) return Response.json({ error: "No matching app user exists." }, { status: 404 });
    return Response.json({ removed }, { headers: { "cache-control": "no-store" } });
  }

  if (body?.action !== "reset" || (body.profile !== "baseline" && body.profile !== "full-swing")) {
    return Response.json({ error: "Expected a backup action or a baseline/full-swing reset." }, { status: 400 });
  }

  const database = getRuntimeEnv().DB;
  const removedImages = await removeChiliImages();
  const statements = await prepareProfileSql(body.profile);
  await database.batch(statements.map((statement) => database.prepare(statement)));
  if (body.profile === "full-swing") await ensureRehearsalAccounts();
  else await removeRehearsalAccounts();
  return Response.json({ ...(await summary(body.profile)), removedImages }, { headers: { "cache-control": "no-store" } });
}
