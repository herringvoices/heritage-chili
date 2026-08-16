import { z } from "zod";
import { getDb } from "@/db";
import { requireAuthenticatedIdentity } from "@/server/auth/clerk";
import { requireAppUser } from "@/server/app-user";
import { dataResponse, errorResponse } from "@/server/http";
import { requireIdempotencyKey } from "@/server/request";
import { RegistrationService } from "@/server/services/registration-service";

const inputSchema = z.object({ partySize: z.number().int(), entersChili: z.boolean() }).strict();

export async function GET(request: Request) {
  try {
    const identity = await requireAuthenticatedIdentity(request);
    const user = await requireAppUser(identity.clerkUserId);
    return dataResponse(await new RegistrationService(getDb()).getRegistrationState(user.id));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await requireAuthenticatedIdentity(request);
    const user = await requireAppUser(identity.clerkUserId);
    const key = requireIdempotencyKey(request);
    const input = inputSchema.parse(await request.json());
    return dataResponse(await new RegistrationService(getDb()).completeRegistration(user.id, input, key), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
