import { getDb } from "@/db";
import { requireAppUser } from "@/server/app-user";
import { requireAuthenticatedIdentity } from "@/server/auth/clerk";
import { dataResponse, errorResponse } from "@/server/http";
import { ChiliService } from "@/server/services/chili-service";
import { DomainError } from "@/server/domain-error";

export async function GET(request: Request) {
  try {
    const identity = await requireAuthenticatedIdentity(request);
    const user = await requireAppUser(identity.clerkUserId);
    if (!user.registrationCompletedAt || !user.role) throw new DomainError("REGISTRATION_REQUIRED", "Please finish registration first.", 403);
    return dataResponse(await new ChiliService(getDb()).listAvailableTags());
  } catch (error) { return errorResponse(error); }
}
