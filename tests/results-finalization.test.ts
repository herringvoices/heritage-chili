import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "@/server/domain-error";
import { ResultsService } from "@/server/services/results-service";

function fakeDb(selects: unknown[][], options: { batchError?: Error } = {}) {
  let selectIndex = 0;
  const batches: unknown[][] = [];
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  let deletes = 0;
  const result = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    chain.then = (fulfilled: (value: unknown[]) => unknown, rejected?: (reason: unknown) => unknown) => Promise.resolve(rows).then(fulfilled, rejected);
    for (const method of ["from", "innerJoin", "leftJoin", "where", "limit", "groupBy", "orderBy"]) chain[method] = () => chain;
    return chain;
  };
  const db = {
    select: () => result(selects[selectIndex++] ?? []),
    insert: () => ({ values: (values: Record<string, unknown>) => { inserts.push(values); return { kind: "insert", values }; } }),
    update: () => ({ set: (values: Record<string, unknown>) => { updates.push(values); return { where: () => ({ kind: "update", values }) }; } }),
    delete: () => { deletes += 1; return { kind: "delete" }; },
    batch: async (statements: unknown[]) => { if (options.batchError) throw options.batchError; batches.push(statements); return []; },
  };
  return { db: db as never, batches, inserts, updates, get deletes() { return deletes; } };
}

const admin = { role: "admin", registrationCompletedAt: "now" };
const settings = { id: 1, votingIsOpen: false, resultsAreFinal: false, resultsFinalizedAt: null, resultsFinalizedByUserId: null };
const metrics = [[{ totalVotesCast: 24 }], [{ checkedInVotingAccounts: 8, totalUnusedVotes: 3 }], [{ totalPledgedCents: 120000 }], []] as const;
const chili = (chiliId: number, voteCount: number, status: "draft" | "active" | "inactive" | "disqualified" = "active") => ({ chiliId, name: `Pot ${chiliId}`, contestantName: `Cook ${chiliId}`, status, voteCount });
const resultSelects = (rows: ReturnType<typeof chili>[], event = settings, official: unknown[] = []) => [[event], rows, metrics[0], metrics[1], metrics[2], official];

test("no-tie finalization saves exactly three distinct placements, event state, and audit in one batch", async () => {
  const db = fakeDb([[admin], ...resultSelects([chili(1, 10), chili(2, 8), chili(3, 6), chili(4, 4)])]);
  const result = await new ResultsService(db.db).finalizeResults(9);
  assert.deepEqual(result.officialResults.map((row) => [row.placement, row.chiliId, row.voteCount]), [[1, 1, 10], [2, 2, 8], [3, 3, 6]]);
  assert.equal(db.batches.length, 1);
  assert.equal(db.batches[0].length, 5, "three result rows, event state, and audit are one atomic batch");
  assert.deepEqual(db.inserts.slice(0, 3).map((row) => [row.placement, row.chiliId]), [[1, 1], [2, 2], [3, 3]]);
  assert.equal(db.inserts[3].action, "results.finalized");
});

test("ties at first, second, and third are detected as placement-affecting", () => {
  const service = new ResultsService(fakeDb([]).db);
  for (const [rows, expected] of [
    [[chili(1, 10), chili(2, 10), chili(3, 8), chili(4, 7)], { start: 1, end: 2 }],
    [[chili(1, 10), chili(2, 8), chili(3, 8), chili(4, 7)], { start: 2, end: 3 }],
    [[chili(1, 10), chili(2, 8), chili(3, 6), chili(4, 6)], { start: 3, end: 4 }],
  ] as const) {
    const [tie] = service.detectPlacementTies([...rows]);
    assert.deepEqual({ start: tie.start, end: tie.end }, expected);
  }
});

test("a podium tie requires a complete mapping and rejects wrong-group, duplicate, and ineligible selections", async () => {
  const tiedRows = [chili(1, 10), chili(2, 8), chili(3, 6), chili(4, 6), chili(5, 99, "disqualified")];
  const attempts = [
    { input: undefined, code: "TIE_RESOLUTION_REQUIRED" },
    { input: [{ placement: 1, chiliId: 1 }, { placement: 2, chiliId: 2 }, { placement: 3, chiliId: 2 }], code: "INVALID_TIE_RESOLUTION" },
    { input: [{ placement: 1, chiliId: 1 }, { placement: 2, chiliId: 2 }, { placement: 3, chiliId: 5 }], code: "INVALID_TIE_RESOLUTION" },
    { input: [{ placement: 1, chiliId: 2 }, { placement: 2, chiliId: 1 }, { placement: 3, chiliId: 3 }], code: "INVALID_TIE_RESOLUTION" },
  ] as const;
  for (const attempt of attempts) {
    const db = fakeDb([[admin], ...resultSelects(tiedRows)]);
    await assert.rejects(() => new ResultsService(db.db).finalizeResults(9, attempt.input as never), (error: unknown) => error instanceof DomainError && error.code === attempt.code);
    assert.equal(db.batches.length, 0);
  }

  const valid = fakeDb([[admin], ...resultSelects(tiedRows)]);
  const result = await new ResultsService(valid.db).finalizeResults(9, [{ placement: 1, chiliId: 1 }, { placement: 2, chiliId: 2 }, { placement: 3, chiliId: 4 }]);
  assert.deepEqual(result.officialResults.map((row) => row.chiliId), [1, 2, 4]);
});

test("open voting and fewer than three eligible chilis block finalization", async () => {
  const open = fakeDb([[admin], ...resultSelects([chili(1, 3), chili(2, 2), chili(3, 1)], { ...settings, votingIsOpen: true })]);
  await assert.rejects(() => new ResultsService(open.db).finalizeResults(9), (error: unknown) => error instanceof DomainError && error.code === "VOTING_OPEN");
  const short = fakeDb([[admin], ...resultSelects([chili(1, 3), chili(2, 2), chili(3, 10, "inactive")])]);
  await assert.rejects(() => new ResultsService(short.db).finalizeResults(9), (error: unknown) => error instanceof DomainError && error.code === "NOT_ENOUGH_ELIGIBLE_CHILIS");
});

test("a failed finalization batch leaves no separately committed result, event, or audit operation", async () => {
  const db = fakeDb([[admin], ...resultSelects([chili(1, 3), chili(2, 2), chili(3, 1)])], { batchError: new Error("audit failed") });
  await assert.rejects(() => new ResultsService(db.db).finalizeResults(9), /audit failed/);
  assert.equal(db.batches.length, 0);
});

test("reopen accepts an optional reason and atomically replaces official rows without touching votes", async () => {
  const finalSettings = { ...settings, resultsAreFinal: true, resultsFinalizedAt: "earlier", resultsFinalizedByUserId: 9 };
  const official = [{ placement: 1, chiliId: 1, voteCount: 10 }, { placement: 2, chiliId: 2, voteCount: 8 }, { placement: 3, chiliId: 3, voteCount: 6 }];
  const db = fakeDb([[admin], [finalSettings], official]);
  const result = await new ResultsService(db.db).reopenResults(9, "Correcting a podium tie");
  assert.deepEqual(result, { resultsAreFinal: false, votingIsOpen: false, votesPreserved: true });
  assert.equal(db.deletes, 1);
  assert.equal(db.batches[0].length, 3, "official row deletion, final-state clearing, and audit are one batch");
  assert.equal(db.inserts[0].reason, "Correcting a podium tie");
  assert.equal(db.updates[0].resultsAreFinal, false);
  assert.equal("availableVoteCount" in db.updates[0], false);

  const withoutReason = fakeDb([[admin], [finalSettings], official]);
  await new ResultsService(withoutReason.db).reopenResults(9, "  ");
  assert.equal(withoutReason.inserts[0].reason, null);

  const refinalize = fakeDb([[admin], ...resultSelects([chili(1, 10), chili(2, 8), chili(3, 6)])]);
  assert.equal((await new ResultsService(refinalize.db).finalizeResults(9)).resultsAreFinal, true);
});
