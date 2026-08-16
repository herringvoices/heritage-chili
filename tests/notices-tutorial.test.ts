import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { NOTICE_VERSIONS } from "@/lib/notices";
import { DomainError } from "@/server/domain-error";
import { NoticeStateService } from "@/server/services/notice-state-service";

test("notice tracking migration enforces one versioned state per user", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of ["0000_parched_scream.sql", "0005_demonic_rafael_vega.sql"]) {
    db.exec((await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8")).replaceAll("--> statement-breakpoint", ""));
  }
  db.prepare("insert into users (clerk_user_id,email,display_name) values (?,?,?)").run("notice-user", "notice@example.com", "Notice User");
  db.prepare("insert into user_notice_states (user_id,notice_key,notice_version,status) values (1,?,?,?)").run("attendee_dashboard_tutorial", 1, "seen");
  assert.throws(() => db.prepare("insert into user_notice_states (user_id,notice_key,notice_version,status) values (1,?,?,?)").run("attendee_dashboard_tutorial", 1, "completed"), /UNIQUE/);
  assert.throws(() => db.prepare("insert into user_notice_states (user_id,notice_key,notice_version,status) values (1,?,?,?)").run("another_notice", 1, "ignored"), /CHECK/);
});

test("notice service accepts only application-defined notice keys", async () => {
  const db = { insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }) };
  const service = new NoticeStateService(db as never);
  assert.deepEqual(await service.record(7, "attendee_dashboard_tutorial", "completed"), {
    noticeKey: "attendee_dashboard_tutorial",
    noticeVersion: NOTICE_VERSIONS.attendee_dashboard_tutorial,
    status: "completed",
  });
  await assert.rejects(() => service.record(7, "made_up_notice", "seen"), (error: unknown) => error instanceof DomainError && error.code === "NOTICE_NOT_FOUND");
});

test("dashboard tour keeps check-in first and includes role-specific guidance", async () => {
  const source = await readFile(new URL("../components/dashboard-and-chili.tsx", import.meta.url), "utf8");
  assert.ok(source.indexOf("ref={checkinRef}") < source.indexOf('aria-label="Participation summary"'));
  assert.match(source, /Here’s your check-in code/);
  assert.match(source, /Party changes will be locked once you’ve been checked in/);
  assert.match(source, /Here’s the incomplete draft for your chili/);
  assert.match(source, /Show me around/);
});
