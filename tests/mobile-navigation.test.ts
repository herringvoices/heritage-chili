import assert from "node:assert/strict";
import test from "node:test";
import { navigationForRole } from "../components/mobile-navigation";

test("mobile navigation exposes role-appropriate destinations", () => {
  const guest = navigationForRole("guest").map((item) => item.label);
  const contestant = navigationForRole("contestant").map((item) => item.label);
  const admin = navigationForRole("admin").map((item) => item.label);

  assert.deepEqual(guest, ["Dashboard", "Chilis", "Standings", "Get more votes"]);
  assert.deepEqual(contestant, ["Dashboard", "My chili", "Chilis", "Standings", "Get more votes"]);
  assert.deepEqual(admin, ["Overview", "Check in", "Attendees", "Chilis", "Pledges", "Event", "Results", "Audit"]);
});
