import { z } from "zod";
import { getDb } from "@/db";
import { requireAdminRequest } from "@/server/admin-request";
import { dataResponse, errorResponse } from "@/server/http";
import { ResultsService } from "@/server/services/results-service";

const inputSchema = z.object({
  placements: z.array(z.object({ placement: z.number().int().min(1).max(3), chiliId: z.number().int().positive() })).length(3).optional(),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdminRequest(request);
    const input = inputSchema.parse(await request.json().catch(() => ({})));
    return dataResponse(await new ResultsService(getDb()).finalizeResults(admin.id, input.placements));
  } catch (error) { return errorResponse(error); }
}
