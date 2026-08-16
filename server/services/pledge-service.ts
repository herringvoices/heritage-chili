import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { auditEntries, eventSettings, idempotencyKeys, pledges, users } from "@/db/schema";
import { GOFUNDME_URL } from "@/lib/gofundme";
import { DomainError } from "@/server/domain-error";
import { hashRequestBody } from "./idempotency-service";

type Database = ReturnType<typeof getDb>;
export type InitialPledgeResult = { pledgedCents: number; totalPledgedCents: number; gofundmeUrl: string | null; nextRoute: "/thank-you" };
export type AdditionalVotePledgeResult = {
  requestedVoteCount: number;
  pledgedCents: number;
  totalPledgedCents: number;
  issuedVoteCount: number;
  availableVoteCount: number;
  gofundmeUrl: string | null;
  nextRoute: "/thank-you";
};
export type UpdatedPledgeResult = { previousTotalCents: number; totalPledgedCents: number; differenceCents: number };

export class PledgeService {
  constructor(private readonly db: Database) {}

  async recordInitialPledge(userId: number, amountCents: number, idempotencyKey: string): Promise<InitialPledgeResult> {
    const input = { amountCents };
    const requestHash = await hashRequestBody(input);
    const replay = await this.replay(userId, idempotencyKey, requestHash);
    if (replay) return replay;
    if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new DomainError("INVALID_PLEDGE_AMOUNT", "Enter a valid pledge amount of zero or more.", 400);

    const [[user], [settings], [existingInitial], [summary]] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, userId)).limit(1),
      this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
      this.db.select({ id: pledges.id }).from(pledges).where(and(eq(pledges.userId, userId), eq(pledges.context, "initial"))).limit(1),
      this.db.select({ total: sql<number>`coalesce(sum(${pledges.amountCents}), 0)` }).from(pledges).where(eq(pledges.userId, userId)),
    ]);
    if (!user?.registrationCompletedAt || !user.role) throw new DomainError("REGISTRATION_REQUIRED", "Please finish registration first.", 403);
    if (!settings) throw new DomainError("EVENT_NOT_CONFIGURED", "Pledges are not available yet.", 503);
    if (existingInitial) throw new DomainError("INITIAL_PLEDGE_ALREADY_RECORDED", "Your initial pledge is already recorded.", 409);

    const result: InitialPledgeResult = {
      pledgedCents: amountCents,
      totalPledgedCents: Number(summary?.total ?? 0) + amountCents,
      gofundmeUrl: settings.gofundmeUrl ?? GOFUNDME_URL,
      nextRoute: "/thank-you",
    };
    const now = new Date().toISOString();
    try {
      await this.db.batch([
        this.db.insert(pledges).values({ userId, context: "initial", amountCents, additionalVoteCount: 0, createdAt: now }),
        this.db.insert(idempotencyKeys).values({
          userId,
          operation: "pledge.initial",
          idempotencyKey,
          requestHash,
          responseStatus: 201,
          responseJson: JSON.stringify({ data: result }),
          createdAt: now,
        }),
      ]);
      return result;
    } catch (error) {
      const concurrentReplay = await this.replay(userId, idempotencyKey, requestHash);
      if (concurrentReplay) return concurrentReplay;
      throw error;
    }
  }

  async recordAdditionalVotePledge(userId: number, requestedVoteCount: number, amountCents: number, idempotencyKey: string): Promise<AdditionalVotePledgeResult> {
    const input = { requestedVoteCount, amountCents };
    const requestHash = await hashRequestBody(input);
    const replay = await this.replayAdditional(userId, idempotencyKey, requestHash);
    if (replay) return replay;
    if (!Number.isSafeInteger(requestedVoteCount) || requestedVoteCount < 1) throw new DomainError("INVALID_VOTE_QUANTITY", "Enter a positive whole number of additional votes.", 400);
    if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new DomainError("INVALID_PLEDGE_AMOUNT", "Enter a valid pledge amount of zero or more.", 400);

    const [[user], [settings], [summary]] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, userId)).limit(1),
      this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
      this.db.select({ total: sql<number>`coalesce(sum(${pledges.amountCents}), 0)` }).from(pledges).where(eq(pledges.userId, userId)),
    ]);
    if (!user?.registrationCompletedAt || !user.role || user.role === "admin") throw new DomainError("REGISTRATION_REQUIRED", "Please finish attendee registration first.", 403);
    if (user.participationDisabledAt) throw new DomainError("PARTICIPATION_DISABLED", "Participation is currently disabled for this account.", 403);
    if (!settings) throw new DomainError("EVENT_NOT_CONFIGURED", "Additional votes are not available yet.", 503);

    const result: AdditionalVotePledgeResult = {
      requestedVoteCount,
      pledgedCents: amountCents,
      totalPledgedCents: Number(summary?.total ?? 0) + amountCents,
      issuedVoteCount: user.issuedVoteCount + requestedVoteCount,
      availableVoteCount: user.availableVoteCount + requestedVoteCount,
      gofundmeUrl: settings.gofundmeUrl ?? GOFUNDME_URL,
      nextRoute: "/thank-you",
    };
    const now = new Date().toISOString();
    try {
      await this.db.batch([
        this.db.update(users).set({
          issuedVoteCount: sql`${users.issuedVoteCount} + ${requestedVoteCount}`,
          availableVoteCount: sql`${users.availableVoteCount} + ${requestedVoteCount}`,
          updatedAt: now,
        }).where(and(eq(users.id, userId), isNotNull(users.registrationCompletedAt), isNotNull(users.role), sql`${users.role} != 'admin'`, sql`${users.participationDisabledAt} IS NULL`)),
        this.db.insert(pledges).values({ userId, context: "additional_votes", amountCents, additionalVoteCount: requestedVoteCount, createdAt: now }),
        this.db.insert(idempotencyKeys).values({
          userId,
          operation: "pledge.additional_votes",
          idempotencyKey,
          requestHash,
          responseStatus: 201,
          responseJson: JSON.stringify({ data: result }),
          createdAt: now,
        }),
      ]);
      return result;
    } catch (error) {
      const concurrentReplay = await this.replayAdditional(userId, idempotencyKey, requestHash);
      if (concurrentReplay) return concurrentReplay;
      throw error;
    }
  }

  async updateTotalPledge(userId: number, totalPledgedCents: number, idempotencyKey: string): Promise<UpdatedPledgeResult> {
    const input = { totalPledgedCents };
    const requestHash = await hashRequestBody(input);
    const replay = await this.replayUpdatedTotal(userId, idempotencyKey, requestHash);
    if (replay) return replay;
    if (!Number.isSafeInteger(totalPledgedCents) || totalPledgedCents < 0) throw new DomainError("INVALID_PLEDGE_AMOUNT", "Enter a valid pledge amount of zero or more.", 400);
    const [[user], [summary]] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, userId)).limit(1),
      this.db.select({ total: sql<number>`coalesce(sum(${pledges.amountCents}), 0)` }).from(pledges).where(eq(pledges.userId, userId)),
    ]);
    if (!user?.registrationCompletedAt || !user.role || user.role === "admin") throw new DomainError("REGISTRATION_REQUIRED", "Please finish attendee registration first.", 403);
    if (user.participationDisabledAt) throw new DomainError("PARTICIPATION_DISABLED", "Participation is currently disabled for this account.", 403);
    const previousTotalCents = Number(summary?.total ?? 0);
    const differenceCents = totalPledgedCents - previousTotalCents;
    const result = { previousTotalCents, totalPledgedCents, differenceCents };
    if (!differenceCents) return result;
    const now = new Date().toISOString();
    try {
      await this.db.batch([
        this.db.insert(pledges).values({ userId, context: "correction", amountCents: differenceCents, additionalVoteCount: 0, reason: "Updated by attendee", createdAt: now }),
        this.db.insert(auditEntries).values({ actorUserId: userId, action: "attendee.pledge_total_updated", entityType: "pledge", entityId: userId, reason: null, beforeJson: JSON.stringify({ totalPledgedCents: previousTotalCents }), afterJson: JSON.stringify({ totalPledgedCents, differenceCents }), createdAt: now }),
        this.db.insert(idempotencyKeys).values({ userId, operation: "pledge.total_update", idempotencyKey, requestHash, responseStatus: 200, responseJson: JSON.stringify({ data: result }), createdAt: now }),
      ]);
      return result;
    } catch (error) {
      const concurrentReplay = await this.replayUpdatedTotal(userId, idempotencyKey, requestHash);
      if (concurrentReplay) return concurrentReplay;
      throw error;
    }
  }

  private async replay(userId: number, key: string, requestHash: string): Promise<InitialPledgeResult | null> {
    const [record] = await this.db.select().from(idempotencyKeys).where(and(
      eq(idempotencyKeys.userId, userId),
      eq(idempotencyKeys.operation, "pledge.initial"),
      eq(idempotencyKeys.idempotencyKey, key),
    )).limit(1);
    if (!record) return null;
    if (record.requestHash !== requestHash) throw new DomainError("IDEMPOTENCY_KEY_REUSED", "This request key was already used for different information.", 409);
    return (JSON.parse(record.responseJson) as { data: InitialPledgeResult }).data;
  }

  private async replayAdditional(userId: number, key: string, requestHash: string): Promise<AdditionalVotePledgeResult | null> {
    const [record] = await this.db.select().from(idempotencyKeys).where(and(
      eq(idempotencyKeys.userId, userId),
      eq(idempotencyKeys.operation, "pledge.additional_votes"),
      eq(idempotencyKeys.idempotencyKey, key),
    )).limit(1);
    if (!record) return null;
    if (record.requestHash !== requestHash) throw new DomainError("IDEMPOTENCY_KEY_REUSED", "This request key was already used for different information.", 409);
    return (JSON.parse(record.responseJson) as { data: AdditionalVotePledgeResult }).data;
  }

  private async replayUpdatedTotal(userId: number, key: string, requestHash: string): Promise<UpdatedPledgeResult | null> {
    const [record] = await this.db.select().from(idempotencyKeys).where(and(
      eq(idempotencyKeys.userId, userId),
      eq(idempotencyKeys.operation, "pledge.total_update"),
      eq(idempotencyKeys.idempotencyKey, key),
    )).limit(1);
    if (!record) return null;
    if (record.requestHash !== requestHash) throw new DomainError("IDEMPOTENCY_KEY_REUSED", "This request key was already used for different information.", 409);
    return (JSON.parse(record.responseJson) as { data: UpdatedPledgeResult }).data;
  }
}
