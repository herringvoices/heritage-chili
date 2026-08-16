import { and, eq, isNull, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { auditEntries, chilis, eventSettings, idempotencyKeys, pledges, users } from "@/db/schema";
import { DomainError } from "@/server/domain-error";
import { GOFUNDME_URL } from "@/lib/gofundme";
import { hashRequestBody } from "./idempotency-service";

type Database = ReturnType<typeof getDb>;

export type RegistrationInput = { partySize: number; entersChili: boolean };
export type RegistrationResult = {
  partySize: number;
  role: "guest" | "contestant";
  issuedVoteCount: number;
  suggestedPledgeCents: number;
  nextRoute: "/pledge";
};

export type GuestChiliEntryResult = {
  purpose: "chili_entry";
  pledgedCents: number;
  totalPledgedCents: number;
  gofundmeUrl: string | null;
  nextRoute: "/thank-you";
  continueRoute: "/chili/edit";
  continueLabel: "Continue to chili entry";
};

export function calculateSuggestedInitialPledge(
  partySize: number,
  entersChili: boolean,
  settings: { suggestedAdmissionCents: number; suggestedChiliEntryCents: number },
) {
  return partySize * settings.suggestedAdmissionCents + (entersChili ? settings.suggestedChiliEntryCents : 0);
}

function numericCode(length: number) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % (10 ** length)).padStart(length, "0");
}

function isCodeCollision(error: unknown) {
  return error instanceof Error && /users\.check_in_code|check_in_code_unique/i.test(error.message);
}

function isIdempotencyCollision(error: unknown) {
  return error instanceof Error && /idempotency.*unique|idempotency_user_operation_key_unique/i.test(error.message);
}

export class RegistrationService {
  constructor(private readonly db: Database, private readonly generateCode: (length: number) => string = numericCode) {}

  async getRegistrationState(userId: number) {
    const [[user], [settings], [initialPledge]] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, userId)).limit(1),
      this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
      this.db.select({ id: pledges.id }).from(pledges).where(and(eq(pledges.userId, userId), eq(pledges.context, "initial"))).limit(1),
    ]);
    if (!user) throw new DomainError("APP_USER_NOT_FOUND", "Your account could not be found.", 404);
    if (!settings) throw new DomainError("EVENT_NOT_CONFIGURED", "Registration is not available yet.", 503);

    const registered = Boolean(user.registrationCompletedAt && user.role);
    const entersChili = user.role === "contestant";
    return {
      registrationState: registered ? "registered" as const : "status4" as const,
      partySize: user.partySize,
      role: user.role,
      entersChili,
      hasInitialPledge: Boolean(initialPledge),
      suggestedPledgeCents: registered && user.partySize
        ? calculateSuggestedInitialPledge(user.partySize, entersChili, settings)
        : null,
      settings: {
        minPartySize: settings.minPartySize,
        maxPartySize: settings.maxPartySize,
        suggestedAdmissionCents: settings.suggestedAdmissionCents,
        suggestedChiliEntryCents: settings.suggestedChiliEntryCents,
      },
    };
  }

  async completeRegistration(userId: number, input: RegistrationInput, idempotencyKey: string): Promise<RegistrationResult> {
    const requestHash = await hashRequestBody(input);
    const replay = await this.replay(userId, idempotencyKey, requestHash);
    if (replay) return replay;

    const [[user], [settings], [initialPledge]] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, userId)).limit(1),
      this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
      this.db.select({ id: pledges.id }).from(pledges).where(and(eq(pledges.userId, userId), eq(pledges.context, "initial"))).limit(1),
    ]);
    if (!user) throw new DomainError("APP_USER_NOT_FOUND", "Your account could not be found.", 404);
    if (user.role === "admin") throw new DomainError("ADMIN_REGISTRATION_FORBIDDEN", "Administrator accounts do not use attendee registration.", 403);
    if (initialPledge) throw new DomainError("REGISTRATION_LOCKED", "Your RSVP is already complete.", 409);
    if (!settings) throw new DomainError("EVENT_NOT_CONFIGURED", "Registration is not available yet.", 503);
    if (!Number.isInteger(input.partySize) || input.partySize < settings.minPartySize || input.partySize > settings.maxPartySize) {
      throw new DomainError("INVALID_PARTY_SIZE", `Party size must be between ${settings.minPartySize} and ${settings.maxPartySize}.`, 400);
    }

    const role = input.entersChili ? "contestant" as const : "guest" as const;
    const result: RegistrationResult = {
      partySize: input.partySize,
      role,
      issuedVoteCount: input.partySize,
      suggestedPledgeCents: calculateSuggestedInitialPledge(input.partySize, input.entersChili, settings),
      nextRoute: "/pledge",
    };

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const now = new Date().toISOString();
      const code = user.checkInCode ?? this.generateCode(settings.checkInCodeLength);
      try {
        const statements = [
          this.db.update(users).set({
            role,
            partySize: input.partySize,
            registrationCompletedAt: now,
            checkInCode: code,
            issuedVoteCount: input.partySize,
            availableVoteCount: input.partySize,
            updatedAt: now,
          }).where(eq(users.id, userId)),
          ...(input.entersChili && user.role !== "contestant" ? [this.db.insert(chilis).values({ cookUserId: userId, status: "draft", createdAt: now, updatedAt: now }).onConflictDoNothing()] : []),
          this.db.insert(idempotencyKeys).values({
            userId,
            operation: "registration.complete",
            idempotencyKey,
            requestHash,
            responseStatus: 201,
            responseJson: JSON.stringify({ data: result }),
            createdAt: now,
          }),
        ] as Parameters<Database["batch"]>[0];
        await this.db.batch(statements);
        return result;
      } catch (error) {
        if (isCodeCollision(error)) continue;
        if (isIdempotencyCollision(error)) {
          const concurrentReplay = await this.replay(userId, idempotencyKey, requestHash);
          if (concurrentReplay) return concurrentReplay;
        }
        throw error;
      }
    }
    throw new DomainError("CHECK_IN_CODE_UNAVAILABLE", "We could not reserve a check-in code. Please try again.", 503);
  }

  async updatePartySize(userId: number, partySize: number) {
    const [[user], [settings]] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, userId)).limit(1),
      this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
    ]);
    if (!user?.registrationCompletedAt || !user.role || user.role === "admin") throw new DomainError("REGISTRATION_REQUIRED", "Please finish attendee registration first.", 403);
    if (user.participationDisabledAt) throw new DomainError("PARTICIPATION_DISABLED", "Participation is currently disabled for this account.", 403);
    if (user.checkedInAt) throw new DomainError("PARTY_SIZE_LOCKED", "Party size cannot be changed after check-in.", 409);
    if (!settings || !Number.isInteger(partySize) || partySize < settings.minPartySize || partySize > settings.maxPartySize) {
      throw new DomainError("INVALID_PARTY_SIZE", `Party size must be between ${settings?.minPartySize ?? 1} and ${settings?.maxPartySize ?? 20}.`, 400);
    }
    const previousPartySize = user.partySize ?? settings.minPartySize;
    const delta = partySize - previousPartySize;
    if (!delta) return { partySize, issuedVoteCount: user.issuedVoteCount, availableVoteCount: user.availableVoteCount, changed: false };
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.update(users).set({
        partySize,
        issuedVoteCount: user.issuedVoteCount + delta,
        availableVoteCount: user.availableVoteCount + delta,
        updatedAt: now,
      }).where(and(eq(users.id, userId), isNull(users.checkedInAt))),
      this.db.insert(auditEntries).values({
        actorUserId: userId,
        action: "attendee.party_size_updated",
        entityType: "user",
        entityId: userId,
        reason: null,
        beforeJson: JSON.stringify({ partySize: previousPartySize, issuedVoteCount: user.issuedVoteCount, availableVoteCount: user.availableVoteCount }),
        afterJson: JSON.stringify({ partySize, issuedVoteCount: user.issuedVoteCount + delta, availableVoteCount: user.availableVoteCount + delta }),
        createdAt: now,
      }),
    ]);
    return { partySize, issuedVoteCount: user.issuedVoteCount + delta, availableVoteCount: user.availableVoteCount + delta, changed: true };
  }

  async addChiliEntry(userId: number, amountCents: number, idempotencyKey: string): Promise<GuestChiliEntryResult> {
    const input = { amountCents };
    const requestHash = await hashRequestBody(input);
    const replay = await this.replayChiliEntry(userId, idempotencyKey, requestHash);
    if (replay) return replay;
    if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new DomainError("INVALID_PLEDGE_AMOUNT", "Enter a valid pledge amount of zero or more.", 400);

    const [[user], [settings], [summary], [ownedChili]] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, userId)).limit(1),
      this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
      this.db.select({ total: sql<number>`coalesce(sum(${pledges.amountCents}), 0)` }).from(pledges).where(eq(pledges.userId, userId)),
      this.db.select({ id: chilis.id }).from(chilis).where(eq(chilis.cookUserId, userId)).limit(1),
    ]);
    if (!user?.registrationCompletedAt || user.role !== "guest") throw new DomainError("GUEST_ENTRY_REQUIRED", "Only registered guests can add a chili entry here.", 409);
    if (user.participationDisabledAt) throw new DomainError("PARTICIPATION_DISABLED", "Participation is currently disabled for this account.", 403);
    if (!settings) throw new DomainError("EVENT_NOT_CONFIGURED", "Chili entry is not available yet.", 503);
    if (user.checkedInAt || settings.votingIsOpen || settings.resultsAreFinal) throw new DomainError("CHILI_ENTRY_CLOSED", "Chili entries are closed because the event has started.", 409);
    if (ownedChili) throw new DomainError("CHILI_ALREADY_EXISTS", "This account already has a chili entry.", 409);

    const result: GuestChiliEntryResult = {
      purpose: "chili_entry",
      pledgedCents: amountCents,
      totalPledgedCents: Number(summary?.total ?? 0) + amountCents,
      gofundmeUrl: settings.gofundmeUrl ?? GOFUNDME_URL,
      nextRoute: "/thank-you",
      continueRoute: "/chili/edit",
      continueLabel: "Continue to chili entry",
    };
    const now = new Date().toISOString();
    try {
      await this.db.batch([
        this.db.update(users).set({ role: "contestant", updatedAt: now }).where(and(eq(users.id, userId), eq(users.role, "guest"), isNull(users.checkedInAt))),
        this.db.insert(chilis).values({ cookUserId: userId, status: "draft", createdAt: now, updatedAt: now }).onConflictDoNothing(),
        this.db.insert(pledges).values({ userId, context: "chili_entry", amountCents, additionalVoteCount: 0, reason: "Added chili entry", createdAt: now }),
        this.db.insert(auditEntries).values({
          actorUserId: userId,
          action: "attendee.chili_entry_added",
          entityType: "user",
          entityId: userId,
          reason: null,
          beforeJson: JSON.stringify({ role: "guest", totalPledgedCents: Number(summary?.total ?? 0) }),
          afterJson: JSON.stringify({ role: "contestant", chiliStatus: "draft", pledgedCents: amountCents, totalPledgedCents: result.totalPledgedCents }),
          createdAt: now,
        }),
        this.db.insert(idempotencyKeys).values({
          userId,
          operation: "registration.add_chili_entry",
          idempotencyKey,
          requestHash,
          responseStatus: 201,
          responseJson: JSON.stringify({ data: result }),
          createdAt: now,
        }),
      ]);
      return result;
    } catch (error) {
      const concurrentReplay = await this.replayChiliEntry(userId, idempotencyKey, requestHash);
      if (concurrentReplay) return concurrentReplay;
      throw error;
    }
  }

  private async replay(userId: number, key: string, requestHash: string): Promise<RegistrationResult | null> {
    const [record] = await this.db.select().from(idempotencyKeys).where(and(
      eq(idempotencyKeys.userId, userId),
      eq(idempotencyKeys.operation, "registration.complete"),
      eq(idempotencyKeys.idempotencyKey, key),
    )).limit(1);
    if (!record) return null;
    if (record.requestHash !== requestHash) throw new DomainError("IDEMPOTENCY_KEY_REUSED", "This request key was already used for different information.", 409);
    const body = JSON.parse(record.responseJson) as { data: RegistrationResult };
    return body.data;
  }

  private async replayChiliEntry(userId: number, key: string, requestHash: string): Promise<GuestChiliEntryResult | null> {
    const [record] = await this.db.select().from(idempotencyKeys).where(and(
      eq(idempotencyKeys.userId, userId),
      eq(idempotencyKeys.operation, "registration.add_chili_entry"),
      eq(idempotencyKeys.idempotencyKey, key),
    )).limit(1);
    if (!record) return null;
    if (record.requestHash !== requestHash) throw new DomainError("IDEMPOTENCY_KEY_REUSED", "This request key was already used for different information.", 409);
    const body = JSON.parse(record.responseJson) as { data: GuestChiliEntryResult };
    return body.data;
  }
}
