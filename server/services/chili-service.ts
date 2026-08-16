import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { chilis, chiliTags, chiliVotes, eventSettings, tags, users } from "@/db/schema";
import { DomainError } from "@/server/domain-error";
import { chiliIsComplete } from "./dashboard-query-service";

type Database = ReturnType<typeof getDb>;
export type ChiliInput = { name: string; description: string; spiceLevel: number; tagIds: number[] };

export class ChiliService {
  constructor(private readonly db: Database) {}

  async listAvailableTags() {
    return this.db.select({ id: tags.id, name: tags.name, slug: tags.slug, description: tags.description })
      .from(tags).where(eq(tags.isActive, true)).orderBy(asc(tags.sortOrder), asc(tags.name));
  }

  async listActiveChilis(userId: number, filters: { tag?: string; heat?: number } = {}) {
    const conditions = [eq(chilis.status, "active")];
    if (filters.heat !== undefined) conditions.push(eq(chilis.spiceLevel, filters.heat));
    const [userRows, eventRows, rows] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, userId)).limit(1),
      this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
      this.db.select({ id: chilis.id, name: chilis.name, description: chilis.description, spiceLevel: chilis.spiceLevel, imageObjectKey: chilis.imageObjectKey, contestantName: users.displayName })
        .from(chilis).innerJoin(users, eq(chilis.cookUserId, users.id)).where(and(...conditions)).orderBy(asc(chilis.name)),
    ]);
    const user = this.assertRegistered(userRows[0]);
    const event = eventRows[0];
    const chiliIds = rows.map((chili) => chili.id);
    const [tagRows, personalRows] = chiliIds.length
      ? await Promise.all([
          this.db.select({ chiliId: chiliTags.chiliId, id: tags.id, name: tags.name, slug: tags.slug })
            .from(chiliTags).innerJoin(tags, eq(chiliTags.tagId, tags.id)).where(inArray(chiliTags.chiliId, chiliIds)).orderBy(asc(tags.sortOrder), asc(tags.name)),
          this.db.select({ chiliId: chiliVotes.chiliId, count: count() }).from(chiliVotes)
            .where(and(eq(chiliVotes.userId, userId), inArray(chiliVotes.chiliId, chiliIds))).groupBy(chiliVotes.chiliId),
        ])
      : [[], []];
    const tagsByChili = new Map<number, Array<{ id: number; name: string; slug: string }>>();
    for (const tag of tagRows) {
      const selected = tagsByChili.get(tag.chiliId) ?? [];
      selected.push({ id: tag.id, name: tag.name, slug: tag.slug });
      tagsByChili.set(tag.chiliId, selected);
    }
    const personalVotesByChili = new Map(personalRows.map((row) => [row.chiliId, row.count]));
    const models = rows.map((chili) => ({
      ...chili,
      imageUrl: chili.imageObjectKey ? `/api/chilis/${chili.id}/image` : null,
      tags: tagsByChili.get(chili.id) ?? [],
      personalVoteCount: personalVotesByChili.get(chili.id) ?? 0,
      voteEligibility: this.eligibilityFor(user, event, chili.id),
    }));
    return filters.tag ? models.filter((chili) => chili.tags.some((tag) => tag.slug === filters.tag)) : models;
  }

  async getActiveChiliDetails(userId: number, chiliId: number) {
    const user = await this.requireRegistered(userId);
    const [chili] = await this.db.select({ id: chilis.id, name: chilis.name, description: chilis.description, spiceLevel: chilis.spiceLevel, imageObjectKey: chilis.imageObjectKey, contestantName: users.displayName })
      .from(chilis).innerJoin(users, eq(chilis.cookUserId, users.id)).where(and(eq(chilis.id, chiliId), eq(chilis.status, "active"))).limit(1);
    if (!chili) throw new DomainError("CHILI_NOT_FOUND", "That active chili could not be found.", 404);
    const [personal] = await this.db.select({ count: count() }).from(chiliVotes).where(and(eq(chiliVotes.userId, userId), eq(chiliVotes.chiliId, chiliId)));
    return { ...chili, imageUrl: chili.imageObjectKey ? `/api/chilis/${chili.id}/image` : null, tags: await this.tagsFor(chili.id), personalVoteCount: personal?.count ?? 0, voteEligibility: await this.eligibility(user, chiliId) };
  }

  async getOwnedChili(userId: number) {
    await this.requireContestant(userId);
    const [chili] = await this.db.select().from(chilis).where(eq(chilis.cookUserId, userId)).limit(1);
    return chili ? this.toEditorModel(chili) : null;
  }

  async createOwnedChili(userId: number, input: ChiliInput) {
    await this.requireContestant(userId);
    this.validateInput(input);
    const [existing] = await this.db.select({ id: chilis.id }).from(chilis).where(eq(chilis.cookUserId, userId)).limit(1);
    if (existing) throw new DomainError("CHILI_ALREADY_EXISTS", "You already have a chili entry.", 409);
    await this.validateTags(input.tagIds);
    await this.assertUniqueName(input.name);

    const now = new Date().toISOString();
    const [created] = await this.db.insert(chilis).values({ cookUserId: userId, name: input.name.trim(), description: input.description.trim(), spiceLevel: input.spiceLevel, status: "draft", createdAt: now, updatedAt: now }).returning();
    if (!created) throw new DomainError("CHILI_CREATE_FAILED", "Your chili entry could not be created.", 500);
    if (input.tagIds.length) await this.db.batch(input.tagIds.map((tagId) => this.db.insert(chiliTags).values({ chiliId: created.id, tagId })));
    return this.toEditorModel(created);
  }

  async updateOwnedChili(actorUserId: number, chiliId: number, input: ChiliInput) {
    this.validateInput(input);
    const [[actor], [chili]] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, actorUserId)).limit(1),
      this.db.select().from(chilis).where(eq(chilis.id, chiliId)).limit(1),
    ]);
    if (!actor?.registrationCompletedAt || !actor.role) throw new DomainError("REGISTRATION_REQUIRED", "Please finish registration first.", 403);
    if (!chili) throw new DomainError("CHILI_NOT_FOUND", "That chili entry could not be found.", 404);
    if (actor.role !== "admin" && (actor.role !== "contestant" || chili.cookUserId !== actorUserId)) {
      throw new DomainError("CHILI_EDIT_FORBIDDEN", "You may only edit your own chili entry.", 403);
    }
    if (actor.role !== "admin" && actor.participationDisabledAt) throw new DomainError("PARTICIPATION_DISABLED", "Participation is currently disabled for this account.", 403);
    await this.validateTags(input.tagIds);
    await this.assertUniqueName(input.name, chiliId);

    const update = this.db.update(chilis).set({ name: input.name.trim(), description: input.description.trim(), spiceLevel: input.spiceLevel, updatedAt: new Date().toISOString() }).where(eq(chilis.id, chiliId));
    const statements = [update, this.db.delete(chiliTags).where(eq(chiliTags.chiliId, chiliId)), ...input.tagIds.map((tagId) => this.db.insert(chiliTags).values({ chiliId, tagId }))];
    await this.db.batch(statements);
    const [updated] = await this.db.select().from(chilis).where(eq(chilis.id, chiliId)).limit(1);
    return this.toEditorModel(updated!);
  }

  private async requireContestant(userId: number) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.registrationCompletedAt || user.role !== "contestant") throw new DomainError("CONTESTANT_REQUIRED", "Contestant access is required.", 403);
    if (user.participationDisabledAt) throw new DomainError("PARTICIPATION_DISABLED", "Participation is currently disabled for this account.", 403);
    return user;
  }

  private async requireRegistered(userId: number) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return this.assertRegistered(user);
  }

  private async eligibility(user: typeof users.$inferSelect, chiliId: number) {
    const [event] = await this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1);
    return this.eligibilityFor(user, event, chiliId);
  }

  private assertRegistered(user: typeof users.$inferSelect | undefined) {
    if (!user?.registrationCompletedAt || !user.role) throw new DomainError("REGISTRATION_REQUIRED", "Please finish registration first.", 403);
    return user;
  }

  private eligibilityFor(user: typeof users.$inferSelect, event: typeof eventSettings.$inferSelect | undefined, chiliId: number) {
    let reason: string | null = null;
    if (user.participationDisabledAt) reason = "Participation is paused.";
    else if (!user.checkedInAt) reason = "Check in before voting.";
    else if (event?.resultsAreFinal) reason = "Results are final.";
    else if (!event?.votingIsOpen) reason = "Voting is closed.";
    else if (user.availableVoteCount < 1) reason = "No votes remain.";
    return { canVote: reason === null, reason, availableVoteCount: user.availableVoteCount, chiliId };
  }

  private tagsFor(chiliId: number) {
    return this.db.select({ id: tags.id, name: tags.name, slug: tags.slug }).from(chiliTags).innerJoin(tags, eq(chiliTags.tagId, tags.id)).where(eq(chiliTags.chiliId, chiliId)).orderBy(asc(tags.sortOrder), asc(tags.name));
  }

  private validateInput(input: ChiliInput) {
    if (!input.name.trim()) throw new DomainError("CHILI_NAME_REQUIRED", "Give your chili a title.", 400);
    if (!input.description.trim()) throw new DomainError("CHILI_DESCRIPTION_REQUIRED", "Add a description for your chili.", 400);
    if (!Number.isInteger(input.spiceLevel) || input.spiceLevel < 0 || input.spiceLevel > 5) throw new DomainError("INVALID_SPICE_LEVEL", "Choose a heat level from 0 through 5.", 400);
    if (new Set(input.tagIds).size !== input.tagIds.length) throw new DomainError("DUPLICATE_TAG", "Each tag may be selected once.", 400);
  }

  private async validateTags(tagIds: number[]) {
    if (!tagIds.length) return;
    const active = await this.db.select({ id: tags.id }).from(tags).where(and(inArray(tags.id, tagIds), eq(tags.isActive, true)));
    if (active.length !== tagIds.length) throw new DomainError("INVALID_TAGS", "One or more selected tags are unavailable.", 400);
  }

  private async assertUniqueName(name: string, exceptId?: number) {
    const condition = exceptId
      ? and(sql`lower(${chilis.name}) = lower(${name.trim()})`, ne(chilis.id, exceptId))
      : sql`lower(${chilis.name}) = lower(${name.trim()})`;
    const [collision] = await this.db.select({ id: chilis.id }).from(chilis).where(condition).limit(1);
    if (collision) throw new DomainError("CHILI_NAME_TAKEN", "That chili title is already in use.", 409);
  }

  private async toEditorModel(chili: typeof chilis.$inferSelect) {
    const selectedTags = await this.db.select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(chiliTags).innerJoin(tags, eq(chiliTags.tagId, tags.id)).where(eq(chiliTags.chiliId, chili.id)).orderBy(tags.sortOrder, tags.name);
    return {
      id: chili.id,
      name: chili.name,
      description: chili.description,
      spiceLevel: chili.spiceLevel,
      status: chili.status,
      complete: chiliIsComplete(chili),
      imageUrl: chili.imageObjectKey ? `/api/chilis/${chili.id}/image` : null,
      tags: selectedTags,
    };
  }
}
