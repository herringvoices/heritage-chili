import { getDb } from "@/db";
import { requireAdminRequest } from "@/server/admin-request";
import { dataResponse, errorResponse } from "@/server/http";
import { EventService } from "@/server/services/event-service";
export async function GET(request: Request) { try { await requireAdminRequest(request); return dataResponse(await new EventService(getDb()).getAdminEventState()); } catch (error) { return errorResponse(error); } }
