import type { CurrentUserContext } from "./services/identity-service";
import { DomainError } from "./domain-error";

export function requireRegisteredUser(context: CurrentUserContext) {
  if (context.registrationState !== "registered") throw new DomainError("REGISTRATION_REQUIRED", "Please finish registration first.", 403);
}

export function requireAdmin(context: CurrentUserContext) {
  if (!context.isAdmin) throw new DomainError("ADMIN_REQUIRED", "Administrator access is required.", 403);
}

export function requireContestant(context: CurrentUserContext) {
  requireRegisteredUser(context);
  if (context.role !== "contestant") throw new DomainError("CONTESTANT_REQUIRED", "Contestant access is required.", 403);
}

export function requireEnabledParticipant(context: CurrentUserContext) {
  requireRegisteredUser(context);
  if (context.participation.disabled) throw new DomainError("PARTICIPATION_DISABLED", "Participation is currently disabled for this account.", 403);
}
