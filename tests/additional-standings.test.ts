import assert from "node:assert/strict";
import test from "node:test";
import { GOFUNDME_URL } from "@/lib/gofundme";
import { DomainError } from "@/server/domain-error";
import { hashRequestBody } from "@/server/services/idempotency-service";
import { PledgeService } from "@/server/services/pledge-service";
import { StandingsQueryService } from "@/server/services/standings-query-service";

function fakeDb(selects: unknown[][], options: { batchError?: Error } = {}) {
  let selectIndex = 0;
  const batches: unknown[][] = [];
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const result = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    chain.then = (fulfilled: (value: unknown[]) => unknown, rejected?: (reason: unknown) => unknown) => Promise.resolve(rows).then(fulfilled, rejected);
    for (const method of ["from", "innerJoin", "where", "limit", "groupBy", "orderBy"]) chain[method] = () => chain;
    return chain;
  };
  const db = {
    select: () => result(selects[selectIndex++] ?? []),
    update: () => ({ set: (values: Record<string, unknown>) => { updates.push(values); return { where: () => ({ kind: "update", values }) }; } }),
    insert: () => ({ values: (values: Record<string, unknown>) => { inserts.push(values); return { kind: "insert", values }; } }),
    batch: async (statements: unknown[]) => { batches.push(statements); if (options.batchError) throw options.batchError; return []; },
  };
  return { db: db as never, batches, inserts, updates, get selectsUsed() { return selectIndex; } };
}

const settings = { id: 1, suggestedAdditionalVoteCents: 1000, pledgeGoalCents: 100000, gofundmeUrl: null, votingIsOpen: true, standingsAreVisible: true, resultsAreFinal: false };
const attendee = { id: 7, role: "guest", registrationCompletedAt: "now", participationDisabledAt: null, issuedVoteCount: 3, availableVoteCount: 1 };

test("additional-vote pledge validates quantity and amount", async () => {
  await assert.rejects(() => new PledgeService(fakeDb([[]]).db).recordAdditionalVotePledge(7, 0, 1000, "bad-count"), (error: unknown) => error instanceof DomainError && error.code === "INVALID_VOTE_QUANTITY");
  await assert.rejects(() => new PledgeService(fakeDb([[]]).db).recordAdditionalVotePledge(7, 1.5, 1000, "fraction"), (error: unknown) => error instanceof DomainError && error.code === "INVALID_VOTE_QUANTITY");
  await assert.rejects(() => new PledgeService(fakeDb([[]]).db).recordAdditionalVotePledge(7, 1, -1, "bad-amount"), (error: unknown) => error instanceof DomainError && error.code === "INVALID_PLEDGE_AMOUNT");
});

test("additional pledge and vote grant are one atomic retry-safe batch", async () => {
  const db = fakeDb([[], [attendee], [settings], [{ total: 2500 }]]);
  const result = await new PledgeService(db.db).recordAdditionalVotePledge(7, 2, 1750, "add-two");
  assert.deepEqual(result, { requestedVoteCount: 2, pledgedCents: 1750, totalPledgedCents: 4250, issuedVoteCount: 5, availableVoteCount: 3, gofundmeUrl: GOFUNDME_URL, nextRoute: "/thank-you" });
  assert.equal(db.batches.length, 1);
  assert.equal(db.batches[0].length, 3, "vote balances, pledge, and replay record share one batch");
  assert.equal(db.inserts[0].context, "additional_votes");
  assert.equal(db.inserts[0].additionalVoteCount, 2);

  const failed = fakeDb([[], [attendee], [settings], [{ total: 2500 }], []], { batchError: new Error("rolled back") });
  await assert.rejects(() => new PledgeService(failed.db).recordAdditionalVotePledge(7, 2, 1750, "failure"), /rolled back/);
  assert.equal(failed.batches[0].length, 3, "no grant is issued outside the failing atomic batch");
});

test("additional-vote duplicate replay does not grant twice", async () => {
  const stored = { requestedVoteCount: 2, pledgedCents: 1750, totalPledgedCents: 4250, issuedVoteCount: 5, availableVoteCount: 3, gofundmeUrl: null, nextRoute: "/thank-you" };
  const requestHash = await hashRequestBody({ requestedVoteCount: 2, amountCents: 1750 });
  const db = fakeDb([[{ requestHash, responseJson: JSON.stringify({ data: stored }) }]]);
  assert.deepEqual(await new PledgeService(db.db).recordAdditionalVotePledge(7, 2, 1750, "same"), stored);
  assert.equal(db.batches.length, 0);
});

test("disabled, unregistered, and admin accounts cannot obtain additional votes", async () => {
  for (const [user, code] of [
    [{ ...attendee, participationDisabledAt: "now" }, "PARTICIPATION_DISABLED"],
    [{ ...attendee, role: null, registrationCompletedAt: null }, "REGISTRATION_REQUIRED"],
    [{ ...attendee, role: "admin" }, "REGISTRATION_REQUIRED"],
  ] as const) {
    const db = fakeDb([[], [user], [settings], [{ total: 0 }]]);
    await assert.rejects(() => new PledgeService(db.db).recordAdditionalVotePledge(7, 1, 0, code), (error: unknown) => error instanceof DomainError && error.code === code);
    assert.equal(db.batches.length, 0);
  }
});

test("standings return fewer than three entries and stable ties without exact-total leakage", async () => {
  const rows = [
    { chiliId: 2, name: "Bright Pot", contestantName: "Bea", imageObjectKey: null, voteCount: 4 },
    { chiliId: 8, name: "Cozy Pot", contestantName: "Cole", imageObjectKey: "chilis/8.jpg", voteCount: 4 },
  ];
  const model = await new StandingsQueryService(fakeDb([[settings], [{ total: 3200 }], rows]).db).getPublicStandings();
  assert.equal(model.state, "partially-ranked");
  assert.equal(model.rankings.length, 2);
  assert.equal(model.hasTies, true);
  assert.deepEqual(model.rankings.map((row) => row.chiliId), [2, 8]);
  assert.doesNotMatch(JSON.stringify(model), /voteCount|percentage|gap/i);
});

test("hidden standings expose pledge progress but no ranking data", async () => {
  const db = fakeDb([[{ ...settings, standingsAreVisible: false }], [{ total: 12500 }], [{ chiliId: 99, voteCount: 99 }]]);
  const model = await new StandingsQueryService(db.db).getPublicStandings();
  assert.equal(model.state, "hidden");
  assert.deepEqual(model.rankings, []);
  assert.equal(model.progress.totalPledgedCents, 12500);
  assert.equal(db.selectsUsed, 2, "hidden state never reads ranking rows");
});

test("pledge progress uses the signed sum for exceeded goals and reversals", async () => {
  const exceeded = await new StandingsQueryService(fakeDb([[settings], [{ total: 125000 }], []]).db).getPublicStandings();
  assert.deepEqual(exceeded.progress, { totalPledgedCents: 125000, goalCents: 100000 });
  const corrected = await new StandingsQueryService(fakeDb([[settings], [{ total: 90000 }], []]).db).getPublicStandings();
  assert.deepEqual(corrected.progress, { totalPledgedCents: 90000, goalCents: 100000 });
});

test("finalized standings use saved official placements rather than live votes", async () => {
  const official = [
    { rank: 1, chiliId: 7, name: "Winner", contestantName: "Wren", imageObjectKey: null },
    { rank: 2, chiliId: 3, name: "Runner Up", contestantName: "Rue", imageObjectKey: null },
  ];
  const db = fakeDb([[{ ...settings, resultsAreFinal: true }], [{ total: 100000 }], official]);
  const model = await new StandingsQueryService(db.db).getPublicStandings();
  assert.equal(model.state, "finalized");
  assert.deepEqual(model.rankings.map((row) => [row.rank, row.chiliId]), [[1, 7], [2, 3]]);
  assert.doesNotMatch(JSON.stringify(model), /voteCount/i);
  assert.equal(db.selectsUsed, 3);
});

test("reopened standings immediately return to the live read model", async () => {
  const live = [{ chiliId: 8, name: "Recounted", contestantName: "Rae", imageObjectKey: null, voteCount: 11 }];
  const db = fakeDb([[{ ...settings, resultsAreFinal: false, votingIsOpen: false }], [{ total: 100000 }], live]);
  const model = await new StandingsQueryService(db.db).getPublicStandings();
  assert.equal(model.state, "partially-ranked");
  assert.equal(model.rankings[0]?.chiliId, 8);
  assert.equal(db.selectsUsed, 3, "reopened standings no longer read official result rows");
});
