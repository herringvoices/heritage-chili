import { getDb } from "@/db";
import { requireAppUser } from "@/server/app-user";
import { requireAuthenticatedIdentity } from "@/server/auth/clerk";
import { dataResponse, errorResponse } from "@/server/http";
import { DashboardQueryService } from "@/server/services/dashboard-query-service";

export async function GET(request: Request) {
  try {
    const identity = await requireAuthenticatedIdentity(request);
    const user = await requireAppUser(identity.clerkUserId);
    return dataResponse(await new DashboardQueryService(getDb()).getAttendeeDashboard(user.id));
  } catch (error) { return errorResponse(error); }
}
