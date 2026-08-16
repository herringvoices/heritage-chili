import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { extractBearerToken } from "@/server/auth/bearer";
import { DomainError } from "@/server/domain-error";
import { errorResponse } from "@/server/http";

function migratedDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of ["0000_parched_scream.sql", "0005_demonic_rafael_vega.sql"]) {
    db.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return db;
}

test("migration creates the full schema and seed records", () => {
  const db = migratedDatabase();
  const tables = db.prepare("select name from sqlite_master where type = 'table'").all().map((row) => row.name);
  assert.ok(tables.includes("users"));
  assert.ok(tables.includes("idempotency_keys"));
  assert.ok(tables.includes("user_notice_states"));
  assert.equal((db.prepare("select event_name from event_settings where id = 1").get() as { event_name: string }).event_name, "Chili Cookoff");
  assert.equal((db.prepare("select count(*) as count from tags").get() as { count: number }).count, 6);
});

test("database enforces identity, chili ownership, balances, and case-insensitive names", () => {
  const db = migratedDatabase();
  const insertUser = db.prepare("insert into users (clerk_user_id, email, display_name) values (?, ?, ?)");
  insertUser.run("clerk_1", "first@example.com", "Fire Fan");
  assert.throws(() => insertUser.run("clerk_1", "other@example.com", "Other"), /UNIQUE/);
  assert.throws(() => insertUser.run("clerk_2", "second@example.com", "fire fan"), /UNIQUE/);
  assert.throws(() => db.prepare("update users set available_vote_count = -1 where id = 1").run(), /CHECK/);
  db.prepare("insert into chilis (cook_user_id, name) values (1, 'Cozy Pot')").run();
  assert.throws(() => db.prepare("insert into chilis (cook_user_id, name) values (1, 'Another Pot')").run(), /UNIQUE/);
  insertUser.run("clerk_3", "third@example.com", "Third");
  assert.throws(() => db.prepare("insert into chilis (cook_user_id, name) values (2, 'cozy pot')").run(), /UNIQUE/);
});

test("auth token extraction rejects missing sessions and accepts bearer sessions", () => {
  assert.throws(() => extractBearerToken(new Request("https://example.test")), (error: unknown) => error instanceof DomainError && error.code === "UNAUTHENTICATED");
  assert.equal(extractBearerToken(new Request("https://example.test", { headers: { authorization: "Bearer valid-session-token" } })), "valid-session-token");
});

test("domain errors map to the public response envelope", async () => {
  const response = errorResponse(new DomainError("REGISTRATION_REQUIRED", "Please finish registration first.", 403));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: { code: "REGISTRATION_REQUIRED", message: "Please finish registration first." } });
});
