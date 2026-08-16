import { and, eq, isNull, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { pledges, users } from "@/db/schema";
import type { ClerkIdentity } from "@/server/auth/clerk";
import { DomainError } from "@/server/domain-error";

type Database = ReturnType<typeof getDb>;

export type CurrentUserContext = {
  id: number;
  email: string;
  displayName: string | null;
  registrationState: "status4" | "registered";
  role: "guest" | "contestant" | "admin" | null;
  isAdmin: boolean;
  checkedIn: boolean;
  participation: { disabled: boolean; reason: string | null; canMutate: boolean };
  hasInitialPledge: boolean;
  entryRoute: "/register" | "/pledge" | "/dashboard" | "/admin";
};

const SEEDED_TEST_IDENTITIES = new Map([
  ["guest@test.com", "seed_guest_test"],
  ["entrant@test.com", "seed_entrant_test"],
]);

export class IdentityService {
  constructor(private readonly db: Database) {}

  async syncAuthenticatedUser(identity: ClerkIdentity) {
    const now = new Date().toISOString();
    let [existing] = await this.db.select().from(users).where(eq(users.clerkUserId, identity.clerkUserId)).limit(1);
    const normalizedEmail = identity.email?.trim().toLowerCase();
    const seededClerkUserId = normalizedEmail ? SEEDED_TEST_IDENTITIES.get(normalizedEmail) : null;
    if (normalizedEmail && seededClerkUserId) {
      const [seededAccount] = await this.db
        .select()
        .from(users)
        .where(and(eq(users.clerkUserId, seededClerkUserId), sql`lower(${users.email}) = ${normalizedEmail}`))
        .limit(1);
      if (seededAccount && existing && existing.id !== seededAccount.id && !existing.role && !existing.registrationCompletedAt) {
        await this.db.batch([
          this.db.delete(users).where(and(eq(users.id, existing.id), isNull(users.role), isNull(users.registrationCompletedAt))),
          this.db
            .update(users)
            .set({ clerkUserId: identity.clerkUserId, updatedAt: now, lastSeenAt: now })
            .where(eq(users.id, seededAccount.id)),
        ]);
        [existing] = await this.db.select().from(users).where(eq(users.clerkUserId, identity.clerkUserId)).limit(1);
      } else if (seededAccount && !existing) {
        await this.db
          .update(users)
          .set({ clerkUserId: identity.clerkUserId, updatedAt: now, lastSeenAt: now })
          .where(eq(users.id, seededAccount.id));
        [existing] = await this.db.select().from(users).where(eq(users.clerkUserId, identity.clerkUserId)).limit(1);
      }
    }
    const email = identity.email ?? existing?.email;
    if (!email) {
      throw new DomainError("IDENTITY_EMAIL_REQUIRED", "Your sign-in is valid, but an email address was not available.", 401);
    }
    const username = identity.username?.trim() || null;
    await this.db
      .insert(users)
      .values({
        clerkUserId: identity.clerkUserId,
        email,
        displayName: username,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: users.clerkUserId,
        set: {
          email,
          ...(username ? { displayName: username } : {}),
          updatedAt: now,
          lastSeenAt: now,
        },
      });

    const [user] = await this.db.select().from(users).where(eq(users.clerkUserId, identity.clerkUserId)).limit(1);
    if (!user) throw new DomainError("USER_SYNC_FAILED", "We could not prepare your account.", 500);
    return user;
  }

  async getCurrentUserContext(clerkUserId: string): Promise<CurrentUserContext> {
    const [user] = await this.db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
    if (!user) throw new DomainError("APP_USER_NOT_FOUND", "Your account has not been prepared yet.", 404);
    const [initialPledge] = await this.db.select({ id: pledges.id }).from(pledges).where(and(eq(pledges.userId, user.id), eq(pledges.context, "initial"))).limit(1);

    const registered = Boolean(user.registrationCompletedAt && user.role);
    const disabled = Boolean(user.participationDisabledAt);
    const hasInitialPledge = Boolean(initialPledge);
    const entryRoute = !registered ? "/register" : user.role === "admin" ? "/admin" : hasInitialPledge ? "/dashboard" : "/pledge";

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      registrationState: registered ? "registered" : "status4",
      role: user.role,
      isAdmin: user.role === "admin",
      hasInitialPledge,
      checkedIn: Boolean(user.checkedInAt),
      participation: {
        disabled,
        reason: disabled ? user.participationDisabledReason : null,
        canMutate: registered && !disabled,
      },
      entryRoute,
    };
  }
}
