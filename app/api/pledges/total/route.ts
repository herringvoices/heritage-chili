import { z } from "zod";
import { getDb } from "@/db";
import { requireAppUser } from "@/server/app-user";
import { requireAuthenticatedIdentity } from "@/server/auth/clerk";
import { dataResponse, errorResponse } from "@/server/http";
import { requireIdempotencyKey } from "@/server/request";
import { PledgeService } from "@/server/services/pledge-service";

const inputSchema = z.object({ totalPledgedCents: z.number().int().nonnegative().max(100_000_000) }).strict();

export async function PUT(request: Request) {
  try {
    const identity = await requireAuthenticatedIdentity(request);
    const user = await requireAppUser(identity.clerkUserId);
    const key = requireIdempotencyKey(request);
    const input = inputSchema.parse(await request.json());
    return dataResponse(await new PledgeService(getDb()).updateTotalPledge(user.id, input.totalPledgedCents, key));
  } catch (error) { return errorResponse(error); }
}
