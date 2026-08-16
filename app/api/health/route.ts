import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { dataResponse, errorResponse } from "@/server/http";

export async function GET() {
  try {
    await getDb().run(sql`select 1`);
    return dataResponse({ status: "ok", database: "reachable" });
  } catch (error) {
    return errorResponse(error);
  }
}
