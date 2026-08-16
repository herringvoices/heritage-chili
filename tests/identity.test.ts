import assert from "node:assert/strict";
import test from "node:test";
import { IdentityService } from "@/server/services/identity-service";

type Row = {
  id: number;
  clerkUserId: string;
  email: string;
  displayName: string | null;
  role: "guest" | "contestant" | "admin" | null;
  registrationCompletedAt: string | null;
  checkedInAt: string | null;
  participationDisabledAt: string | null;
  participationDisabledReason: string | null;
};

function fakeDb(initial?: Partial<Row>, hasInitialPledge = false) {
  const rows: Row[] = initial ? [{ id: 1, clerkUserId: "clerk_1", email: "old@example.com", displayName: null, role: null, registrationCompletedAt: null, checkedInAt: null, participationDisabledAt: null, participationDisabledReason: null, ...initial }] : [];
  const db = {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
          const existing = rows.find((row) => row.clerkUserId === values.clerkUserId);
          if (existing) Object.assign(existing, set);
          else rows.push({ id: rows.length + 1, displayName: null, role: null, registrationCompletedAt: null, checkedInAt: null, participationDisabledAt: null, participationDisabledReason: null, ...values } as Row);
        },
      }),
    }),
    select: (fields?: Record<string, unknown>) => ({ from: () => ({ where: () => ({ limit: async () => fields ? (hasInitialPledge ? [{ id: 1 }] : []) : rows.slice(0, 1) }) }) }),
  };
  return { rows, service: new IdentityService(db as never) };
}

test("first and repeated identity sync create one account and mirror Clerk username and email", async () => {
  const { rows, service } = fakeDb();
  await service.syncAuthenticatedUser({ clerkUserId: "clerk_1", email: "first@example.com", username: "SmokyNick" });
  rows[0].role = "guest";
  await service.syncAuthenticatedUser({ clerkUserId: "clerk_1", email: "new@example.com", username: "NewSmokyNick" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, "new@example.com");
  assert.equal(rows[0].displayName, "NewSmokyNick");
  assert.equal(rows[0].role, "guest");
});

test("identity sync preserves the stored username when Clerk does not return one", async () => {
  const { rows, service } = fakeDb({ displayName: "SmokyNick" });
  await service.syncAuthenticatedUser({ clerkUserId: "clerk_1", email: "new@example.com", username: null });
  assert.equal(rows[0].displayName, "SmokyNick");
});

test("concurrent identity sync remains one logical account", async () => {
  const { rows, service } = fakeDb();
  await Promise.all(Array.from({ length: 5 }, () => service.syncAuthenticatedUser({ clerkUserId: "clerk_1", email: "same@example.com" })));
  assert.equal(rows.length, 1);
});

test("an existing Clerk identity signs in when the current token omits email", async () => {
  const { rows, service } = fakeDb({ email: "remembered@example.com" });
  await service.syncAuthenticatedUser({ clerkUserId: "clerk_1", email: null });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, "remembered@example.com");
});

for (const account of [
  { email: "guest@test.com", seededClerkUserId: "seed_guest_test", role: "guest" as const },
  { email: "entrant@test.com", seededClerkUserId: "seed_entrant_test", role: "contestant" as const },
]) {
  test(`the ${account.role} rehearsal account adopts its real Clerk identity on sign-in`, async () => {
    const row: Row = {
      id: 7,
      clerkUserId: account.seededClerkUserId,
      email: account.email,
      displayName: account.role === "guest" ? "Pepper Pal" : "Smoky Sam",
      role: account.role,
      registrationCompletedAt: "2026-07-22T13:05:00Z",
      checkedInAt: "2026-07-22T14:01:00Z",
      participationDisabledAt: null,
      participationDisabledReason: null,
    };
    let selectCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              selectCount += 1;
              if (selectCount === 1) return [];
              return [row];
            },
          }),
        }),
      }),
      update: () => ({
        set: (values: Partial<Row>) => ({
          where: async () => { Object.assign(row, values); },
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: async ({ set }: { set: Partial<Row> }) => { Object.assign(row, set); },
        }),
      }),
    };

    const service = new IdentityService(db as never);
    await service.syncAuthenticatedUser({ clerkUserId: `real_${account.role}`, email: account.email });

    assert.equal(row.clerkUserId, `real_${account.role}`);
    assert.equal(row.role, account.role);
    assert.equal(row.registrationCompletedAt, "2026-07-22T13:05:00Z");
  });
}

test("a blank duplicate test login is merged back into its seeded rehearsal profile", async () => {
  const duplicate: Row = {
    id: 27,
    clerkUserId: "real_guest",
    email: "guest@test.com",
    displayName: null,
    role: null,
    registrationCompletedAt: null,
    checkedInAt: null,
    participationDisabledAt: null,
    participationDisabledReason: null,
  };
  const seeded: Row = {
    id: 2,
    clerkUserId: "seed_guest_test",
    email: "guest@test.com",
    displayName: "Pepper Pal",
    role: "guest",
    registrationCompletedAt: "2026-07-22T13:05:00Z",
    checkedInAt: "2026-07-22T14:01:00Z",
    participationDisabledAt: null,
    participationDisabledReason: null,
  };
  let selectCount = 0;
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            selectCount += 1;
            return selectCount === 1 ? [duplicate] : [seeded];
          },
        }),
      }),
    }),
    delete: () => ({ where: () => ({ kind: "delete" }) }),
    update: () => ({
      set: (values: Partial<Row>) => ({
        where: () => ({ kind: "update", values }),
      }),
    }),
    batch: async (operations: Array<{ kind: string; values?: Partial<Row> }>) => {
      assert.deepEqual(operations.map((operation) => operation.kind), ["delete", "update"]);
      Object.assign(seeded, operations[1].values);
    },
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async ({ set }: { set: Partial<Row> }) => { Object.assign(seeded, set); },
      }),
    }),
  };

  const service = new IdentityService(db as never);
  const result = await service.syncAuthenticatedUser({ clerkUserId: "real_guest", email: "guest@test.com" });

  assert.equal(seeded.clerkUserId, "real_guest");
  assert.equal(result.id, seeded.id);
  assert.equal(result.role, "guest");
});

test("a brand-new identity still requires an email before account creation", async () => {
  const { service } = fakeDb();
  await assert.rejects(
    service.syncAuthenticatedUser({ clerkUserId: "clerk_1", email: null }),
    (error: Error & { code?: string }) => error.code === "IDENTITY_EMAIL_REQUIRED",
  );
});

test("status 4, attendee, admin, and disabled contexts choose deterministic entry routes", async () => {
  const status4 = fakeDb();
  await status4.service.syncAuthenticatedUser({ clerkUserId: "clerk_1", email: "one@example.com" });
  assert.equal((await status4.service.getCurrentUserContext("clerk_1")).entryRoute, "/register");

  const pending = fakeDb({ role: "guest", registrationCompletedAt: "2026-07-21T00:00:00.000Z" });
  assert.equal((await pending.service.getCurrentUserContext("clerk_1")).entryRoute, "/pledge");

  const guest = fakeDb({ role: "guest", registrationCompletedAt: "2026-07-21T00:00:00.000Z" }, true);
  assert.equal((await guest.service.getCurrentUserContext("clerk_1")).entryRoute, "/dashboard");

  const contestant = fakeDb({ role: "contestant", registrationCompletedAt: "2026-07-21T00:00:00.000Z", participationDisabledAt: "2026-07-21T01:00:00.000Z", participationDisabledReason: "See an organizer." }, true);
  const disabled = await contestant.service.getCurrentUserContext("clerk_1");
  assert.equal(disabled.entryRoute, "/dashboard");
  assert.equal(disabled.participation.canMutate, false);

  const admin = fakeDb({ role: "admin", registrationCompletedAt: "2026-07-21T00:00:00.000Z" });
  assert.equal((await admin.service.getCurrentUserContext("clerk_1")).entryRoute, "/admin");
});

test("the former bootstrap organizer identity follows the normal registration flow", async () => {
  const clerkUserId = "user_example_bootstrap";
  const { rows, service } = fakeDb();
  await service.syncAuthenticatedUser({ clerkUserId, email: "organizer@example.com" });
  assert.equal(rows[0].role, null);
  assert.equal(rows[0].registrationCompletedAt, null);
});

test("the production organizer identity follows the normal registration flow", async () => {
  const clerkUserId = "user_example_production";
  const { rows, service } = fakeDb();
  await service.syncAuthenticatedUser({ clerkUserId, email: "organizer@example.com" });
  assert.equal(rows[0].role, null);
  assert.equal(rows[0].registrationCompletedAt, null);
});
