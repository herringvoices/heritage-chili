import { and, count, eq, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { chilis, chiliTags, chiliVotes, eventSettings, pledges, tags, userNoticeStates, users } from "@/db/schema";
import { DomainError } from "@/server/domain-error";

type Database = ReturnType<typeof getDb>;

export function chiliIsComplete(chili: { name: string | null; description: string | null; spiceLevel: number | null }) {
  return Boolean(chili.name?.trim() && chili.description?.trim() && Number.isInteger(chili.spiceLevel) && chili.spiceLevel! >= 0 && chili.spiceLevel! <= 5);
}

export class DashboardQueryService {
  constructor(private readonly db: Database) {}

  async getAttendeeDashboard(userId: number) {
    const [[user], [settings], [pledgeSummary], [initialPledge], voteHistory, [ownedChili], noticeStates] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, userId)).limit(1),
      this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
      this.db.select({ total: sql<number>`coalesce(sum(${pledges.amountCents}), 0)` }).from(pledges).where(eq(pledges.userId, userId)),
      this.db.select({ present: sql<number>`1` }).from(pledges).where(and(eq(pledges.userId, userId), eq(pledges.context, "initial"))).limit(1),
      this.db.select({ chiliId: chilis.id, chiliName: chilis.name, count: count(chiliVotes.id) })
        .from(chiliVotes)
        .innerJoin(chilis, eq(chiliVotes.chiliId, chilis.id))
        .where(eq(chiliVotes.userId, userId))
        .groupBy(chilis.id, chilis.name),
      this.db.select().from(chilis).where(eq(chilis.cookUserId, userId)).limit(1),
      this.db.select({ noticeKey: userNoticeStates.noticeKey, noticeVersion: userNoticeStates.noticeVersion, status: userNoticeStates.status }).from(userNoticeStates).where(eq(userNoticeStates.userId, userId)),
    ]);

    if (!user?.registrationCompletedAt || !user.role) throw new DomainError("REGISTRATION_REQUIRED", "Please finish registration first.", 403);
    if (user.role === "admin") throw new DomainError("ATTENDEE_REQUIRED", "This dashboard is for registered attendees.", 403);
    if (!settings) throw new DomainError("EVENT_NOT_CONFIGURED", "The event dashboard is not available yet.", 503);

    const castVoteCount = voteHistory.reduce((total, item) => total + Number(item.count), 0);
    const ownedTags = ownedChili
      ? await this.db.select({ id: tags.id, name: tags.name, slug: tags.slug })
          .from(chiliTags)
          .innerJoin(tags, eq(chiliTags.tagId, tags.id))
          .where(and(eq(chiliTags.chiliId, ownedChili.id), eq(tags.isActive, true)))
          .orderBy(tags.sortOrder, tags.name)
      : [];

    return {
      attendee: {
        displayName: user.displayName,
        role: user.role,
        partySize: user.partySize ?? 0,
        checkedIn: Boolean(user.checkedInAt),
        checkInCode: user.checkInCode,
        participation: {
          disabled: Boolean(user.participationDisabledAt),
          reason: user.participationDisabledAt ? user.participationDisabledReason : null,
        },
      },
      votes: {
        issued: user.issuedVoteCount,
        cast: castVoteCount,
        available: user.availableVoteCount,
        usableNow: Boolean(user.checkedInAt) && !user.participationDisabledAt && settings.votingIsOpen && !settings.resultsAreFinal,
        history: voteHistory.map((item) => ({ chiliId: item.chiliId, chiliName: item.chiliName ?? "Untitled chili", count: Number(item.count) })),
      },
      pledges: { totalCents: Number(pledgeSummary?.total ?? 0), hasInitial: Boolean(initialPledge) },
      event: {
        votingIsOpen: settings.votingIsOpen,
        resultsAreFinal: settings.resultsAreFinal,
        suggestedAdditionalVoteCents: settings.suggestedAdditionalVoteCents,
        suggestedChiliEntryCents: settings.suggestedChiliEntryCents,
        chiliEntryIsOpen: user.role === "guest" && !user.checkedInAt && !settings.votingIsOpen && !settings.resultsAreFinal && !user.participationDisabledAt,
        minPartySize: settings.minPartySize,
        maxPartySize: settings.maxPartySize,
      },
      chili: ownedChili ? {
        id: ownedChili.id,
        name: ownedChili.name,
        description: ownedChili.description,
        spiceLevel: ownedChili.spiceLevel,
        status: ownedChili.status,
        complete: chiliIsComplete(ownedChili),
        imageUrl: ownedChili.imageObjectKey ? `/api/chilis/${ownedChili.id}/image` : null,
        tags: ownedTags,
      } : null,
      notices: noticeStates,
    };
  }
}
