import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "@/server/domain-error";
import { AdminChiliService } from "@/server/services/admin-chili-service";
import { CheckInService } from "@/server/services/check-in-service";

function fakeDb(selects: unknown[][], options: { batchError?: Error; batchResults?: unknown[]; updateResult?: unknown; insertError?: Error } = {}) {
  let selectIndex = 0;
  const batches: unknown[][] = [];
  const updates: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];
  let deletes = 0;
  const result = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    const resolve = () => Promise.resolve(rows);
    chain.then = (fulfilled: (value: unknown[]) => unknown, rejected?: (reason: unknown) => unknown) => resolve().then(fulfilled, rejected);
    for (const method of ["from", "leftJoin", "innerJoin", "where", "limit", "groupBy", "orderBy"]) chain[method] = () => chain;
    return chain;
  };
  const db = {
    select: () => result(selects[selectIndex++] ?? []),
    update: () => ({ set: (values: Record<string, unknown>) => { updates.push(values); return { where: () => Promise.resolve(options.updateResult ?? { meta: { changes: 1 } }) }; } }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserts.push(values);
        return options.insertError ? Promise.reject(options.insertError) : Promise.resolve({ kind: "insert", values });
      },
      select: (make: (qb: { select: (values: Record<string, unknown>) => { where: () => unknown } }) => unknown) => {
        const values: Record<string, unknown> = {};
        inserts.push(values);
        return make({ select: (selected) => { Object.assign(values, selected); return { where: () => ({ kind: "conditional-insert", values }) }; } });
      },
    }),
    delete: () => { deletes += 1; return { where: () => ({ kind: "delete" }) }; },
    batch: async (statements: unknown[]) => { if (options.batchError) throw options.batchError; batches.push(statements); return options.batchResults ?? []; },
  };
  return { db: db as never, batches, updates, inserts, get deletes() { return deletes; } };
}

const admin = { role: "admin", registrationCompletedAt: "2026-07-21T12:00:00Z" };
const attendee = { id: 7, displayName: "Ember", email: "ember@example.com", partySize: 3, role: "guest", checkInCode: "0042", checkedInAt: null, availableVoteCount: 3, registrationCompletedAt: "2026-07-21T12:00:00Z", chiliName: null };
const completeChili = { id: 12, name: "Cozy Pot", description: "Smoky and rich", spiceLevel: 3, status: "draft", statusReason: null, activatedAt: null, activatedByUserId: null };
const settings = { resultsAreFinal: false };

function sqlText(value: unknown) {
  const chunks = (value as { queryChunks?: Array<string | { value?: string[] }> })?.queryChunks ?? [];
  return chunks.map((chunk) => typeof chunk === "string" ? chunk : (chunk.value ?? []).join("")).join("");
}

test("check-in lookup supports leading-zero code, name, and email results", async () => {
  for (const query of ["0042", "Ember", "ember@example.com"]) {
    const db = fakeDb([[attendee]]);
    const results = await new CheckInService(db.db).findAttendees(query);
    assert.equal(results[0]?.checkInCode, "0042");
    assert.equal(results[0]?.displayName, "Ember");
  }
  assert.deepEqual(await new CheckInService(fakeDb([[]]).db).findAttendees("nobody"), []);
  assert.equal((await new CheckInService(fakeDb([[attendee, { ...attendee, id: 8, email: "other@example.com" }]]).db).findAttendees("em")).length, 2);
});

test("check-in updates attendance, does not issue votes, and duplicate replay does not add an audit", async () => {
  const db = fakeDb([[admin], [attendee]]);
  const checkedIn = await new CheckInService(db.db).checkInAttendee(1, attendee.id);
  assert.equal(checkedIn.replayed, false);
  assert.equal(db.batches.length, 0);
  assert.equal("availableVoteCount" in db.updates[0], false);
  assert.equal(db.inserts[0].action, "attendee.checked_in");

  const replay = fakeDb([[admin], [{ ...attendee, checkedInAt: "2026-07-21T18:00:00Z" }]]);
  assert.equal((await new CheckInService(replay.db).checkInAttendee(1, attendee.id)).replayed, true);
  assert.equal(replay.batches.length, 0);
  assert.equal(replay.inserts.length, 0);
});

test("a two-admin check-in race writes no losing audit and returns a replay", async () => {
  const nowCheckedIn = { ...attendee, checkedInAt: "2026-07-21T18:00:00Z", checkedInByUserId: 2 };
  const db = fakeDb([[admin], [attendee], [nowCheckedIn]], { updateResult: { meta: { changes: 0 } } });
  const result = await new CheckInService(db.db).checkInAttendee(1, attendee.id);
  assert.equal(result.replayed, true);
  assert.equal(result.attendee.checkedInByUserId, 2);
  assert.equal(db.inserts.length, 0, "the losing request does not write an audit");
});

test("status-4 accounts and non-admin actors cannot check in attendees", async () => {
  const status4 = fakeDb([[admin], [{ ...attendee, role: null, registrationCompletedAt: null }]]);
  await assert.rejects(() => new CheckInService(status4.db).checkInAttendee(1, attendee.id), (error: unknown) => error instanceof DomainError && error.code === "CHECK_IN_NOT_REGISTERED");
  const unauthorized = fakeDb([[{ role: "guest", registrationCompletedAt: "now" }]]);
  await assert.rejects(() => new CheckInService(unauthorized.db).checkInAttendee(1, attendee.id), (error: unknown) => error instanceof DomainError && error.code === "ADMIN_REQUIRED");
});

test("undo check-in succeeds with zero votes and is blocked after any vote", async () => {
  const checked = { ...attendee, checkedInAt: "2026-07-21T18:00:00Z" };
  const db = fakeDb([[admin], [checked], [{ count: 0 }]]);
  const result = await new CheckInService(db.db).undoCheckIn(1, attendee.id);
  assert.equal(result.attendee.checkedInAt, null);
  assert.equal(db.inserts[0].action, "attendee.check_in_undone");
  assert.equal(db.batches[0].length, 2);

  const voted = fakeDb([[admin], [checked], [{ count: 1 }]]);
  await assert.rejects(() => new CheckInService(voted.db).undoCheckIn(1, attendee.id), (error: unknown) => error instanceof DomainError && error.code === "CHECK_IN_UNDO_BLOCKED_BY_VOTES" && error.status === 409);
  assert.equal(voted.batches.length, 0);
});

test("audit failure is surfaced after the guarded attendance update", async () => {
  const db = fakeDb([[admin], [attendee]], { insertError: new Error("audit unavailable") });
  await assert.rejects(() => new CheckInService(db.db).checkInAttendee(1, attendee.id), /audit unavailable/);
  assert.equal(db.batches.length, 0);
  assert.equal(db.updates.length, 1);
});

test("activation requires complete details and physical arrival confirmation", async () => {
  await assert.rejects(() => new AdminChiliService(fakeDb([]).db).activateChili(1, 12, false), (error: unknown) => error instanceof DomainError && error.code === "CHILI_ARRIVAL_CONFIRMATION_REQUIRED");
  const incomplete = fakeDb([[admin], [{ ...completeChili, description: "" }], [settings]]);
  await assert.rejects(() => new AdminChiliService(incomplete.db).activateChili(1, 12, true), (error: unknown) => error instanceof DomainError && error.code === "CHILI_INCOMPLETE");
  assert.equal(incomplete.batches.length, 0);
});

test("activate, deactivate, disqualify, and restore use explicit valid transitions with audits", async () => {
  const activation = fakeDb([[admin], [completeChili], [settings]]);
  assert.equal((await new AdminChiliService(activation.db).activateChili(1, 12, true)).status, "active");
  assert.equal(activation.inserts[0].action, "chili.active");

  const deactivation = fakeDb([[admin], [{ ...completeChili, status: "active" }], [settings]]);
  assert.equal((await new AdminChiliService(deactivation.db).deactivateChili(1, 12, "Pot removed")).status, "inactive");

  const disqualification = fakeDb([[admin], [{ ...completeChili, status: "active" }], [settings]]);
  assert.equal((await new AdminChiliService(disqualification.db).disqualifyChili(1, 12, "Rule violation")).status, "disqualified");

  const restore = fakeDb([[admin], [{ ...completeChili, status: "disqualified" }], [settings]]);
  assert.equal((await new AdminChiliService(restore.db).restoreChili(1, 12, "draft", "Issue resolved")).status, "draft");
  assert.ok(restore.inserts[0].reason, "the audit retains the restore reason");

  for (const operation of [activation, deactivation, disqualification, restore]) {
    assert.equal(operation.updates.length, 1);
    assert.equal(operation.inserts.length, 1);
    assert.equal(operation.deletes, 0, "historical votes are never deleted");
  }
});

test("invalid chili transitions, final results, and non-admin actors are rejected while reasons stay optional", async () => {
  const invalid = fakeDb([[admin], [completeChili], [settings]]);
  await assert.rejects(() => new AdminChiliService(invalid.db).deactivateChili(1, 12, "Not active"), (error: unknown) => error instanceof DomainError && error.code === "INVALID_CHILI_STATUS_TRANSITION");

  const optionalReason = fakeDb([[admin], [{ ...completeChili, status: "inactive" }], [settings]]);
  assert.equal((await new AdminChiliService(optionalReason.db).restoreChili(1, 12, "draft", " ")).statusReason, null);

  const final = fakeDb([[admin], [completeChili], [{ resultsAreFinal: true }]]);
  await assert.rejects(() => new AdminChiliService(final.db).activateChili(1, 12, true), (error: unknown) => error instanceof DomainError && error.code === "RESULTS_FINAL");

  const unauthorized = fakeDb([[{ role: "guest", registrationCompletedAt: "now" }]]);
  await assert.rejects(() => new AdminChiliService(unauthorized.db).activateChili(1, 12, true), (error: unknown) => error instanceof DomainError && error.code === "ADMIN_REQUIRED");
});

test("failed chili audit is surfaced after the guarded transition", async () => {
  const db = fakeDb([[admin], [completeChili], [settings]], { insertError: new Error("audit unavailable") });
  await assert.rejects(() => new AdminChiliService(db.db).activateChili(1, 12, true), /audit unavailable/);
  assert.equal(db.updates.length, 1);
});

test("a two-admin chili status race returns a stable conflict", async () => {
  const db = fakeDb([[admin], [completeChili], [settings]], { updateResult: { meta: { changes: 0 } } });
  await assert.rejects(() => new AdminChiliService(db.db).activateChili(1, 12, true), (error: unknown) => error instanceof DomainError && error.code === "CHILI_STATUS_CONFLICT");
  assert.equal(db.inserts.length, 0, "the losing transition cannot write an independent audit");
});
