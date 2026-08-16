import { eq } from "drizzle-orm";
import type { getDb } from "@/db";
import { users } from "@/db/schema";
import { fetchClerkUserProfile, type ClerkUserProfile } from "@/server/auth/clerk";

type Database = ReturnType<typeof getDb>;
type ProfileLoader = (clerkUserId: string) => Promise<ClerkUserProfile | null>;

export class ClerkUsernameSyncService {
  constructor(
    private readonly db: Database,
    private readonly loadProfile: ProfileLoader = fetchClerkUserProfile,
  ) {}

  async syncAllUsers() {
    const rows = await this.db
      .select({
        id: users.id,
        clerkUserId: users.clerkUserId,
        displayName: users.displayName,
      })
      .from(users)
      .limit(200);

    const results = await Promise.all(rows.map(async (user) => {
      if (!user.clerkUserId.startsWith("user_")) return false;

      try {
        const profile = await this.loadProfile(user.clerkUserId);
        const username = profile?.username?.trim();
        if (!username || username === user.displayName) return false;

        await this.db
          .update(users)
          .set({
            displayName: username,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(users.id, user.id));
        return true;
      } catch {
        // A stale or unavailable Clerk profile should not block the admin roster.
        return false;
      }
    }));

    return results.filter(Boolean).length;
  }
}
