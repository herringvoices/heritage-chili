import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getRuntimeEnv } from "@/server/runtime-env";

export function getDb() {
  return drizzle(getRuntimeEnv().DB, { schema });
}
