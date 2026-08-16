import { z } from "zod";
import { getDb } from "@/db";
import { requireAdminRequest } from "@/server/admin-request";
import { dataResponse, errorResponse } from "@/server/http";
import { CheckInService } from "@/server/services/check-in-service";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    const query = z.string().max(100).parse(new URL(request.url).searchParams.get("q") ?? "");
    return dataResponse(await new CheckInService(getDb()).findAttendees(query));
  } catch (error) { return errorResponse(error); }
}
