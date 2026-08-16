import { getDb } from "@/db";
import { requireAdminRequest } from "@/server/admin-request";
import { dataResponse, errorResponse } from "@/server/http";
import { AdminUserService } from "@/server/services/admin-user-service";
import { ClerkUsernameSyncService } from "@/server/services/clerk-username-sync-service";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    const url = new URL(request.url);
    const db = getDb();
    await new ClerkUsernameSyncService(db).syncAllUsers();
    return dataResponse(await new AdminUserService(db).searchUsers({
      query: url.searchParams.get("q") ?? "",
      role: url.searchParams.get("role") ?? "",
      checkedIn: url.searchParams.get("checkedIn") ?? "",
      noVotes: url.searchParams.get("noVotes") === "true",
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
