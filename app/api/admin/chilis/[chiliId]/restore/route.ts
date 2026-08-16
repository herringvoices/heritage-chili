import { z } from "zod";
import { getDb } from "@/db";
import { requireAdminRequest } from "@/server/admin-request";
import { dataResponse, errorResponse } from "@/server/http";
import { AdminChiliService } from "@/server/services/admin-chili-service";
const schema = z.object({ status: z.enum(["draft", "active"]), reason: z.string().max(500).optional(), physicalArrived: z.boolean().optional() }).strict();
export async function POST(request: Request, context: { params: Promise<{ chiliId: string }> }) {
  try { const admin = await requireAdminRequest(request); const id = z.coerce.number().int().positive().parse((await context.params).chiliId); const input = schema.parse(await request.json()); return dataResponse(await new AdminChiliService(getDb()).restoreChili(admin.id, id, input.status, input.reason, input.physicalArrived)); }
  catch (error) { return errorResponse(error); }
}
