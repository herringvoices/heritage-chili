import { and, count, eq, gt, isNotNull, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { chilis, chiliVotes, eventSettings, users } from "@/db/schema";
import { DomainError } from "@/server/domain-error";

type Database = ReturnType<typeof getDb>;

export function buildConditionalVoteInsert(db: Database, userId: number, chiliId: number, idempotencyKey: string, createdAt: string) {
  return db.insert(chiliVotes).select((qb) => qb.select({
    id: sql<number | null>`NULL`,
    userId: sql<number>`${userId}`,
    chiliId: sql<number>`${chiliId}`,
    idempotencyKey: sql<string>`${idempotencyKey}`,
    createdAt: sql<string>`${createdAt}`,
  }).from(sql`(SELECT 1)`).where(sql`changes() > 0`));
}

export class VotingService {
  constructor(private readonly db: Database) {}

  async getVotingEligibility(userId: number, chiliId: number) {
    const [[user], [event], [chili]] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, userId)).limit(1),
      this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
      this.db.select().from(chilis).where(eq(chilis.id, chiliId)).limit(1),
    ]);
    if (!user?.registrationCompletedAt || !user.role) throw new DomainError("REGISTRATION_REQUIRED", "Please finish registration first.", 403);
    if (user.participationDisabledAt) throw new DomainError("PARTICIPATION_DISABLED", "Participation is currently disabled for this account.", 403);
    if (!user.checkedInAt) throw new DomainError("CHECK_IN_REQUIRED", "Check in at the event before voting.", 403);
    if (!event?.votingIsOpen) throw new DomainError("VOTING_CLOSED", "Voting is currently closed.", 409);
    if (event.resultsAreFinal) throw new DomainError("RESULTS_FINAL", "Voting has ended and results are final.", 409);
    if (!chili || chili.status !== "active") throw new DomainError("CHILI_NOT_ACTIVE", "That chili is no longer available for voting.", 409);
    if (user.availableVoteCount < 1) throw new DomainError("NO_VOTES_AVAILABLE", "You do not have an available vote.", 409);
    return { canVote: true, availableVoteCount: user.availableVoteCount };
  }

  async castVote(userId: number, chiliId: number, idempotencyKey: string) {
    const [replay] = await this.db.select({ id: chiliVotes.id }).from(chiliVotes).where(and(eq(chiliVotes.userId, userId), eq(chiliVotes.idempotencyKey, idempotencyKey))).limit(1);
    if (replay) return { ...(await this.result(userId, chiliId)), replayed: true };
    await this.getVotingEligibility(userId, chiliId);
    try {
      const createdAt = new Date().toISOString();
      const results = await this.db.batch([
        this.db.update(users).set({ availableVoteCount: sql`${users.availableVoteCount} - 1`, updatedAt: createdAt }).where(and(
          eq(users.id, userId), isNotNull(users.registrationCompletedAt), isNotNull(users.role),
          sql`${users.participationDisabledAt} IS NULL`, isNotNull(users.checkedInAt), gt(users.availableVoteCount, 0),
          sql`EXISTS (SELECT 1 FROM ${eventSettings} WHERE ${eventSettings.id} = 1 AND ${eventSettings.votingIsOpen} = 1 AND ${eventSettings.resultsAreFinal} = 0)`,
          sql`EXISTS (SELECT 1 FROM ${chilis} WHERE ${chilis.id} = ${chiliId} AND ${chilis.status} = 'active')`,
          sql`NOT EXISTS (SELECT 1 FROM ${chiliVotes} WHERE ${chiliVotes.userId} = ${userId} AND ${chiliVotes.idempotencyKey} = ${idempotencyKey})`,
        )),
        buildConditionalVoteInsert(this.db, userId, chiliId, idempotencyKey, createdAt),
      ]);
      const update = results[0] as { meta?: { changes?: number } } | undefined;
      if (update?.meta?.changes === 0) {
        const [racedReplay] = await this.db.select({ id: chiliVotes.id }).from(chiliVotes).where(and(eq(chiliVotes.userId, userId), eq(chiliVotes.idempotencyKey, idempotencyKey))).limit(1);
        if (racedReplay) return { ...(await this.result(userId, chiliId)), replayed: true };
        await this.getVotingEligibility(userId, chiliId);
        throw new DomainError("VOTE_CONFLICT", "Your vote balance changed. Please try again.", 409);
      }
    } catch (error) {
      const [racedReplay] = await this.db.select({ id: chiliVotes.id }).from(chiliVotes).where(and(eq(chiliVotes.userId, userId), eq(chiliVotes.idempotencyKey, idempotencyKey))).limit(1);
      if (racedReplay) return { ...(await this.result(userId, chiliId)), replayed: true };
      await this.getVotingEligibility(userId, chiliId);
      throw error;
    }
    return { ...(await this.result(userId, chiliId)), replayed: false };
  }

  private async result(userId: number, chiliId: number) {
    const [[user], [personal]] = await Promise.all([
      this.db.select({ availableVoteCount: users.availableVoteCount }).from(users).where(eq(users.id, userId)).limit(1),
      this.db.select({ count: count() }).from(chiliVotes).where(and(eq(chiliVotes.userId, userId), eq(chiliVotes.chiliId, chiliId))),
    ]);
    return { availableVoteCount: user?.availableVoteCount ?? 0, personalVoteCount: personal?.count ?? 0 };
  }
}
