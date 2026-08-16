import { getDb } from "@/db";
import { requireAdminRequest } from "@/server/admin-request";
import { errorResponse, dataResponse } from "@/server/http";
import { AdminUserService } from "@/server/services/admin-user-service";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminRequest(request);
    return dataResponse(await new AdminUserService(getDb()).listAdmins(admin.id));
  } catch (error) {
    return errorResponse(error);
  }
}
