import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "@/server/domain-error";
import { ChiliImageService, MAX_CHILI_IMAGE_BYTES } from "@/server/services/chili-image-service";
import { ChiliService } from "@/server/services/chili-service";
import { chiliIsComplete, DashboardQueryService } from "@/server/services/dashboard-query-service";

function fakeDb(selects: unknown[][], options: { updateError?: Error } = {}) {
  let selectIndex = 0;
  const updates: Record<string, unknown>[] = [];
  const batches: unknown[][] = [];
  const makeResult = (value: unknown[]) => {
    const result: Record<string, unknown> = {};
    const resolve = () => Promise.resolve(value);
    result.then = (onFulfilled: (rows: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => resolve().then(onFulfilled, onRejected);
    for (const method of ["from", "where", "limit", "orderBy", "innerJoin", "groupBy"]) result[method] = () => result;
    return result;
  };
  const db = {
    select: () => makeResult(selects[selectIndex++] ?? []),
    update: () => ({ set: (values: Record<string, unknown>) => {
      updates.push(values);
      return { where: async () => { if (options.updateError) throw options.updateError; return []; } };
    } }),
    delete: () => ({ where: () => ({ kind: "delete" }) }),
    insert: () => ({ values: () => ({ returning: async () => [{ id: 99 }], kind: "insert" }) }),
    batch: async (statements: unknown[]) => { batches.push(statements); return []; },
  };
  return { db: db as never, updates, batches, get selectCount() { return selectIndex; } };
}

const guest = {
  id: 7, displayName: "Ember", role: "guest", registrationCompletedAt: "2026-07-21T00:00:00Z", partySize: 3,
  checkedInAt: null, checkInCode: "0042", participationDisabledAt: null, participationDisabledReason: null,
  issuedVoteCount: 3, availableVoteCount: 1,
};
const contestant = { ...guest, role: "contestant" };
const settings = { id: 1, votingIsOpen: false, resultsAreFinal: false, suggestedChiliEntryCents: 1000 };
const draft = { id: 12, cookUserId: 7, name: null, description: null, spiceLevel: null, imageObjectKey: null, status: "draft", createdAt: "", updatedAt: "" };

test("dashboard builds private guest and contestant read models with grouped votes", async () => {
  const guestDb = fakeDb([[guest], [settings], [{ total: 2500 }], [{ present: 1 }], [{ chiliId: 4, chiliName: "Cozy Pot", count: 2 }], []]);
  const guestModel = await new DashboardQueryService(guestDb.db).getAttendeeDashboard(7);
  assert.equal(guestModel.attendee.role, "guest");
  assert.deepEqual(guestModel.votes.history, [{ chiliId: 4, chiliName: "Cozy Pot", count: 2 }]);
  assert.equal(guestModel.votes.usableNow, false, "allocated votes remain unavailable before check-in");
  assert.equal(guestModel.pledges.totalCents, 2500);
  assert.equal(guestModel.event.suggestedChiliEntryCents, 1000);
  assert.equal(guestModel.event.chiliEntryIsOpen, true);
  assert.equal(guestModel.chili, null);
  assert.equal("id" in guestModel.attendee, false);
  assert.doesNotMatch(JSON.stringify(guestModel), /clerk|objectKey|otherUser/i);

  const contestantDb = fakeDb([[contestant], [settings], [{ total: 0 }], [], [], [draft], []]);
  const contestantModel = await new DashboardQueryService(contestantDb.db).getAttendeeDashboard(7);
  assert.equal(contestantModel.attendee.role, "contestant");
  assert.equal(contestantModel.pledges.hasInitial, false);
  assert.equal(contestantModel.chili?.complete, false);
  assert.equal(contestantModel.chili?.status, "draft");
  assert.equal(contestantModel.event.chiliEntryIsOpen, false);
});

test("dashboard exposes closed, disabled, inactive, and empty states without leaking another attendee", async () => {
  const inactive = { ...draft, name: "Quiet Fire", description: "Smoky and rich", spiceLevel: 2, status: "inactive" };
  const disabled = { ...contestant, checkedInAt: "2026-07-21T18:00:00Z", participationDisabledAt: "2026-07-21T18:30:00Z", participationDisabledReason: "Organizer review" };
  const db = fakeDb([[disabled], [settings], [{ total: 0 }], [], [], [inactive], []]);
  const model = await new DashboardQueryService(db.db).getAttendeeDashboard(7);
  assert.equal(model.event.votingIsOpen, false);
  assert.equal(model.attendee.participation.disabled, true);
  assert.equal(model.votes.history.length, 0);
  assert.equal(model.votes.usableNow, false);
  assert.equal(model.chili?.status, "inactive");
});

test("chili completion requires title, description, and an integer heat level from zero through five", () => {
  assert.equal(chiliIsComplete({ name: "Mild Thing", description: "Still flavorful", spiceLevel: 0 }), true);
  assert.equal(chiliIsComplete({ name: " ", description: "Still flavorful", spiceLevel: 3 }), false);
  assert.equal(chiliIsComplete({ name: "Hot Pot", description: "", spiceLevel: 5 }), false);
  assert.equal(chiliIsComplete({ name: "Hot Pot", description: "Bright", spiceLevel: 6 }), false);
});

test("the chili list uses a fixed five reads regardless of chili count", async () => {
  const chilis = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    name: `Pot ${index + 1}`,
    description: "A fine chili",
    spiceLevel: index % 6,
    imageObjectKey: null,
    contestantName: `Cook ${index + 1}`,
  }));
  const tagRows = chilis.map((chili) => ({ chiliId: chili.id, id: 1, name: "Vegan", slug: "vegan" }));
  const personalRows = [{ chiliId: 3, count: 2 }];
  const fixture = fakeDb([[guest], [settings], chilis, tagRows, personalRows]);

  const result = await new ChiliService(fixture.db).listActiveChilis(guest.id);

  assert.equal(result.length, 20);
  assert.equal(result[2]?.personalVoteCount, 2);
  assert.deepEqual(result[0]?.tags, [{ id: 1, name: "Vegan", slug: "vegan" }]);
  assert.equal(fixture.selectCount, 5);
});

test("chili editing enforces ownership, contestant role, unique names, tags, and heat", async () => {
  const input = { name: "Sunday Best", description: "Smoky and bright", spiceLevel: 3, tagIds: [] };
  const strangerDb = fakeDb([[{ ...guest, id: 8 }], [draft]]);
  await assert.rejects(() => new ChiliService(strangerDb.db).updateOwnedChili(8, 12, input), (error: unknown) => error instanceof DomainError && error.code === "CHILI_EDIT_FORBIDDEN");

  const guestDb = fakeDb([[guest]]);
  await assert.rejects(() => new ChiliService(guestDb.db).getOwnedChili(7), (error: unknown) => error instanceof DomainError && error.code === "CONTESTANT_REQUIRED");

  const collisionDb = fakeDb([[contestant], [draft], [{ id: 44 }]]);
  await assert.rejects(() => new ChiliService(collisionDb.db).updateOwnedChili(7, 12, input), (error: unknown) => error instanceof DomainError && error.code === "CHILI_NAME_TAKEN");

  const tagsDb = fakeDb([[contestant], [draft], []]);
  await assert.rejects(() => new ChiliService(tagsDb.db).updateOwnedChili(7, 12, { ...input, tagIds: [999] }), (error: unknown) => error instanceof DomainError && error.code === "INVALID_TAGS");

  const heatDb = fakeDb([]);
  await assert.rejects(() => new ChiliService(heatDb.db).updateOwnedChili(7, 12, { ...input, spiceLevel: 9 }), (error: unknown) => error instanceof DomainError && error.code === "INVALID_SPICE_LEVEL");
});

test("one contestant cannot create a second chili", async () => {
  const db = fakeDb([[contestant], [{ id: 12 }]]);
  await assert.rejects(() => new ChiliService(db.db).createOwnedChili(7, { name: "Another", description: "Nope", spiceLevel: 1, tagIds: [] }), (error: unknown) => error instanceof DomainError && error.code === "CHILI_ALREADY_EXISTS");
});

test("a participation-disabled contestant keeps read access but cannot change chili details", async () => {
  const disabledContestant = { ...contestant, participationDisabledAt: "2026-07-21T18:30:00Z" };
  const db = fakeDb([[disabledContestant], [draft]]);
  await assert.rejects(() => new ChiliService(db.db).updateOwnedChili(7, 12, { name: "Still Here", description: "Preserved", spiceLevel: 2, tagIds: [] }), (error: unknown) => error instanceof DomainError && error.code === "PARTICIPATION_DISABLED");
});

function fakeBucket(options: { deleteFails?: boolean } = {}) {
  const puts: string[] = [];
  const deletes: string[] = [];
  return {
    puts, deletes,
    bucket: {
      put: async (key: string) => { puts.push(key); },
      delete: async (key: string) => { deletes.push(key); if (options.deleteFails) throw new Error("cleanup failed"); },
      get: async () => null,
    } as never,
  };
}

test("image service rejects invalid files and safely replaces or removes images", async () => {
  const owned = { ...draft, imageObjectKey: "chilis/12/old.jpg" };
  const invalidTypeDb = fakeDb([[contestant], [owned]]);
  await assert.rejects(() => new ChiliImageService(invalidTypeDb.db, fakeBucket().bucket).upload(7, 12, new File(["text"], "notes.txt", { type: "text/plain" })), (error: unknown) => error instanceof DomainError && error.code === "INVALID_IMAGE_TYPE");

  const tooLargeDb = fakeDb([[contestant], [owned]]);
  const tooLarge = new File([new Uint8Array(MAX_CHILI_IMAGE_BYTES + 1)], "huge.png", { type: "image/png" });
  await assert.rejects(() => new ChiliImageService(tooLargeDb.db, fakeBucket().bucket).upload(7, 12, tooLarge), (error: unknown) => error instanceof DomainError && error.code === "INVALID_IMAGE_SIZE");

  const replaceDb = fakeDb([[contestant], [owned]]);
  const cleanupFailure = fakeBucket({ deleteFails: true });
  const result = await new ChiliImageService(replaceDb.db, cleanupFailure.bucket).upload(7, 12, new File(["image"], "new.webp", { type: "image/webp" }));
  assert.equal(result.imageUrl, "/api/chilis/12/image");
  assert.equal(cleanupFailure.puts.length, 1);
  assert.deepEqual(cleanupFailure.deletes, ["chilis/12/old.jpg"]);
  assert.match(String(replaceDb.updates[0].imageObjectKey), /^chilis\/12\/.+\.webp$/);

  const removeDb = fakeDb([[contestant], [owned]]);
  await new ChiliImageService(removeDb.db, fakeBucket({ deleteFails: true }).bucket).remove(7, 12);
  assert.equal(removeDb.updates[0].imageObjectKey, null);
});

test("failed image record update cleans the new object and keeps the previous reference untouched", async () => {
  const owned = { ...draft, imageObjectKey: "chilis/12/current.png" };
  const db = fakeDb([[contestant], [owned]], { updateError: new Error("database unavailable") });
  const storage = fakeBucket();
  await assert.rejects(() => new ChiliImageService(db.db, storage.bucket).upload(7, 12, new File(["image"], "new.png", { type: "image/png" })), /database unavailable/);
  assert.equal(storage.puts.length, 1);
  assert.deepEqual(storage.deletes, [storage.puts[0]], "only the unreferenced replacement is cleaned up");
  assert.notEqual(storage.deletes[0], owned.imageObjectKey);
});
