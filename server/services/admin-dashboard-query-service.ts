import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { chilis, chiliVotes, eventSettings, pledges, users } from "@/db/schema";
import { AuditService } from "./audit-service";
import { DomainError } from "@/server/domain-error";

type Database = ReturnType<typeof getDb>;
export class AdminDashboardQueryService {
  constructor(private readonly db: Database) {}
  async getAdminDashboard() {
    const [[registration], [attendance], [chili], [votes], [pledge], [event], recentActivity, warningRows] = await Promise.all([
      this.db.select({ registeredParties: count(users.id), expectedAttendance: sql<number>`coalesce(sum(${users.partySize}), 0)`, issuedVotes: sql<number>`coalesce(sum(${users.issuedVoteCount}), 0)`, unusedVotes: sql<number>`coalesce(sum(${users.availableVoteCount}), 0)` }).from(users).where(and(isNotNull(users.registrationCompletedAt), sql`${users.role} IN ('guest','contestant')`)),
      this.db.select({ checkedInParties: count(users.id), actualAttendance: sql<number>`coalesce(sum(${users.partySize}), 0)` }).from(users).where(and(isNotNull(users.checkedInAt), sql`${users.role} IN ('guest','contestant')`)),
      this.db.select({ registered: count(chilis.id), complete: sql<number>`coalesce(sum(case when ${chilis.name} is not null and length(trim(${chilis.name})) > 0 and ${chilis.description} is not null and length(trim(${chilis.description})) > 0 and ${chilis.spiceLevel} is not null then 1 else 0 end), 0)`, active: sql<number>`coalesce(sum(case when ${chilis.status} = 'active' then 1 else 0 end), 0)` }).from(chilis),
      this.db.select({ cast: count(chiliVotes.id) }).from(chiliVotes),
      this.db.select({ total: sql<number>`coalesce(sum(${pledges.amountCents}), 0)` }).from(pledges),
      this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
      new AuditService(this.db).listAuditEntries(),
      this.db.select({ userId: users.id, displayName: users.displayName, checkedInAt: users.checkedInAt, chiliId: chilis.id, chiliName: chilis.name, chiliStatus: chilis.status, description: chilis.description, spiceLevel: chilis.spiceLevel }).from(users).innerJoin(chilis, eq(chilis.cookUserId, users.id)).where(eq(users.role, "contestant")),
    ]);
    if (!event) throw new DomainError("EVENT_SETTINGS_MISSING", "Event settings are unavailable.", 500);
    const warnings = warningRows.flatMap((row) => {
      const items = [];
      if (row.checkedInAt && row.chiliStatus !== "active") items.push({ kind: "checked_in_inactive_chili", userId: row.userId, chiliId: row.chiliId, message: `${row.displayName ?? "A contestant"} is checked in, but ${row.chiliName ?? "their chili"} is not active.` });
      if (!row.checkedInAt && row.chiliStatus === "active") items.push({ kind: "active_chili_absent_contestant", userId: row.userId, chiliId: row.chiliId, message: `${row.chiliName ?? "An active chili"} is active, but its contestant is not checked in.` });
      if (!row.chiliName?.trim() || !row.description?.trim() || row.spiceLevel === null) items.push({ kind: "incomplete_chili", userId: row.userId, chiliId: row.chiliId, message: `${row.displayName ?? "A contestant"} has an incomplete chili entry.` });
      return items;
    });
    if (event.votingIsOpen && Number(chili?.active ?? 0) === 0) warnings.unshift({ kind: "voting_without_chilis", message: "Voting is open while no chilis are active." } as never);
    return { metrics: { registeredParties: Number(registration?.registeredParties ?? 0), expectedAttendance: Number(registration?.expectedAttendance ?? 0), checkedInParties: Number(attendance?.checkedInParties ?? 0), actualAttendance: Number(attendance?.actualAttendance ?? 0), registeredChilis: Number(chili?.registered ?? 0), completeChilis: Number(chili?.complete ?? 0), activeChilis: Number(chili?.active ?? 0), issuedVotes: Number(registration?.issuedVotes ?? 0), castVotes: Number(votes?.cast ?? 0), unusedVotes: Number(registration?.unusedVotes ?? 0), totalPledgedCents: Number(pledge?.total ?? 0), pledgeGoalCents: event.pledgeGoalCents }, event: { votingIsOpen: event.votingIsOpen, standingsAreVisible: event.standingsAreVisible, resultsAreFinal: event.resultsAreFinal }, warnings, recentActivity: recentActivity.slice(0, 8) };
  }
}
