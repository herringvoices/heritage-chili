import { getDb } from "@/db";
import { requireAdminRequest } from "@/server/admin-request";
import { errorResponse, dataResponse } from "@/server/http";
import { AdminUserService } from "@/server/services/admin-user-service";
import { DomainError } from "@/server/domain-error";

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdminRequest(request);
    const body = await request.json() as { action: "promote" | "demote"; reason?: string; confirmation: string };
    const userId = Number((await params).userId);
    const service = new AdminUserService(getDb());
    if (body.action === "promote") {
      if (body.confirmation !== "MAKE ADMIN") throw new DomainError("CONFIRMATION_REQUIRED", "Type MAKE ADMIN to confirm.", 400);
      return dataResponse(await service.promoteToAdmin(admin.id, userId, body.reason));
    }
    if (body.action === "demote") {
      if (body.confirmation !== "REMOVE ADMIN") throw new DomainError("CONFIRMATION_REQUIRED", "Type REMOVE ADMIN to confirm.", 400);
      return dataResponse(await service.demoteAdmin(admin.id, userId, body.reason));
    }
    throw new DomainError("INVALID_ADMIN_ACTION", "Choose an administrator access action.", 400);
  } catch (error) {
    return errorResponse(error);
  }
}
