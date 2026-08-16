import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { DomainError } from "./domain-error";

export async function requireAppUser(clerkUserId: string) {
  const [user] = await getDb().select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  if (!user) throw new DomainError("APP_USER_NOT_FOUND", "Your account has not been prepared yet.", 404);
  return user;
}
