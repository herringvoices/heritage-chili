import { z } from "zod";
import { getDb } from "@/db";
import { requireAppUser } from "@/server/app-user";
import { requireAuthenticatedIdentity } from "@/server/auth/clerk";
import { dataResponse, errorResponse } from "@/server/http";
import { RegistrationService } from "@/server/services/registration-service";

const inputSchema = z.object({ partySize: z.number().int() }).strict();

export async function PUT(request: Request) {
  try {
    const identity = await requireAuthenticatedIdentity(request);
    const user = await requireAppUser(identity.clerkUserId);
    const input = inputSchema.parse(await request.json());
    return dataResponse(await new RegistrationService(getDb()).updatePartySize(user.id, input.partySize));
  } catch (error) { return errorResponse(error); }
}
