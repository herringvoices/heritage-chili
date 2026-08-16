import { z } from "zod";
import { getDb } from "@/db";
import { requireAdminRequest } from "@/server/admin-request";
import { dataResponse, errorResponse } from "@/server/http";
import { AdminChiliService } from "@/server/services/admin-chili-service";
const schema = z.object({ reason: z.string().max(500).optional() }).strict();
export async function POST(request: Request, context: { params: Promise<{ chiliId: string }> }) {
  try { const admin = await requireAdminRequest(request); const id = z.coerce.number().int().positive().parse((await context.params).chiliId); return dataResponse(await new AdminChiliService(getDb()).disqualifyChili(admin.id, id, schema.parse(await request.json()).reason)); }
  catch (error) { return errorResponse(error); }
}
