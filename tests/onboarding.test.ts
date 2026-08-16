import assert from "node:assert/strict";
import test from "node:test";
import { centsToInput, formatCents, parseCurrencyToCents } from "@/lib/currency";
import { GOFUNDME_URL } from "@/lib/gofundme";
import { DomainError } from "@/server/domain-error";
import { PledgeService } from "@/server/services/pledge-service";
import { calculateSuggestedInitialPledge, RegistrationService } from "@/server/services/registration-service";

type FakeOptions = { selects: unknown[][]; batchErrors?: Error[] };

function fakeDb(options: FakeOptions) {
  let selectIndex = 0;
  const updates: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];
  let batches = 0;
  const db = {
    select: () => {
      const response = options.selects[selectIndex++] ?? [];
      const result = {
        limit: async () => response,
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(response).then(resolve, reject),
      };
      return { from: () => ({ where: () => result }) };
    },
    update: () => ({ set: (values: Record<string, unknown>) => { updates.push(values); return { where: () => ({ kind: "update", values }) }; } }),
    insert: () => ({ values: (values: Record<string, unknown>) => {
      inserts.push(values);
      const statement = { kind: "insert", values, onConflictDoNothing: () => statement };
      return statement;
    } }),
    batch: async () => {
      batches += 1;
      const error = options.batchErrors?.shift();
      if (error) throw error;
      return [];
    },
  };
  return { db: db as never, updates, inserts, get batches() { return batches; } };
}

const settings = {
  id: 1,
  minPartySize: 1,
  maxPartySize: 20,
  suggestedAdmissionCents: 1500,
  suggestedChiliEntryCents: 1000,
  checkInCodeLength: 4,
  gofundmeUrl: null,
};
const status4 = { id: 7, role: null, registrationCompletedAt: null };
const registered = { id: 7, role: "guest", registrationCompletedAt: "2026-07-21T00:00:00.000Z" };

test("suggested pledge calculations include every attendee and an optional chili entry", () => {
  assert.equal(calculateSuggestedInitialPledge(3, false, settings), 4500);
  assert.equal(calculateSuggestedInitialPledge(3, true, settings), 5500);
});

test("registration batches guest votes and contestant placeholder atomically", async () => {
  const guestDb = fakeDb({ selects: [[], [status4], [settings]] });
  const guestResult = await new RegistrationService(guestDb.db, () => "0042").completeRegistration(7, { partySize: 3, entersChili: false }, "guest-key");
  assert.deepEqual(guestResult, { partySize: 3, role: "guest", issuedVoteCount: 3, suggestedPledgeCents: 4500, nextRoute: "/pledge" });
  assert.equal(guestDb.updates[0].availableVoteCount, 3);
  assert.equal(guestDb.inserts.length, 1, "guest batch contains only the idempotency insert");

  const contestantDb = fakeDb({ selects: [[], [status4], [settings]] });
  await new RegistrationService(contestantDb.db, () => "0007").completeRegistration(7, { partySize: 2, entersChili: true }, "contestant-key");
  assert.equal(contestantDb.updates[0].checkInCode, "0007");
  assert.equal(contestantDb.inserts.length, 2, "contestant batch includes chili and idempotency rows");
});

test("registration retries a check-in-code collision and replays duplicate requests", async () => {
  const collision = fakeDb({ selects: [[], [status4], [settings]], batchErrors: [new Error("UNIQUE constraint failed: users.check_in_code")] });
  const codes = ["0042", "0043"];
  await new RegistrationService(collision.db, () => codes.shift()!).completeRegistration(7, { partySize: 1, entersChili: false }, "key");
  assert.equal(collision.batches, 2);
  assert.equal(collision.updates[1].checkInCode, "0043");

  const stored = { partySize: 1, role: "guest", issuedVoteCount: 1, suggestedPledgeCents: 1500, nextRoute: "/pledge" };
  const replay = fakeDb({ selects: [[{ requestHash: await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ partySize: 1, entersChili: false }))).then((digest) => [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")), responseJson: JSON.stringify({ data: stored }) }]] });
  assert.deepEqual(await new RegistrationService(replay.db).completeRegistration(7, { partySize: 1, entersChili: false }, "same"), stored);
  assert.equal(replay.batches, 0);
});

test("registration rejects invalid or finalized accounts, allows pre-pledge edits, and surfaces batch failure", async () => {
  const invalid = fakeDb({ selects: [[], [status4], [settings]] });
  await assert.rejects(() => new RegistrationService(invalid.db).completeRegistration(7, { partySize: 0, entersChili: false }, "key"), (error: unknown) => error instanceof DomainError && error.code === "INVALID_PARTY_SIZE");

  const editable = fakeDb({ selects: [[], [registered], [settings], []] });
  const edited = await new RegistrationService(editable.db).completeRegistration(7, { partySize: 4, entersChili: false }, "edit-key");
  assert.equal(edited.partySize, 4);
  assert.equal(editable.updates[0].partySize, 4);

  const finalized = fakeDb({ selects: [[], [registered], [settings], [{ id: 99 }]] });
  await assert.rejects(() => new RegistrationService(finalized.db).completeRegistration(7, { partySize: 1, entersChili: false }, "key"), (error: unknown) => error instanceof DomainError && error.code === "REGISTRATION_LOCKED");

  const failed = fakeDb({ selects: [[], [status4], [settings]], batchErrors: [new Error("batch rolled back")] });
  await assert.rejects(() => new RegistrationService(failed.db).completeRegistration(7, { partySize: 1, entersChili: true }, "key"), /batch rolled back/);
});

test("currency parsing sends exact nonnegative integer cents", () => {
  assert.equal(parseCurrencyToCents("$1,234.56"), 123456);
  assert.equal(parseCurrencyToCents("0"), 0);
  assert.equal(parseCurrencyToCents("12.3"), 1230);
  assert.equal(parseCurrencyToCents("-1"), null);
  assert.equal(parseCurrencyToCents("4.567"), null);
  assert.equal(centsToInput(2550), "25.50");
  assert.equal(formatCents(2550), "$25.50");
});

test("initial pledge requires registration and returns append-only total with safe event fields", async () => {
  const unregistered = fakeDb({ selects: [[], [status4], [settings], [], [{ total: 0 }]] });
  await assert.rejects(() => new PledgeService(unregistered.db).recordInitialPledge(7, 0, "key"), (error: unknown) => error instanceof DomainError && error.code === "REGISTRATION_REQUIRED");

  const pledgeDb = fakeDb({ selects: [[], [registered], [settings], [], [{ total: -500 }]] });
  const result = await new PledgeService(pledgeDb.db).recordInitialPledge(7, 2500, "key");
  assert.deepEqual(result, { pledgedCents: 2500, totalPledgedCents: 2000, gofundmeUrl: GOFUNDME_URL, nextRoute: "/thank-you" });
  assert.equal(pledgeDb.inserts[0].context, "initial");
  assert.equal(pledgeDb.inserts[0].amountCents, 2500);
  assert.equal(pledgeDb.batches, 1);
});

test("attendees can update party size before check-in and the base vote allocation follows", async () => {
  const user = { ...registered, partySize: 2, issuedVoteCount: 2, availableVoteCount: 2, checkedInAt: null, participationDisabledAt: null };
  const editable = fakeDb({ selects: [[user], [settings]] });
  const result = await new RegistrationService(editable.db).updatePartySize(7, 4);
  assert.deepEqual(result, { partySize: 4, issuedVoteCount: 4, availableVoteCount: 4, changed: true });
  assert.equal(editable.updates[0].partySize, 4);
  assert.equal(editable.inserts[0].action, "attendee.party_size_updated");

  const locked = fakeDb({ selects: [[{ ...user, checkedInAt: "now" }], [settings]] });
  await assert.rejects(() => new RegistrationService(locked.db).updatePartySize(7, 3), (error: unknown) => error instanceof DomainError && error.code === "PARTY_SIZE_LOCKED");
});

test("a guest can add a chili before the event with an adjustable entry pledge", async () => {
  const db = fakeDb({ selects: [[], [registered], [settings], [{ total: 2500 }], []] });
  const result = await new RegistrationService(db.db).addChiliEntry(7, 1000, "entry-key");
  assert.deepEqual(result, {
    purpose: "chili_entry",
    pledgedCents: 1000,
    totalPledgedCents: 3500,
    gofundmeUrl: GOFUNDME_URL,
    nextRoute: "/thank-you",
    continueRoute: "/chili/edit",
    continueLabel: "Continue to chili entry",
  });
  assert.equal(db.updates[0].role, "contestant");
  assert.equal(db.inserts.some((row) => row.status === "draft"), true);
  assert.equal(db.inserts.some((row) => row.context === "chili_entry" && row.amountCents === 1000), true);
  assert.equal(db.inserts.some((row) => row.action === "attendee.chili_entry_added"), true);
  assert.equal(db.batches, 1);
});

test("a guest cannot add a chili after check-in or once voting opens", async () => {
  const checkedIn = fakeDb({ selects: [[], [{ ...registered, checkedInAt: "now" }], [settings], [{ total: 0 }], []] });
  await assert.rejects(() => new RegistrationService(checkedIn.db).addChiliEntry(7, 1000, "checked-key"), (error: unknown) => error instanceof DomainError && error.code === "CHILI_ENTRY_CLOSED");

  const votingOpen = fakeDb({ selects: [[], [registered], [{ ...settings, votingIsOpen: true }], [{ total: 0 }], []] });
  await assert.rejects(() => new RegistrationService(votingOpen.db).addChiliEntry(7, 1000, "open-key"), (error: unknown) => error instanceof DomainError && error.code === "CHILI_ENTRY_CLOSED");
});

test("attendees can replace their displayed total pledge with an append-only correction", async () => {
  const user = { ...registered, participationDisabledAt: null };
  const db = fakeDb({ selects: [[], [user], [{ total: 2500 }]] });
  const result = await new PledgeService(db.db).updateTotalPledge(7, 4000, "update-key");
  assert.deepEqual(result, { previousTotalCents: 2500, totalPledgedCents: 4000, differenceCents: 1500 });
  assert.equal(db.inserts[0].context, "correction");
  assert.equal(db.inserts[0].amountCents, 1500);
  assert.equal(db.inserts[1].action, "attendee.pledge_total_updated");
  assert.equal(db.batches, 1);
});
