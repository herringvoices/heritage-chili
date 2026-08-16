import { z } from "zod";
import { getDb } from "@/db";
import { requireAppUser } from "@/server/app-user";
import { requireAuthenticatedIdentity } from "@/server/auth/clerk";
import { dataResponse, errorResponse } from "@/server/http";
import { requireIdempotencyKey } from "@/server/request";
import { RegistrationService } from "@/server/services/registration-service";

const inputSchema = z.object({ amountCents: z.number().int().nonnegative() }).strict();

export async function POST(request: Request) {
  try {
    const identity = await requireAuthenticatedIdentity(request);
    const user = await requireAppUser(identity.clerkUserId);
    const key = requireIdempotencyKey(request);
    const input = inputSchema.parse(await request.json());
    return dataResponse(await new RegistrationService(getDb()).addChiliEntry(user.id, input.amountCents, key), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
