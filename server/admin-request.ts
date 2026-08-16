import { requireAppUser } from "./app-user";
import { requireAuthenticatedIdentity } from "./auth/clerk";
import { DomainError } from "./domain-error";

export async function requireAdminRequest(request: Request) {
  const identity = await requireAuthenticatedIdentity(request);
  const user = await requireAppUser(identity.clerkUserId);
  if (user.role !== "admin" || !user.registrationCompletedAt) {
    throw new DomainError("ADMIN_REQUIRED", "Administrator access is required.", 403);
  }
  return user;
}
