import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { DomainError } from "@/server/domain-error";
import { buildEventChangeStatements, EventService } from "@/server/services/event-service";
import { buildConditionalVoteInsert, VotingService } from "@/server/services/voting-service";

function fakeDb(selects: unknown[][], options: { insertError?: Error; batchResults?: unknown[] } = {}) {
  let selectIndex = 0;
  const batches: unknown[][] = [];
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const result = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    chain.then = (fulfilled: (value: unknown[]) => unknown, rejected?: (reason: unknown) => unknown) => Promise.resolve(rows).then(fulfilled, rejected);
    for (const method of ["from", "innerJoin", "where", "limit", "orderBy"]) chain[method] = () => chain;
    return chain;
  };
  const db = {
    select: () => result(selects[selectIndex++] ?? []),
    update: () => ({ set: (values: Record<string, unknown>) => { updates.push(values); return { where: () => ({ kind: "update", values }) }; } }),
    insert: () => ({ values: (values: Record<string, unknown>) => { inserts.push(values); if (options.insertError) return Promise.reject(options.insertError); return Promise.resolve({}); }, select: () => { inserts.push({ kind: "insert-select" }); return { kind: "insert-select" }; } }),
    batch: async (statements: unknown[]) => { batches.push(statements); return options.batchResults ?? []; },
  };
  return { db: db as never, batches, inserts, updates };
}

const admin = { role: "admin", registrationCompletedAt: "now" };
const settings = { id: 1, eventName: "Chili Cookoff", pledgeGoalCents: 100000, gofundmeUrl: null, minPartySize: 1, maxPartySize: 20, suggestedAdmissionCents: 1500, suggestedChiliEntryCents: 1000, suggestedAdditionalVoteCents: 1000, checkInCodeLength: 4, votingIsOpen: false, standingsAreVisible: true, resultsAreFinal: false, resultsFinalizedAt: null, resultsFinalizedByUserId: null, createdAt: "then", updatedAt: "then" };
const voter = { id: 9, role: "guest", registrationCompletedAt: "now", participationDisabledAt: null, checkedInAt: "now", availableVoteCount: 1 };
const eventOpen = { ...settings, votingIsOpen: true };
const activeChili = { id: 4, status: "active" };

test("opening voting requires an active chili and non-final results", async () => {
  const none = fakeDb([[admin], [settings], [{ count: 0 }]]);
  await assert.rejects(() => new EventService(none.db).openVoting(1), (error: unknown) => error instanceof DomainError && error.code === "NO_ACTIVE_CHILIS");
  const final = fakeDb([[admin], [{ ...settings, resultsAreFinal: true }]]);
  await assert.rejects(() => new EventService(final.db).openVoting(1), (error: unknown) => error instanceof DomainError && error.code === "RESULTS_FINAL");
});

test("open, close, visibility, pledge goal, and URL changes are audited atomically", async () => {
  const opening = fakeDb([[admin], [settings], [{ count: 2 }], [{ ...settings, votingIsOpen: true }], [{ count: 2 }], [{ count: 0 }]]);
  assert.equal((await new EventService(opening.db).openVoting(1)).votingIsOpen, true);
  assert.equal(opening.batches[0].length, 2);

  const closing = fakeDb([[admin], [eventOpen], [settings], [{ count: 2 }], [{ count: 7 }]], { batchResults: [{}, { meta: { changes: 1 } }] });
  const closed = await new EventService(closing.db).closeVoting(1);
  assert.equal(closed.exactVoteCount, 7, "closing preserves exact votes");
  assert.equal(closing.batches[0].length, 2);
  assert.equal(closing.inserts.length, 1, "event audit is a prepared insert-select query");

  for (const [method, value] of [["setStandingsVisibility", false], ["updatePledgeGoal", 250000], ["updateGoFundMeUrl", "https://www.gofundme.com/f/cozy-cause"]] as const) {
    const resulting = { ...settings, standingsAreVisible: false, pledgeGoalCents: 250000, gofundmeUrl: "https://www.gofundme.com/f/cozy-cause" };
    const db = fakeDb([[admin], [settings], [resulting], [{ count: 2 }], [{ count: 7 }]]);
    await (new EventService(db.db)[method] as (adminId: number, input: never) => Promise<unknown>)(1, value as never);
    assert.equal(db.batches[0].length, 2);
  }
  await assert.rejects(() => new EventService(fakeDb([]).db).updatePledgeGoal(1, -1), (error: unknown) => error instanceof DomainError && error.code === "INVALID_PLEDGE_GOAL");
  await assert.rejects(() => new EventService(fakeDb([]).db).updateGoFundMeUrl(1, "http://example.com"), (error: unknown) => error instanceof DomainError && error.code === "INVALID_GOFUNDME_URL");
});

test("event changes build only D1-batchable prepared queries", () => {
  const db = drizzle({} as never, { schema });
  const statements = buildEventChangeStatements(db, 1, eventOpen, { votingIsOpen: false }, "event.voting_closed", "later");

  assert.equal(statements.length, 2);
  for (const statement of statements) assert.equal(typeof (statement as { _prepare?: unknown })._prepare, "function");

  const audit = statements[0].toSQL();
  const update = statements[1].toSQL();
  assert.match(audit.sql, /insert into [`"]audit_entries[`"].*select.*from [`"]event_settings[`"].*updated_at/si);
  assert.match(update.sql, /update [`"]event_settings[`"].*voting_is_open.*updated_at/si);
  assert.equal(update.params[0], 0, "false is bound as SQLite's integer boolean");
});

test("same-state event replays do not create duplicate audits", async () => {
  const replay = fakeDb([[admin], [eventOpen], [eventOpen], [{ count: 1 }], [{ count: 3 }]]);
  assert.equal((await new EventService(replay.db).openVoting(1)).replayed, true);
  assert.equal(replay.batches.length, 0);
});

test("every vote eligibility rejection has a stable domain error", async () => {
  const cases: [Partial<typeof voter> | null, typeof eventOpen, typeof activeChili | null, string][] = [
    [null, eventOpen, activeChili, "REGISTRATION_REQUIRED"],
    [{ ...voter, registrationCompletedAt: null }, eventOpen, activeChili, "REGISTRATION_REQUIRED"],
    [{ ...voter, participationDisabledAt: "now" }, eventOpen, activeChili, "PARTICIPATION_DISABLED"],
    [{ ...voter, checkedInAt: null }, eventOpen, activeChili, "CHECK_IN_REQUIRED"],
    [voter, settings, activeChili, "VOTING_CLOSED"],
    [voter, { ...eventOpen, resultsAreFinal: true }, activeChili, "RESULTS_FINAL"],
    [voter, eventOpen, null, "CHILI_NOT_ACTIVE"],
    [voter, eventOpen, { ...activeChili, status: "inactive" }, "CHILI_NOT_ACTIVE"],
    [{ ...voter, availableVoteCount: 0 }, eventOpen, activeChili, "NO_VOTES_AVAILABLE"],
  ];
  for (const [user, event, chili, code] of cases) {
    await assert.rejects(() => new VotingService(fakeDb([[user].filter(Boolean), [event], [chili].filter(Boolean)]).db).getVotingEligibility(9, 4), (error: unknown) => error instanceof DomainError && error.code === code);
  }
});

test("vote success returns only personal counts; same key replays and a new key inserts again", async () => {
  const success = fakeDb([[], [voter], [eventOpen], [activeChili], [{ availableVoteCount: 0 }], [{ count: 1 }]]);
  const cast = await new VotingService(success.db).castVote(9, 4, "one");
  assert.deepEqual(cast, { availableVoteCount: 0, personalVoteCount: 1, replayed: false });
  assert.equal("voteCount" in cast, false);
  assert.equal("rank" in cast, false);
  assert.equal(success.inserts.length, 1);

  const replay = fakeDb([[{ id: 44 }], [{ availableVoteCount: 0 }], [{ count: 1 }]]);
  assert.equal((await new VotingService(replay.db).castVote(9, 4, "one")).replayed, true);
  assert.equal(replay.inserts.length, 0);

  const second = fakeDb([[], [{ ...voter, availableVoteCount: 2 }], [eventOpen], [activeChili], [{ availableVoteCount: 1 }], [{ count: 2 }]]);
  assert.equal((await new VotingService(second.db).castVote(9, 4, "two")).personalVoteCount, 2);
  assert.equal(second.inserts.length, 1);
});

test("conditional vote insert matches every chili_votes column expected by Drizzle", () => {
  const db = drizzle({} as never, { schema });
  const query = buildConditionalVoteInsert(db, 9, 4, "attempt-a", "2026-08-05T22:00:00.000Z").toSQL();
  assert.match(query.sql, /insert into [`"]chili_votes[`"].*select NULL.*from \(SELECT 1\).*where changes\(\) > 0/si);
});

test("database migration adds durable vote idempotency", async () => {
  const sql = await readFile(new URL("../drizzle/0001_organic_shaman.sql", import.meta.url), "utf8");
  assert.match(sql, /chili_votes_user_idempotency_unique/);
  assert.match(sql, /ADD `idempotency_key` text/);
});

test("two intentional attempts at the last vote produce one vote and a zero balance", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of ["0000_parched_scream.sql", "0001_organic_shaman.sql"]) db.exec((await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8")).replaceAll("--> statement-breakpoint", ""));
  db.prepare("insert into users (clerk_user_id,email,display_name,role,registration_completed_at,checked_in_at,issued_vote_count,available_vote_count) values (?,?,?,?,?,?,?,?)").run("clerk-voter", "voter@example.com", "Voter", "guest", "now", "now", 1, 1);
  db.prepare("insert into users (clerk_user_id,email,display_name,role,registration_completed_at) values (?,?,?,?,?)").run("clerk-cook", "cook@example.com", "Cook", "contestant", "now");
  db.prepare("insert into chilis (cook_user_id,name,description,spice_level,status) values (?,?,?,?,?)").run(2, "Atomic Pot", "One indivisible ladle", 3, "active");
  db.prepare("update event_settings set voting_is_open = 1 where id = 1").run();
  const cast = db.prepare("update users set available_vote_count = available_vote_count - 1 where id = 1 and available_vote_count > 0 and not exists (select 1 from chili_votes where user_id = 1 and idempotency_key = ?)");
  const insert = db.prepare("insert into chili_votes (id,user_id,chili_id,idempotency_key,created_at) select NULL,1,1,?,? from (select 1) where changes() > 0");
  cast.run("attempt-a"); insert.run("attempt-a", "2026-08-05T22:00:00.000Z");
  cast.run("attempt-b"); insert.run("attempt-b", "2026-08-05T22:00:01.000Z");
  assert.equal((db.prepare("select available_vote_count as count from users where id = 1").get() as { count: number }).count, 0);
  assert.equal((db.prepare("select count(*) as count from chili_votes where user_id = 1").get() as { count: number }).count, 1);
});
