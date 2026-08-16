import { getDb } from "@/db";
import { requireAdminRequest } from "@/server/admin-request";
import { dataResponse, errorResponse } from "@/server/http";
import { ResultsService } from "@/server/services/results-service";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    return dataResponse(await new ResultsService(getDb()).getAdminResults());
  } catch (error) { return errorResponse(error); }
}
