import assert from "node:assert/strict";
import test from "node:test";
import { redirectForGate, type GuardedUserContext } from "@/components/route-guard";
import { DomainError } from "@/server/domain-error";
import { requireAdmin, requireContestant, requireEnabledParticipant, requireRegisteredUser } from "@/server/guards";
import type { CurrentUserContext } from "@/server/services/identity-service";

function context(overrides: Partial<CurrentUserContext> = {}): CurrentUserContext {
  return {
    id: 1,
    email: "fan@example.com",
    displayName: "Fire Fan",
    registrationState: "registered",
    role: "guest",
    isAdmin: false,
    hasInitialPledge: true,
    checkedIn: false,
    participation: { disabled: false, reason: null, canMutate: true },
    entryRoute: "/dashboard",
    ...overrides,
  };
}

function assertDomainCode(action: () => void, code: string) {
  assert.throws(action, (error: unknown) => error instanceof DomainError && error.code === code);
}

test("server guards enforce registration, contestant, admin, and enabled participation", () => {
  assertDomainCode(() => requireRegisteredUser(context({ registrationState: "status4", role: null })), "REGISTRATION_REQUIRED");
  assertDomainCode(() => requireContestant(context()), "CONTESTANT_REQUIRED");
  assert.doesNotThrow(() => requireContestant(context({ role: "contestant" })));
  assertDomainCode(() => requireAdmin(context()), "ADMIN_REQUIRED");
  assert.doesNotThrow(() => requireAdmin(context({ role: "admin", isAdmin: true, entryRoute: "/admin" })));
  assertDomainCode(() => requireEnabledParticipant(context({ participation: { disabled: true, reason: "Paused", canMutate: false } })), "PARTICIPATION_DISABLED");
});

test("typed entry URLs redirect every account state to its canonical route", () => {
  const status4: GuardedUserContext = { registrationState: "status4", role: null, isAdmin: false, hasInitialPledge: false, entryRoute: "/register" };
  const inProgress: GuardedUserContext = { registrationState: "registered", role: "guest", isAdmin: false, hasInitialPledge: false, entryRoute: "/pledge" };
  const guest: GuardedUserContext = { registrationState: "registered", role: "guest", isAdmin: false, hasInitialPledge: true, entryRoute: "/dashboard" };
  const contestant: GuardedUserContext = { registrationState: "registered", role: "contestant", isAdmin: false, hasInitialPledge: true, entryRoute: "/dashboard" };
  const admin: GuardedUserContext = { registrationState: "registered", role: "admin", isAdmin: true, hasInitialPledge: false, entryRoute: "/admin" };

  assert.equal(redirectForGate("status4", status4), null);
  assert.equal(redirectForGate("registered", status4), "/register");
  assert.equal(redirectForGate("admin", guest), "/dashboard");
  assert.equal(redirectForGate("contestant", guest), "/dashboard");
  assert.equal(redirectForGate("contestant", contestant), null);
  assert.equal(redirectForGate("pledge", contestant), "/dashboard");
  assert.equal(redirectForGate("thankYou", guest), null);
  assert.equal(redirectForGate("pledge", status4), "/register");
  assert.equal(redirectForGate("status4", contestant), "/dashboard");
  assert.equal(redirectForGate("status4", inProgress), null);
  assert.equal(redirectForGate("pledge", inProgress), null);
  assert.equal(redirectForGate("registered", inProgress), "/pledge");
  assert.equal(redirectForGate("thankYou", inProgress), "/pledge");
  assert.equal(redirectForGate("registered", admin), "/admin");
  assert.equal(redirectForGate("admin", admin), null);
  assert.equal(redirectForGate("public", guest), "/dashboard");
});
