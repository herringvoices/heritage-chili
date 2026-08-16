import { getDb } from "@/db";
import { requireAdminRequest } from "@/server/admin-request";
import { dataResponse, errorResponse } from "@/server/http";
import { AdminChiliService } from "@/server/services/admin-chili-service";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    return dataResponse(await new AdminChiliService(getDb()).listAllChilis());
  } catch (error) { return errorResponse(error); }
}
