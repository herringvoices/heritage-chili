import { asc, count, desc, eq, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { chilis, chiliVotes, eventSettings, officialResults, pledges, users } from "@/db/schema";
import { DomainError } from "@/server/domain-error";

type Database = ReturnType<typeof getDb>;
type RankedChili = { rank: number; chiliId: number; name: string; contestantName: string; imageUrl: string | null; tied: boolean };

export class StandingsQueryService {
  constructor(private readonly db: Database) {}

  async getPublicStandings() {
    const [[settings], [pledgeSummary]] = await Promise.all([
      this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
      this.db.select({ total: sql<number>`coalesce(sum(${pledges.amountCents}), 0)` }).from(pledges),
    ]);
    if (!settings) throw new DomainError("EVENT_NOT_CONFIGURED", "Standings are not available yet.", 503);

    const progress = { totalPledgedCents: Number(pledgeSummary?.total ?? 0), goalCents: settings.pledgeGoalCents };
    if (!settings.standingsAreVisible) return { state: "hidden" as const, rankings: [] as RankedChili[], hasTies: false, progress };

    if (settings.resultsAreFinal) {
      const rows = await this.db.select({
        rank: officialResults.placement,
        chiliId: chilis.id,
        name: chilis.name,
        contestantName: users.displayName,
        imageObjectKey: chilis.imageObjectKey,
      }).from(officialResults)
        .innerJoin(chilis, eq(officialResults.chiliId, chilis.id))
        .innerJoin(users, eq(chilis.cookUserId, users.id))
        .orderBy(asc(officialResults.placement));
      return {
        state: "finalized" as const,
        rankings: rows.map((row) => this.publicRow(row.rank, row, false)),
        hasTies: false,
        progress,
      };
    }

    const voteCount = count(chiliVotes.id);
    const rows = await this.db.select({
      chiliId: chilis.id,
      name: chilis.name,
      contestantName: users.displayName,
      imageObjectKey: chilis.imageObjectKey,
      voteCount,
    }).from(chiliVotes)
      .innerJoin(chilis, eq(chiliVotes.chiliId, chilis.id))
      .innerJoin(users, eq(chilis.cookUserId, users.id))
      .where(eq(chilis.status, "active"))
      .groupBy(chilis.id, chilis.name, users.displayName, chilis.imageObjectKey)
      .orderBy(desc(voteCount), asc(chilis.id))
      .limit(3);

    if (!rows.length) return { state: settings.votingIsOpen ? "empty" as const : "pre-voting" as const, rankings: [] as RankedChili[], hasTies: false, progress };
    const rankings = rows.map((row, index) => this.publicRow(index + 1, row, rows.some((other, otherIndex) => otherIndex !== index && Number(other.voteCount) === Number(row.voteCount))));
    const hasTies = rankings.some((row) => row.tied);
    return { state: rankings.length < 3 ? "partially-ranked" as const : "live-unofficial" as const, rankings, hasTies, progress };
  }

  private publicRow(rank: number, row: { chiliId: number; name: string | null; contestantName: string | null; imageObjectKey: string | null }, tied: boolean): RankedChili {
    return { rank, chiliId: row.chiliId, name: row.name ?? "Untitled chili", contestantName: row.contestantName ?? "Anonymous cook", imageUrl: row.imageObjectKey ? `/api/chilis/${row.chiliId}/image` : null, tied };
  }
}
