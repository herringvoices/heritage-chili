import { and, eq, like, or, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { auditEntries, chilis, chiliVotes, users } from "@/db/schema";
import { DomainError } from "@/server/domain-error";
import { chiliIsComplete } from "./dashboard-query-service";

type Database = ReturnType<typeof getDb>;

export class CheckInService {
  constructor(private readonly db: Database) {}

  async findAttendees(rawQuery: string) {
    const query = rawQuery.trim();
    if (!query) return [];
    const exactCode = /^\d{4}$/.test(query);
    const pattern = `%${query.toLowerCase()}%`;
    const condition = exactCode
      ? eq(users.checkInCode, query)
      : or(like(sql`lower(${users.displayName})`, pattern), like(sql`lower(${users.email})`, pattern));
    const rows = await this.db.select({
      id: users.id, displayName: users.displayName, email: users.email, partySize: users.partySize,
      role: users.role, checkInCode: users.checkInCode, checkedInAt: users.checkedInAt,
      availableVoteCount: users.availableVoteCount, chiliId: chilis.id, chiliName: chilis.name,
      chiliDescription: chilis.description, chiliSpiceLevel: chilis.spiceLevel, chiliStatus: chilis.status,
    }).from(users).leftJoin(chilis, eq(chilis.cookUserId, users.id))
      .where(and(sql`${users.registrationCompletedAt} IS NOT NULL`, sql`${users.role} IN ('guest','contestant')`, condition)).limit(20);
    return rows.map((row) => ({
      ...row,
      displayName: row.displayName ?? "Unnamed attendee",
      partySize: row.partySize ?? 1,
      chiliComplete: row.chiliId ? chiliIsComplete({ name: row.chiliName, description: row.chiliDescription, spiceLevel: row.chiliSpiceLevel }) : false,
    }));
  }

  async getAttendeeForCheckIn(userId: number) {
    const [attendee] = await this.db.select({
      id: users.id, displayName: users.displayName, email: users.email, partySize: users.partySize,
      role: users.role, checkInCode: users.checkInCode, checkedInAt: users.checkedInAt,
      availableVoteCount: users.availableVoteCount, registrationCompletedAt: users.registrationCompletedAt,
      chiliName: chilis.name,
    }).from(users).leftJoin(chilis, eq(chilis.cookUserId, users.id)).where(eq(users.id, userId)).limit(1);
    if (!attendee) throw new DomainError("ATTENDEE_NOT_FOUND", "That attendee could not be found.", 404);
    if (!attendee.registrationCompletedAt || !attendee.role || attendee.role === "admin") {
      throw new DomainError("CHECK_IN_NOT_REGISTERED", "Only registered guests and contestants can be checked in.", 409);
    }
    return { ...attendee, displayName: attendee.displayName ?? "Unnamed attendee", partySize: attendee.partySize ?? 1 };
  }

  async checkInAttendee(adminId: number, userId: number) {
    await this.requireAdmin(adminId);
    const attendee = await this.getAttendeeForCheckIn(userId);
    if (attendee.checkedInAt) return { attendee, replayed: true };
    const now = new Date().toISOString();
    const after = { checkedInAt: now, checkedInByUserId: adminId };
    const update = await this.db.update(users)
      .set({ ...after, updatedAt: now })
      .where(and(eq(users.id, userId), sql`${users.checkedInAt} IS NULL`));
    if (update?.meta?.changes === 0) {
      const current = await this.getAttendeeForCheckIn(userId);
      if (current.checkedInAt) return { attendee: current, replayed: true };
      throw new DomainError("CHECK_IN_CONFLICT", "Check-in changed in another session. Refresh and try again.", 409);
    }
    await this.db.insert(auditEntries).values({
      actorUserId: adminId,
      action: "attendee.checked_in",
      entityType: "user",
      entityId: userId,
      beforeJson: JSON.stringify({ checkedInAt: null }),
      afterJson: JSON.stringify(after),
      createdAt: now,
    });
    return { attendee: { ...attendee, ...after }, replayed: false };
  }

  async undoCheckIn(adminId: number, userId: number) {
    await this.requireAdmin(adminId);
    const attendee = await this.getAttendeeForCheckIn(userId);
    if (!attendee.checkedInAt) return { attendee, replayed: true };
    const [{ count: castVotes = 0 } = { count: 0 }] = await this.db.select({ count: sql<number>`count(*)` }).from(chiliVotes).where(eq(chiliVotes.userId, userId));
    if (Number(castVotes) > 0) throw new DomainError("CHECK_IN_UNDO_BLOCKED_BY_VOTES", "Check-in cannot be undone because this attendee has already voted.", 409);
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.update(users).set({ checkedInAt: null, checkedInByUserId: null, updatedAt: now }).where(eq(users.id, userId)),
      this.db.insert(auditEntries).values({ actorUserId: adminId, action: "attendee.check_in_undone", entityType: "user", entityId: userId, beforeJson: JSON.stringify({ checkedInAt: attendee.checkedInAt }), afterJson: JSON.stringify({ checkedInAt: null }), createdAt: now }),
    ]);
    return { attendee: { ...attendee, checkedInAt: null }, replayed: false };
  }

  private async requireAdmin(adminId: number) {
    const [admin] = await this.db.select({ role: users.role, registrationCompletedAt: users.registrationCompletedAt }).from(users).where(eq(users.id, adminId)).limit(1);
    if (admin?.role !== "admin" || !admin.registrationCompletedAt) throw new DomainError("ADMIN_REQUIRED", "Administrator access is required.", 403);
  }
}
