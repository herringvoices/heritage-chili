import { and, asc, count, desc, eq, like, or, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { auditEntries, chilis, chiliVotes, eventSettings, pledges, users, voteAdjustments } from "@/db/schema";
import { DomainError } from "@/server/domain-error";

type Database = ReturnType<typeof getDb>;
type Role = "guest" | "contestant";

export class AdminUserService {
  constructor(private readonly db: Database) {}

  async searchUsers(filters: { query?: string; role?: string; checkedIn?: string; noVotes?: boolean } = {}) {
    const conditions = [sql`${users.registrationCompletedAt} IS NOT NULL`, sql`${users.role} IN ('guest','contestant')`];
    if (filters.query?.trim()) { const pattern = `%${filters.query.trim().toLowerCase()}%`; conditions.push(or(like(sql`lower(${users.displayName})`, pattern), like(sql`lower(${users.email})`, pattern))!); }
    if (filters.role === "guest" || filters.role === "contestant") conditions.push(eq(users.role, filters.role));
    if (filters.checkedIn === "yes") conditions.push(sql`${users.checkedInAt} IS NOT NULL`);
    if (filters.checkedIn === "no") conditions.push(sql`${users.checkedInAt} IS NULL`);
    if (filters.noVotes) conditions.push(eq(users.availableVoteCount, 0));
    const rows = await this.db.select({
      id: users.id, displayName: users.displayName, email: users.email, partySize: users.partySize, role: users.role,
      checkInCode: users.checkInCode, checkedInAt: users.checkedInAt, issuedVoteCount: users.issuedVoteCount,
      availableVoteCount: users.availableVoteCount, participationDisabledAt: users.participationDisabledAt,
      chiliId: chilis.id, chiliName: chilis.name, chiliStatus: chilis.status,
      votesCast: sql<number>`(select count(*) from chili_votes cv where cv.user_id = ${users.id})`,
      totalPledgedCents: sql<number>`(select coalesce(sum(p.amount_cents), 0) from pledges p where p.user_id = ${users.id})`,
    }).from(users).leftJoin(chilis, eq(chilis.cookUserId, users.id)).where(and(...conditions)).orderBy(asc(users.displayName)).limit(100);
    return rows.map((row) => ({ ...row, displayName: row.displayName ?? "Unnamed attendee", partySize: row.partySize ?? 1, votesCast: Number(row.votesCast), totalPledgedCents: Number(row.totalPledgedCents) }));
  }

  async listAdmins(currentAdminId: number) {
    await this.requireAdmin(currentAdminId);
    const rows = await this.db.select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.role, "admin")).orderBy(asc(users.displayName));
    return rows.map((row) => ({
      ...row,
      displayName: row.displayName ?? "Unnamed administrator",
      isCurrentUser: row.id === currentAdminId,
      canDemote: row.id !== currentAdminId && rows.length > 1,
    }));
  }

  async getUserDetails(userId: number) {
    const [row] = await this.db.select({
      id: users.id, displayName: users.displayName, email: users.email, partySize: users.partySize, role: users.role,
      checkInCode: users.checkInCode, checkedInAt: users.checkedInAt, issuedVoteCount: users.issuedVoteCount,
      availableVoteCount: users.availableVoteCount, participationDisabledAt: users.participationDisabledAt,
      chiliId: chilis.id, chiliName: chilis.name, chiliStatus: chilis.status,
      votesCast: sql<number>`(select count(*) from chili_votes cv where cv.user_id = ${users.id})`,
      totalPledgedCents: sql<number>`(select coalesce(sum(p.amount_cents), 0) from pledges p where p.user_id = ${users.id})`,
    }).from(users).leftJoin(chilis, eq(chilis.cookUserId, users.id)).where(and(eq(users.id, userId), sql`${users.registrationCompletedAt} IS NOT NULL`, sql`${users.role} IN ('guest','contestant')`)).limit(1);
    const attendee = row ? { ...row, displayName: row.displayName ?? "Unnamed attendee", partySize: row.partySize ?? 1, votesCast: Number(row.votesCast), totalPledgedCents: Number(row.totalPledgedCents) } : null;
    if (!attendee) throw new DomainError("ATTENDEE_NOT_FOUND", "That attendee could not be found.", 404);
    const [votes, pledgeRows, history] = await Promise.all([
      this.db.select({ chiliId: chilis.id, chiliName: chilis.name, count: count(chiliVotes.id) }).from(chiliVotes).innerJoin(chilis, eq(chilis.id, chiliVotes.chiliId)).where(eq(chiliVotes.userId, userId)).groupBy(chilis.id, chilis.name).orderBy(desc(count(chiliVotes.id))),
      this.db.select().from(pledges).where(eq(pledges.userId, userId)).orderBy(desc(pledges.createdAt)),
      this.db.select().from(auditEntries).where(and(eq(auditEntries.entityType, "user"), eq(auditEntries.entityId, userId))).orderBy(desc(auditEntries.createdAt)).limit(50),
    ]);
    return { ...attendee, votingHistory: votes.map((row) => ({ ...row, count: Number(row.count) })), pledges: pledgeRows, auditHistory: history };
  }

  async changePartySize(adminId: number, userId: number, partySize: number, reason?: string) {
    const attendee = await this.mutableAttendee(adminId, userId);
    const [settings] = await this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1);
    if (!settings || !Number.isInteger(partySize) || partySize < settings.minPartySize || partySize > settings.maxPartySize) throw new DomainError("INVALID_PARTY_SIZE", `Party size must be between ${settings?.minPartySize ?? 1} and ${settings?.maxPartySize ?? 20}.`, 400);
    const auditReason = this.reason(reason);
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.update(users).set({ partySize, updatedAt: now }).where(eq(users.id, userId)),
      this.audit(adminId, "attendee.party_size_changed", "user", userId, auditReason, { partySize: attendee.partySize }, { partySize, votesUnchanged: true }, now),
    ]);
    return this.getUserDetails(userId);
  }

  async changeParticipationRole(adminId: number, userId: number, role: Role, disposition: "keep_draft" | "deactivate" | "disqualify" | "create_draft", reason?: string) {
    const attendee = await this.mutableAttendee(adminId, userId);
    if (!(["guest", "contestant"] as string[]).includes(role)) throw new DomainError("INVALID_ROLE", "Choose guest or contestant.", 400);
    const auditReason = this.reason(reason);
    const [chili] = await this.db.select().from(chilis).where(eq(chilis.cookUserId, userId)).limit(1);
    if (role === "guest" && chili && !["deactivate", "disqualify"].includes(disposition)) throw new DomainError("CHILI_DISPOSITION_REQUIRED", "Choose whether to deactivate or disqualify the existing chili.", 409);
    if (role === "contestant" && !chili && disposition !== "create_draft") throw new DomainError("CHILI_DISPOSITION_REQUIRED", "Create a draft chili when making this attendee a contestant.", 409);
    const now = new Date().toISOString();
    const operations = [this.db.update(users).set({ role, updatedAt: now }).where(eq(users.id, userId))];
    if (role === "guest" && chili) operations.push(this.db.update(chilis).set({ status: disposition === "disqualify" ? "disqualified" : "inactive", statusReason: auditReason, updatedAt: now }).where(eq(chilis.id, chili.id)) as never);
    if (role === "contestant" && !chili) operations.push(this.db.insert(chilis).values({ cookUserId: userId, status: "draft", createdAt: now, updatedAt: now }) as never);
    operations.push(this.audit(adminId, "attendee.role_changed", "user", userId, auditReason, { role: attendee.role, chiliId: chili?.id ?? null }, { role, chiliDisposition: disposition }, now) as never);
    await this.db.batch(operations);
    return this.getUserDetails(userId);
  }

  async promoteToAdmin(adminId: number, userId: number, reason?: string) {
    await this.requireAdmin(adminId);
    const auditReason = this.reason(reason);
    const attendee = await this.getUserDetails(userId);
    if (attendee.participationDisabledAt) throw new DomainError("PARTICIPATION_DISABLED", "Restore participation before granting administrator access.", 409);
    const [chili] = await this.db.select().from(chilis).where(eq(chilis.cookUserId, userId)).limit(1);
    const now = new Date().toISOString();
    const operations = [
      this.db.update(users).set({
        role: "admin",
        checkedInAt: null,
        checkedInByUserId: null,
        updatedAt: now,
      }).where(eq(users.id, userId)),
    ];
    if (chili && chili.status !== "disqualified") {
      operations.push(this.db.update(chilis).set({
        status: "inactive",
        statusReason: "Owner promoted to administrator",
        updatedAt: now,
      }).where(eq(chilis.id, chili.id)) as never);
    }
    operations.push(this.audit(adminId, "administrator.promoted", "user", userId, auditReason, { role: attendee.role, chiliId: chili?.id ?? null }, { role: "admin", chiliStatus: chili ? "inactive" : null }, now) as never);
    await this.db.batch(operations);
    return { id: userId, role: "admin" as const };
  }

  async demoteAdmin(adminId: number, userId: number, reason?: string) {
    await this.requireAdmin(adminId);
    const auditReason = this.reason(reason);
    if (adminId === userId) throw new DomainError("SELF_DEMOTION_FORBIDDEN", "You cannot remove your own administrator access.", 409);
    const [target] = await this.db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (target?.role !== "admin") throw new DomainError("ADMIN_NOT_FOUND", "That user is not an administrator.", 404);
    const [adminCount] = await this.db.select({ value: count(users.id) }).from(users).where(eq(users.role, "admin"));
    if (Number(adminCount?.value ?? 0) <= 1) throw new DomainError("LAST_ADMIN_PROTECTED", "The final administrator cannot be demoted.", 409);
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.update(users).set({ role: "guest", updatedAt: now }).where(eq(users.id, userId)),
      this.audit(adminId, "administrator.demoted", "user", userId, auditReason, { role: "admin" }, { role: "guest" }, now),
    ]);
    return { id: userId, role: "guest" as const };
  }

  async adjustAvailableVotes(adminId: number, userId: number, delta: number, reason?: string) {
    const attendee = await this.mutableAttendee(adminId, userId);
    const auditReason = this.reason(reason);
    if (!Number.isInteger(delta) || delta === 0) throw new DomainError("INVALID_VOTE_ADJUSTMENT", "Enter a non-zero whole vote adjustment.", 400);
    if (attendee.availableVoteCount + delta < 0) throw new DomainError("NEGATIVE_AVAILABLE_VOTES", "This adjustment would make available votes negative. Cast votes cannot be removed here.", 409);
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.insert(voteAdjustments).values({ userId, delta, reason: auditReason ?? "", adjustedByUserId: adminId, createdAt: now }),
      this.db.update(users).set({ issuedVoteCount: sql`${users.issuedVoteCount} + ${delta}`, availableVoteCount: sql`${users.availableVoteCount} + ${delta}`, updatedAt: now }).where(and(eq(users.id, userId), sql`${users.availableVoteCount} + ${delta} >= 0`, sql`${users.issuedVoteCount} + ${delta} >= 0`)),
      this.audit(adminId, "attendee.votes_adjusted", "user", userId, auditReason, { availableVoteCount: attendee.availableVoteCount, issuedVoteCount: attendee.issuedVoteCount }, { delta, availableVoteCount: attendee.availableVoteCount + delta, issuedVoteCount: attendee.issuedVoteCount + delta }, now),
    ]);
    return this.getUserDetails(userId);
  }

  async disableParticipation(adminId: number, userId: number, reason?: string) {
    const attendee = await this.baseAttendee(adminId, userId); const auditReason = this.reason(reason);
    if (attendee.participationDisabledAt) throw new DomainError("PARTICIPATION_ALREADY_DISABLED", "Participation is already disabled.", 409);
    const now = new Date().toISOString();
    await this.db.batch([this.db.update(users).set({ participationDisabledAt: now, participationDisabledByUserId: adminId, participationDisabledReason: auditReason, updatedAt: now }).where(eq(users.id, userId)), this.audit(adminId, "attendee.participation_disabled", "user", userId, auditReason, { disabled: false }, { disabled: true }, now)]);
    return this.getUserDetails(userId);
  }

  async restoreParticipation(adminId: number, userId: number, reason?: string) {
    const attendee = await this.baseAttendee(adminId, userId); const auditReason = this.reason(reason);
    if (!attendee.participationDisabledAt) throw new DomainError("PARTICIPATION_NOT_DISABLED", "Participation is already enabled.", 409);
    const now = new Date().toISOString();
    await this.db.batch([this.db.update(users).set({ participationDisabledAt: null, participationDisabledByUserId: null, participationDisabledReason: null, updatedAt: now }).where(eq(users.id, userId)), this.audit(adminId, "attendee.participation_restored", "user", userId, auditReason, { disabled: true }, { disabled: false }, now)]);
    return this.getUserDetails(userId);
  }

  private async baseAttendee(adminId: number, userId: number) { await this.requireAdmin(adminId); return this.getUserDetails(userId); }
  private async mutableAttendee(adminId: number, userId: number) { const attendee = await this.baseAttendee(adminId, userId); if (attendee.participationDisabledAt) throw new DomainError("PARTICIPATION_DISABLED", "Restore participation before making this change.", 409); return attendee; }
  private reason(reason?: string) { return reason?.trim() || null; }
  private async requireAdmin(adminId: number) { const [admin] = await this.db.select({ role: users.role, registrationCompletedAt: users.registrationCompletedAt }).from(users).where(eq(users.id, adminId)).limit(1); if (admin?.role !== "admin" || !admin.registrationCompletedAt) throw new DomainError("ADMIN_REQUIRED", "Administrator access is required.", 403); }
  private audit(actorUserId: number, action: string, entityType: "user" | "pledge", entityId: number, reason: string | null, before: unknown, after: unknown, createdAt: string) { return this.db.insert(auditEntries).values({ actorUserId, action, entityType, entityId, reason, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after), createdAt }); }
}
