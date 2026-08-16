import assert from "node:assert/strict";
import test from "node:test";
import { ClerkUsernameSyncService } from "@/server/services/clerk-username-sync-service";

test("Clerk username backfill replaces legacy names for every real Clerk user", async () => {
  const rows = [
    { id: 1, clerkUserId: "user_nick", displayName: "Nick Homoelle" },
    { id: 2, clerkUserId: "user_hannah", displayName: null },
    { id: 3, clerkUserId: "seed_guest_test", displayName: "Pepper Pal" },
  ];
  let pending: Record<string, unknown> = {};
  let updateIndex = 0;
  const db = {
    select: () => ({ from: () => ({ limit: async () => rows }) }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        pending = values;
        return {
          where: async () => {
            const target = rows.filter((row) => row.clerkUserId.startsWith("user_"))[updateIndex++];
            if (target) target.displayName = String(pending.displayName);
          },
        };
      },
    }),
  };
  const usernames: Record<string, string> = {
    user_nick: "anhomily",
    user_hannah: "hannah",
  };

  const changed = await new ClerkUsernameSyncService(
    db as never,
    async (clerkUserId) => ({ email: null, username: usernames[clerkUserId] ?? null }),
  ).syncAllUsers();

  assert.equal(changed, 2);
  assert.deepEqual(rows.map((row) => row.displayName), ["anhomily", "hannah", "Pepper Pal"]);
});
