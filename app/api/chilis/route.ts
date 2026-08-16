import { z } from "zod";
import { getDb } from "@/db";
import { requireAppUser } from "@/server/app-user";
import { requireAuthenticatedIdentity } from "@/server/auth/clerk";
import { dataResponse, errorResponse } from "@/server/http";
import { ChiliService } from "@/server/services/chili-service";

const inputSchema = z.object({ name: z.string().max(100), description: z.string().max(2000), spiceLevel: z.number().int().min(0).max(5), tagIds: z.array(z.number().int().positive()).max(20) }).strict();

export async function GET(request: Request) {
  try {
    const identity = await requireAuthenticatedIdentity(request);
    const user = await requireAppUser(identity.clerkUserId);
    const params = new URL(request.url).searchParams;
    const heat = params.get("heat");
    return dataResponse(await new ChiliService(getDb()).listActiveChilis(user.id, { tag: params.get("tag") || undefined, heat: heat === null || heat === "" ? undefined : z.coerce.number().int().min(0).max(5).parse(heat) }));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await requireAuthenticatedIdentity(request);
    const user = await requireAppUser(identity.clerkUserId);
    const input = inputSchema.parse(await request.json());
    return dataResponse(await new ChiliService(getDb()).createOwnedChili(user.id, input), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
