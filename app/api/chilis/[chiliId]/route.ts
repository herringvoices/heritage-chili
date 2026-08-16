import { z } from "zod";
import { getDb } from "@/db";
import { requireAppUser } from "@/server/app-user";
import { requireAuthenticatedIdentity } from "@/server/auth/clerk";
import { dataResponse, errorResponse } from "@/server/http";
import { ChiliService } from "@/server/services/chili-service";

const inputSchema = z.object({ name: z.string().max(100), description: z.string().max(2000), spiceLevel: z.number().int().min(0).max(5), tagIds: z.array(z.number().int().positive()).max(20) }).strict();

export async function GET(request: Request, context: { params: Promise<{ chiliId: string }> }) {
  try {
    const identity = await requireAuthenticatedIdentity(request);
    const user = await requireAppUser(identity.clerkUserId);
    const chiliId = z.coerce.number().int().positive().parse((await context.params).chiliId);
    return dataResponse(await new ChiliService(getDb()).getActiveChiliDetails(user.id, chiliId));
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request, context: { params: Promise<{ chiliId: string }> }) {
  try {
    const identity = await requireAuthenticatedIdentity(request);
    const user = await requireAppUser(identity.clerkUserId);
    const chiliId = z.coerce.number().int().positive().parse((await context.params).chiliId);
    return dataResponse(await new ChiliService(getDb()).updateOwnedChili(user.id, chiliId, inputSchema.parse(await request.json())));
  } catch (error) { return errorResponse(error); }
}
