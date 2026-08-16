import { z } from "zod";
import { getDb } from "@/db";
import { requireAppUser } from "@/server/app-user";
import { requireAuthenticatedIdentity } from "@/server/auth/clerk";
import { dataResponse, errorResponse } from "@/server/http";
import { NoticeStateService } from "@/server/services/notice-state-service";

const inputSchema = z.object({ status: z.enum(["seen", "completed", "dismissed"]) }).strict();

export async function PUT(request: Request, { params }: { params: Promise<{ noticeKey: string }> }) {
  try {
    const identity = await requireAuthenticatedIdentity(request);
    const user = await requireAppUser(identity.clerkUserId);
    const { status } = inputSchema.parse(await request.json());
    return dataResponse(await new NoticeStateService(getDb()).record(user.id, (await params).noticeKey, status));
  } catch (error) { return errorResponse(error); }
}
