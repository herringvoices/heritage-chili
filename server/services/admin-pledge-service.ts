import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { auditEntries, eventSettings, pledges, users } from "@/db/schema";
import { DomainError } from "@/server/domain-error";

type Database = ReturnType<typeof getDb>;

export class AdminPledgeService {
  constructor(private readonly db: Database) {}

  async listPledges(filters: { query?: string; context?: string; sort?: string } = {}) {
    const conditions = [];
    if (filters.query?.trim()) { const pattern = `%${filters.query.trim().toLowerCase()}%`; conditions.push(or(like(sql`lower(${users.displayName})`, pattern), like(sql`lower(${users.email})`, pattern))!); }
    if (["initial", "chili_entry", "additional_votes", "admin", "correction", "reversal"].includes(filters.context ?? "")) conditions.push(eq(pledges.context, filters.context as "initial" | "chili_entry" | "additional_votes" | "admin" | "correction" | "reversal"));
    const order = filters.sort === "oldest" ? asc(pledges.createdAt) : filters.sort === "largest" ? desc(pledges.amountCents) : filters.sort === "smallest" ? asc(pledges.amountCents) : desc(pledges.createdAt);
    const rows = await this.db.select({ id: pledges.id, userId: pledges.userId, displayName: users.displayName, email: users.email, context: pledges.context, amountCents: pledges.amountCents, additionalVoteCount: pledges.additionalVoteCount, correctsPledgeId: pledges.correctsPledgeId, reason: pledges.reason, createdAt: pledges.createdAt }).from(pledges).innerJoin(users, eq(users.id, pledges.userId)).where(conditions.length ? and(...conditions) : undefined).orderBy(order).limit(200);
    const [[summary], [settings], [attendees]] = await Promise.all([
      this.db.select({ totalPledgedCents: sql<number>`coalesce(sum(${pledges.amountCents}), 0)` }).from(pledges),
      this.db.select({ goalCents: eventSettings.pledgeGoalCents }).from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
      this.db.select({ count: sql<number>`count(distinct ${pledges.userId})` }).from(pledges),
    ]);
    const totalPledgedCents = Number(summary?.totalPledgedCents ?? 0);
    return { rows: rows.map((row) => ({ ...row, displayName: row.displayName ?? "Unnamed attendee" })), summary: { totalPledgedCents, goalCents: settings?.goalCents ?? 0, differenceCents: totalPledgedCents - (settings?.goalCents ?? 0), attendeeCount: Number(attendees?.count ?? 0) } };
  }

  async recordPledgeForUser(adminId: number, userId: number, amountCents: number, reason?: string) {
    await this.requireMutable(adminId, userId); this.validateAmount(amountCents); const auditReason = this.reason(reason);
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.insert(pledges).values({ userId, recordedByUserId: adminId, context: "admin", amountCents, additionalVoteCount: 0, reason: auditReason, createdAt: now }),
      this.db.insert(auditEntries).values({ actorUserId: adminId, action: "pledge.recorded_by_admin", entityType: "pledge", entityId: userId, reason: auditReason, afterJson: JSON.stringify({ userId, amountCents, votesChanged: false }), createdAt: now }),
    ]);
    return this.listPledges();
  }

  async correctPledge(adminId: number, pledgeId: number, replacementAmountCents: number, reason?: string) {
    this.validateAmount(replacementAmountCents); const auditReason = this.reason(reason); await this.requireAdmin(adminId);
    const [original] = await this.db.select().from(pledges).where(eq(pledges.id, pledgeId)).limit(1);
    if (!original) throw new DomainError("PLEDGE_NOT_FOUND", "That pledge could not be found.", 404);
    if (["correction", "reversal"].includes(original.context)) throw new DomainError("PLEDGE_COMPENSATION_IMMUTABLE", "Correct the original pledge, not a compensating row.", 409);
    await this.requireEnabled(original.userId);
    const existing = await this.db.select({ id: pledges.id }).from(pledges).where(eq(pledges.correctsPledgeId, pledgeId)).limit(1);
    if (existing.length) throw new DomainError("PLEDGE_ALREADY_ADJUSTED", "This pledge already has a correction or reversal.", 409);
    const now = new Date().toISOString(); const delta = replacementAmountCents - original.amountCents;
    await this.db.batch([
      this.db.insert(pledges).values({ userId: original.userId, recordedByUserId: adminId, context: "correction", amountCents: delta, additionalVoteCount: 0, correctsPledgeId: pledgeId, reason: auditReason, createdAt: now }),
      this.db.insert(auditEntries).values({ actorUserId: adminId, action: "pledge.corrected", entityType: "pledge", entityId: pledgeId, reason: auditReason, beforeJson: JSON.stringify({ amountCents: original.amountCents }), afterJson: JSON.stringify({ replacementAmountCents, compensatingAmountCents: delta, votesChanged: false }), createdAt: now }),
    ]);
    return this.listPledges();
  }

  async reversePledge(adminId: number, pledgeId: number, reason?: string) {
    const auditReason = this.reason(reason); await this.requireAdmin(adminId);
    const [original] = await this.db.select().from(pledges).where(eq(pledges.id, pledgeId)).limit(1);
    if (!original) throw new DomainError("PLEDGE_NOT_FOUND", "That pledge could not be found.", 404);
    if (["correction", "reversal"].includes(original.context)) throw new DomainError("PLEDGE_COMPENSATION_IMMUTABLE", "Reverse the original pledge, not a compensating row.", 409);
    await this.requireEnabled(original.userId);
    const existing = await this.db.select({ id: pledges.id }).from(pledges).where(eq(pledges.correctsPledgeId, pledgeId)).limit(1);
    if (existing.length) throw new DomainError("PLEDGE_ALREADY_ADJUSTED", "This pledge already has a correction or reversal.", 409);
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.insert(pledges).values({ userId: original.userId, recordedByUserId: adminId, context: "reversal", amountCents: -original.amountCents, additionalVoteCount: 0, correctsPledgeId: pledgeId, reason: auditReason, createdAt: now }),
      this.db.insert(auditEntries).values({ actorUserId: adminId, action: "pledge.reversed", entityType: "pledge", entityId: pledgeId, reason: auditReason, beforeJson: JSON.stringify({ amountCents: original.amountCents }), afterJson: JSON.stringify({ compensatingAmountCents: -original.amountCents, votesChanged: false }), createdAt: now }),
    ]);
    return this.listPledges();
  }

  private validateAmount(value: number) { if (!Number.isInteger(value) || value < 0) throw new DomainError("INVALID_PLEDGE_AMOUNT", "Enter a non-negative pledge amount in cents.", 400); }
  private reason(value?: string) { return value?.trim() || null; }
  private async requireMutable(adminId: number, userId: number) { await this.requireAdmin(adminId); await this.requireEnabled(userId); }
  private async requireEnabled(userId: number) { const [user] = await this.db.select({ id: users.id, role: users.role, registrationCompletedAt: users.registrationCompletedAt, participationDisabledAt: users.participationDisabledAt }).from(users).where(eq(users.id, userId)).limit(1); if (!user || !user.registrationCompletedAt || !user.role || user.role === "admin") throw new DomainError("ATTENDEE_NOT_FOUND", "That attendee could not be found.", 404); if (user.participationDisabledAt) throw new DomainError("PARTICIPATION_DISABLED", "Restore participation before recording or changing pledges.", 409); }
  private async requireAdmin(adminId: number) { const [admin] = await this.db.select({ role: users.role, registrationCompletedAt: users.registrationCompletedAt }).from(users).where(eq(users.id, adminId)).limit(1); if (admin?.role !== "admin" || !admin.registrationCompletedAt) throw new DomainError("ADMIN_REQUIRED", "Administrator access is required.", 403); }
}
