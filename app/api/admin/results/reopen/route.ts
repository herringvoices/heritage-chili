import { z } from "zod";
import { getDb } from "@/db";
import { requireAdminRequest } from "@/server/admin-request";
import { dataResponse, errorResponse } from "@/server/http";
import { ResultsService } from "@/server/services/results-service";

const inputSchema = z.object({ reason: z.string().trim().max(1000).optional() });

export async function POST(request: Request) {
  try {
    const admin = await requireAdminRequest(request);
    const input = inputSchema.parse(await request.json());
    return dataResponse(await new ResultsService(getDb()).reopenResults(admin.id, input.reason));
  } catch (error) { return errorResponse(error); }
}
