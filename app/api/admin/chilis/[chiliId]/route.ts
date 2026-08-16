import { z } from "zod";
import { getDb } from "@/db";
import { requireAdminRequest } from "@/server/admin-request";
import { dataResponse, errorResponse } from "@/server/http";
import { AdminChiliService } from "@/server/services/admin-chili-service";

const inputSchema = z.object({ name: z.string().max(100), description: z.string().max(2000), spiceLevel: z.number().int().min(0).max(5), tagIds: z.array(z.number().int().positive()).max(20) }).strict();
async function contextFor(request: Request, context: { params: Promise<{ chiliId: string }> }) {
  const admin = await requireAdminRequest(request);
  return { admin, chiliId: z.coerce.number().int().positive().parse((await context.params).chiliId) };
}
export async function GET(request: Request, context: { params: Promise<{ chiliId: string }> }) {
  try { const { chiliId } = await contextFor(request, context); return dataResponse(await new AdminChiliService(getDb()).getAdminChiliDetails(chiliId)); }
  catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request, context: { params: Promise<{ chiliId: string }> }) {
  try { const { admin, chiliId } = await contextFor(request, context); return dataResponse(await new AdminChiliService(getDb()).editChiliAsAdmin(admin.id, chiliId, inputSchema.parse(await request.json()))); }
  catch (error) { return errorResponse(error); }
}
