import { getDb } from "@/db";
import { dataResponse, errorResponse } from "@/server/http";
import { EventService } from "@/server/services/event-service";
export async function GET() { try { return dataResponse(await new EventService(getDb()).getPublicEventState()); } catch (error) { return errorResponse(error); } }
