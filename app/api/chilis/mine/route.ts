import { getDb } from "@/db";
import { requireAppUser } from "@/server/app-user";
import { requireAuthenticatedIdentity } from "@/server/auth/clerk";
import { dataResponse, errorResponse } from "@/server/http";
import { ChiliService } from "@/server/services/chili-service";

export async function GET(request: Request) {
  try {
    const identity = await requireAuthenticatedIdentity(request);
    const user = await requireAppUser(identity.clerkUserId);
    return dataResponse(await new ChiliService(getDb()).getOwnedChili(user.id));
  } catch (error) { return errorResponse(error); }
}
