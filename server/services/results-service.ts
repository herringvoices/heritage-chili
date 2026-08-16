import { and, asc, count, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { auditEntries, chilis, chiliVotes, eventSettings, officialResults, pledges, users } from "@/db/schema";
import { DomainError } from "@/server/domain-error";

type Database = ReturnType<typeof getDb>;
type ChiliStatus = "draft" | "active" | "inactive" | "disqualified";
type ResultRow = {
  chiliId: number;
  name: string | null;
  contestantName: string | null;
  status: ChiliStatus;
  voteCount: number;
};
type PlacementInput = { placement: number; chiliId: number };

type RankedGroup = {
  start: number;
  end: number;
  voteCount: number;
  chiliIds: number[];
};

export class ResultsService {
  constructor(private readonly db: Database) {}

  async getAdminResults() {
    const [[settings], rows, [voteSummary], [attendanceSummary], [pledgeSummary], official] = await Promise.all([
      this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
      this.db.select({
        chiliId: chilis.id,
        name: chilis.name,
        contestantName: users.displayName,
        status: chilis.status,
        voteCount: count(chiliVotes.id),
      }).from(chilis)
        .innerJoin(users, eq(users.id, chilis.cookUserId))
        .leftJoin(chiliVotes, eq(chiliVotes.chiliId, chilis.id))
        .groupBy(chilis.id, chilis.name, users.displayName, chilis.status)
        .orderBy(desc(count(chiliVotes.id)), asc(chilis.id)),
      this.db.select({ totalVotesCast: count(chiliVotes.id) }).from(chiliVotes),
      this.db.select({
        checkedInVotingAccounts: count(users.id),
        totalUnusedVotes: sql<number>`coalesce(sum(${users.availableVoteCount}), 0)`,
      }).from(users).where(and(isNotNull(users.checkedInAt), or(eq(users.role, "guest"), eq(users.role, "contestant")))),
      this.db.select({ totalPledgedCents: sql<number>`coalesce(sum(${pledges.amountCents}), 0)` }).from(pledges),
      this.db.select({ placement: officialResults.placement, chiliId: officialResults.chiliId, voteCount: officialResults.voteCountAtFinalization })
        .from(officialResults).orderBy(asc(officialResults.placement)),
    ]);
    if (!settings) throw new DomainError("EVENT_SETTINGS_MISSING", "Event settings are unavailable.", 500);

    const normalized = rows.map((row) => ({ ...row, voteCount: Number(row.voteCount) })) as ResultRow[];
    const eligible = normalized.filter((row) => row.status === "active").sort((a, b) => b.voteCount - a.voteCount || a.chiliId - b.chiliId);
    const groups = this.rankedGroups(eligible);
    const tieGroups = groups.filter((group) => group.chiliIds.length > 1 && group.start <= 3).map((group) => ({
      voteCount: group.voteCount,
      placements: Array.from({ length: Math.min(group.end, 3) - group.start + 1 }, (_, index) => group.start + index),
      chiliIds: group.chiliIds,
    }));
    const rankById = new Map(eligible.map((entry, index) => [entry.chiliId, groups.find((group) => group.chiliIds.includes(entry.chiliId))?.start ?? index + 1]));
    const officialById = new Map(official.map((row) => [row.chiliId, row.placement]));

    return {
      votingIsOpen: settings.votingIsOpen,
      resultsAreFinal: settings.resultsAreFinal,
      resultsFinalizedAt: settings.resultsFinalizedAt,
      resultsFinalizedByUserId: settings.resultsFinalizedByUserId,
      entries: normalized.map((entry) => ({
        ...entry,
        name: entry.name ?? "Untitled chili",
        contestantName: entry.contestantName ?? "Unnamed contestant",
        eligible: entry.status === "active",
        rank: rankById.get(entry.chiliId) ?? null,
        officialPlacement: officialById.get(entry.chiliId) ?? null,
      })),
      tieGroups,
      suggestedPlacements: this.suggestedPlacements(groups),
      officialResults: official.map((row) => ({ placement: row.placement, chiliId: row.chiliId, voteCount: Number(row.voteCount) })),
      metrics: {
        totalVotesCast: Number(voteSummary?.totalVotesCast ?? 0),
        totalUnusedVotes: Number(attendanceSummary?.totalUnusedVotes ?? 0),
        checkedInVotingAccounts: Number(attendanceSummary?.checkedInVotingAccounts ?? 0),
        totalPledgedCents: Number(pledgeSummary?.totalPledgedCents ?? 0),
      },
    };
  }

  detectPlacementTies(rows: ResultRow[]) {
    return this.rankedGroups(rows.filter((row) => row.status === "active").sort((a, b) => b.voteCount - a.voteCount || a.chiliId - b.chiliId))
      .filter((group) => group.chiliIds.length > 1 && group.start <= 3);
  }

  async finalizeResults(adminId: number, resolutionInput?: PlacementInput[]) {
    await this.requireAdmin(adminId);
    const model = await this.getAdminResults();
    if (model.resultsAreFinal) throw new DomainError("RESULTS_FINAL", "Results are already final. Reopen them before replacing the official placements.", 409);
    if (model.votingIsOpen) throw new DomainError("VOTING_OPEN", "Close voting before finalizing results.", 409);

    const eligible = model.entries.filter((entry) => entry.eligible).sort((a, b) => b.voteCount - a.voteCount || a.chiliId - b.chiliId);
    if (eligible.length < 3) throw new DomainError("NOT_ENOUGH_ELIGIBLE_CHILIS", "At least three eligible chilis are required to finalize first, second, and third place.", 409);
    const groups = this.rankedGroups(eligible);
    const hasPlacementTie = groups.some((group) => group.chiliIds.length > 1 && group.start <= 3);
    const placements = hasPlacementTie ? this.validateManualPlacements(groups, resolutionInput) : eligible.slice(0, 3).map((entry, index) => ({ placement: index + 1, chiliId: entry.chiliId }));
    const votesById = new Map(eligible.map((entry) => [entry.chiliId, entry.voteCount]));
    const now = new Date().toISOString();
    const saved = placements.map((placement) => ({ ...placement, voteCount: votesById.get(placement.chiliId)! }));
    const after = { resultsAreFinal: true, resultsFinalizedAt: now, resultsFinalizedByUserId: adminId, officialResults: saved };

    await this.db.batch([
      ...saved.map((row) => this.db.insert(officialResults).values({ chiliId: row.chiliId, placement: row.placement, voteCountAtFinalization: row.voteCount, createdAt: now })),
      this.db.update(eventSettings).set({ resultsAreFinal: true, resultsFinalizedAt: now, resultsFinalizedByUserId: adminId, updatedAt: now })
        .where(and(eq(eventSettings.id, 1), eq(eventSettings.votingIsOpen, false), eq(eventSettings.resultsAreFinal, false))),
      this.db.insert(auditEntries).values({ actorUserId: adminId, action: "results.finalized", entityType: "result", entityId: null, reason: hasPlacementTie ? "Manual placement tie resolution" : null, beforeJson: JSON.stringify({ resultsAreFinal: false, officialResults: [] }), afterJson: JSON.stringify(after), createdAt: now }),
    ]);
    return { resultsAreFinal: true, resultsFinalizedAt: now, officialResults: saved };
  }

  async reopenResults(adminId: number, reasonInput?: string) {
    const reason = reasonInput?.trim() || null;
    await this.requireAdmin(adminId);
    const [[settings], official] = await Promise.all([
      this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
      this.db.select({ placement: officialResults.placement, chiliId: officialResults.chiliId, voteCount: officialResults.voteCountAtFinalization }).from(officialResults).orderBy(asc(officialResults.placement)),
    ]);
    if (!settings) throw new DomainError("EVENT_SETTINGS_MISSING", "Event settings are unavailable.", 500);
    if (!settings.resultsAreFinal) throw new DomainError("RESULTS_NOT_FINAL", "There are no final results to reopen.", 409);
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.delete(officialResults),
      this.db.update(eventSettings).set({ resultsAreFinal: false, resultsFinalizedAt: null, resultsFinalizedByUserId: null, updatedAt: now }).where(and(eq(eventSettings.id, 1), eq(eventSettings.resultsAreFinal, true))),
      this.db.insert(auditEntries).values({ actorUserId: adminId, action: "results.reopened", entityType: "result", entityId: null, reason, beforeJson: JSON.stringify({ resultsAreFinal: true, resultsFinalizedAt: settings.resultsFinalizedAt, resultsFinalizedByUserId: settings.resultsFinalizedByUserId, officialResults: official }), afterJson: JSON.stringify({ resultsAreFinal: false, officialResults: [] }), createdAt: now }),
    ]);
    return { resultsAreFinal: false, votingIsOpen: false, votesPreserved: true };
  }

  private rankedGroups(entries: Array<Pick<ResultRow, "chiliId" | "voteCount">>): RankedGroup[] {
    const groups: RankedGroup[] = [];
    for (const entry of entries) {
      const current = groups.at(-1);
      if (current && current.voteCount === entry.voteCount) {
        current.chiliIds.push(entry.chiliId);
        current.end += 1;
      } else {
        const start = current ? current.end + 1 : 1;
        groups.push({ start, end: start, voteCount: entry.voteCount, chiliIds: [entry.chiliId] });
      }
    }
    return groups;
  }

  private suggestedPlacements(groups: RankedGroup[]) {
    return [1, 2, 3].map((placement) => {
      const group = groups.find((item) => item.start <= placement && item.end >= placement);
      return { placement, chiliId: group?.chiliIds.length === 1 ? group.chiliIds[0] : null, allowedChiliIds: group?.chiliIds ?? [] };
    });
  }

  private validateManualPlacements(groups: RankedGroup[], input?: PlacementInput[]) {
    if (!input || input.length !== 3) throw new DomainError("TIE_RESOLUTION_REQUIRED", "Choose a unique eligible chili for every podium placement.", 409);
    const byPlacement = new Map<number, number>();
    for (const item of input) {
      if (!Number.isInteger(item.placement) || !Number.isInteger(item.chiliId) || item.placement < 1 || item.placement > 3 || byPlacement.has(item.placement)) {
        throw new DomainError("INVALID_TIE_RESOLUTION", "Submit exactly one valid chili for each placement.", 400);
      }
      byPlacement.set(item.placement, item.chiliId);
    }
    if ([1, 2, 3].some((placement) => !byPlacement.has(placement)) || new Set(byPlacement.values()).size !== 3) {
      throw new DomainError("INVALID_TIE_RESOLUTION", "Each podium placement must use a different eligible chili.", 400);
    }
    for (const placement of [1, 2, 3]) {
      const group = groups.find((item) => item.start <= placement && item.end >= placement);
      if (!group?.chiliIds.includes(byPlacement.get(placement)!)) {
        throw new DomainError("INVALID_TIE_RESOLUTION", `The selected chili is not eligible for placement ${placement}.`, 400);
      }
    }
    return [1, 2, 3].map((placement) => ({ placement, chiliId: byPlacement.get(placement)! }));
  }

  private async requireAdmin(adminId: number) {
    const [admin] = await this.db.select({ role: users.role, registrationCompletedAt: users.registrationCompletedAt }).from(users).where(eq(users.id, adminId)).limit(1);
    if (admin?.role !== "admin" || !admin.registrationCompletedAt) throw new DomainError("ADMIN_REQUIRED", "Administrator access is required.", 403);
  }
}
