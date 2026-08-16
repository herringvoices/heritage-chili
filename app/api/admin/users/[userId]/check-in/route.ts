import { z } from "zod";
import { getDb } from "@/db";
import { requireAdminRequest } from "@/server/admin-request";
import { dataResponse, errorResponse } from "@/server/http";
import { CheckInService } from "@/server/services/check-in-service";

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdminRequest(request);
    const userId = z.coerce.number().int().positive().parse((await context.params).userId);
    return dataResponse(await new CheckInService(getDb()).checkInAttendee(admin.id, userId));
  } catch (error) { return errorResponse(error); }
}
