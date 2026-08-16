import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

async function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of ["0000_parched_scream.sql", "0001_organic_shaman.sql", "0005_demonic_rafael_vega.sql"]) {
    db.exec((await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8")).replaceAll("--> statement-breakpoint", ""));
  }
  db.prepare("insert into users (clerk_user_id,email,display_name,role) values (?,?,?,?)").run("real-admin", "organizer@example.com", "Old Admin", "admin");
  db.prepare("insert into users (clerk_user_id,email,display_name,role) values (?,?,?,?)").run("real-guest", "guest@test.com", "Old Guest", "guest");
  db.prepare("insert into users (clerk_user_id,email,display_name,role) values (?,?,?,?)").run("real-entrant", "entrant@test.com", "Old Entrant", "contestant");
  return db;
}

async function apply(db: DatabaseSync, profile: "baseline" | "full-swing") {
  db.exec(await readFile(new URL(`../scripts/reset-profiles/${profile}.sql`, import.meta.url), "utf8"));
}

test("baseline removes all event activity while preserving settings and reference tags", async () => {
  const db = await database();
  db.prepare("update event_settings set gofundme_url=?, pledge_goal_cents=? where id=1").run("https://www.gofundme.com/f/kept-link", 123456);
  await apply(db, "baseline");
  assert.equal((db.prepare("select count(*) as count from users").get() as { count: number }).count, 0);
  assert.deepEqual({ ...db.prepare("select voting_is_open as votingIsOpen,results_are_final as resultsAreFinal from event_settings where id=1").get() }, { votingIsOpen: 0, resultsAreFinal: 0 });
  assert.deepEqual({ ...db.prepare("select gofundme_url as gofundmeUrl,pledge_goal_cents as pledgeGoalCents from event_settings where id=1").get() }, { gofundmeUrl: "https://www.gofundme.com/f/kept-link", pledgeGoalCents: 123456 });
  assert.equal((db.prepare("select count(*) as count from tags").get() as { count: number }).count, 6);
  for (const table of ["chilis", "chili_votes", "pledges", "audit_entries", "user_notice_states"]) assert.equal((db.prepare(`select count(*) as count from ${table}`).get() as { count: number }).count, 0);
});

test("baseline restores the standard GoFundMe link when the stored override is empty", async () => {
  const db = await database();
  db.prepare("update event_settings set gofundme_url=null where id=1").run();
  await apply(db, "baseline");
  assert.match((db.prepare("select gofundme_url as url from event_settings where id=1").get() as { url: string }).url, /^https:\/\/www\.gofundme\.com\/f\/Heritage-family-adoption-fund\?/);
});

test("full-swing preserves sign-in identities and creates a consistent live event", async () => {
  const db = await database();
  await apply(db, "full-swing");
  assert.equal((db.prepare("select count(*) as count from users").get() as { count: number }).count, 25);
  assert.equal((db.prepare("select count(*) as count from chilis").get() as { count: number }).count, 9);
  assert.equal((db.prepare("select count(*) as count from chili_votes").get() as { count: number }).count, 40);
  assert.equal((db.prepare("select coalesce(sum(amount_cents),0) as cents from pledges").get() as { cents: number }).cents, 85000);
  assert.deepEqual(db.prepare("select email,clerk_user_id as clerkUserId from users where email like '%@test.com' order by email").all().map((row) => ({ ...row })), [
    { email: "entrant@test.com", clerkUserId: "real-entrant" },
    { email: "guest@test.com", clerkUserId: "real-guest" },
  ]);
  assert.equal((db.prepare("select count(*) as count from users where available_vote_count < 0").get() as { count: number }).count, 0);
  assert.equal((db.prepare("select count(*) as count from users u where issued_vote_count - available_vote_count != (select count(*) from chili_votes v where v.user_id=u.id)").get() as { count: number }).count, 0);
  assert.deepEqual(db.prepare("select chili_id as chiliId,count(*) as votes from chili_votes group by chili_id order by votes desc,chili_id").all().map((row) => ({ ...row })), [
    { chiliId: 1, votes: 11 }, { chiliId: 2, votes: 10 }, { chiliId: 3, votes: 8 },
    { chiliId: 4, votes: 6 }, { chiliId: 5, votes: 4 }, { chiliId: 6, votes: 1 },
  ]);
});
