import { getDb } from "@/db";
import { requireAppUser } from "@/server/app-user";
import { requireAuthenticatedIdentity } from "@/server/auth/clerk";
import { DomainError } from "@/server/domain-error";
import { dataResponse, errorResponse } from "@/server/http";
import { StandingsQueryService } from "@/server/services/standings-query-service";

export async function GET(request: Request) {
  try {
    const identity = await requireAuthenticatedIdentity(request);
    const user = await requireAppUser(identity.clerkUserId);
    if (!user.registrationCompletedAt || !user.role || user.role === "admin") throw new DomainError("ATTENDEE_REQUIRED", "Complete attendee registration to view standings.", 403);
    return dataResponse(await new StandingsQueryService(getDb()).getPublicStandings());
  } catch (error) { return errorResponse(error); }
}
