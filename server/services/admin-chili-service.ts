import { and, asc, eq, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { auditEntries, chiliTags, chiliVotes, chilis, eventSettings, tags, users } from "@/db/schema";
import { DomainError } from "@/server/domain-error";
import { ChiliService, type ChiliInput } from "./chili-service";
import { chiliIsComplete } from "./dashboard-query-service";

type Database = ReturnType<typeof getDb>;
type Status = "draft" | "active" | "inactive" | "disqualified";

export class AdminChiliService {
  constructor(private readonly db: Database) {}

  async listAllChilis() {
    const rows = await this.db.select({
      id: chilis.id, name: chilis.name, description: chilis.description, spiceLevel: chilis.spiceLevel,
      status: chilis.status, activatedAt: chilis.activatedAt, imageObjectKey: chilis.imageObjectKey, contestantId: users.id,
      contestantName: users.displayName, contestantCheckedInAt: users.checkedInAt,
      voteCount: sql<number>`count(${chiliVotes.id})`,
    }).from(chilis).innerJoin(users, eq(users.id, chilis.cookUserId)).leftJoin(chiliVotes, eq(chiliVotes.chiliId, chilis.id))
      .groupBy(chilis.id, users.id).orderBy(asc(chilis.name));
    const voteCounts = rows.map((row) => Number(row.voteCount)).sort((a, b) => b - a);
    const hasVotes = voteCounts.some((count) => count > 0);
    return Promise.all(rows.map(async (row) => ({
      ...row, contestantName: row.contestantName ?? "Unnamed contestant", voteCount: Number(row.voteCount), rank: hasVotes ? voteCounts.indexOf(Number(row.voteCount)) + 1 : null,
      complete: chiliIsComplete(row), imageUrl: row.imageObjectKey ? `/api/chilis/${row.id}/image` : null,
      tags: await this.tagsFor(row.id),
    })));
  }

  async getAdminChiliDetails(chiliId: number) {
    const [row] = await this.db.select({
      id: chilis.id, name: chilis.name, description: chilis.description, spiceLevel: chilis.spiceLevel,
      status: chilis.status, statusReason: chilis.statusReason, imageObjectKey: chilis.imageObjectKey,
      createdAt: chilis.createdAt, updatedAt: chilis.updatedAt, activatedAt: chilis.activatedAt,
      contestantId: users.id, contestantName: users.displayName, contestantEmail: users.email,
      contestantCheckedInAt: users.checkedInAt, voteCount: sql<number>`count(${chiliVotes.id})`,
    }).from(chilis).innerJoin(users, eq(users.id, chilis.cookUserId)).leftJoin(chiliVotes, eq(chiliVotes.chiliId, chilis.id))
      .where(eq(chilis.id, chiliId)).groupBy(chilis.id, users.id).limit(1);
    if (!row) throw new DomainError("CHILI_NOT_FOUND", "That chili entry could not be found.", 404);
    const voteRows = await this.db.select({ chiliId: chiliVotes.chiliId, voteCount: sql<number>`count(${chiliVotes.id})` }).from(chiliVotes).groupBy(chiliVotes.chiliId);
    const orderedCounts = voteRows.map((item) => Number(item.voteCount)).sort((a, b) => b - a);
    const voteCount = Number(row.voteCount);
    const rankedIndex = orderedCounts.indexOf(voteCount);
    const rank = orderedCounts.length ? (rankedIndex >= 0 ? rankedIndex + 1 : orderedCounts.length + 1) : null;
    return { ...row, contestantName: row.contestantName ?? "Unnamed contestant", voteCount, rank, complete: chiliIsComplete(row), imageUrl: row.imageObjectKey ? `/api/chilis/${row.id}/image` : null, tags: await this.tagsFor(chiliId) };
  }

  async editChiliAsAdmin(adminId: number, chiliId: number, input: ChiliInput) {
    await this.requireAdmin(adminId);
    return new ChiliService(this.db).updateOwnedChili(adminId, chiliId, input);
  }

  async activateChili(adminId: number, chiliId: number, physicalArrived: boolean) {
    if (!physicalArrived) throw new DomainError("CHILI_ARRIVAL_CONFIRMATION_REQUIRED", "Confirm that the physical chili has arrived.", 400);
    return this.transition(adminId, chiliId, "active", null, ["draft", "inactive"]);
  }

  async deactivateChili(adminId: number, chiliId: number, reason?: string) {
    return this.transition(adminId, chiliId, "inactive", this.reason(reason), ["active"]);
  }

  async disqualifyChili(adminId: number, chiliId: number, reason?: string) {
    return this.transition(adminId, chiliId, "disqualified", this.reason(reason), ["draft", "active", "inactive"]);
  }

  async restoreChili(adminId: number, chiliId: number, status: "draft" | "active", reason?: string, physicalArrived = false) {
    if (status === "active" && !physicalArrived) throw new DomainError("CHILI_ARRIVAL_CONFIRMATION_REQUIRED", "Confirm that the physical chili has arrived before restoring it as active.", 400);
    return this.transition(adminId, chiliId, status, this.reason(reason), ["inactive", "disqualified"]);
  }

  private async transition(adminId: number, chiliId: number, status: Status, reason: string | null, allowed: Status[]) {
    await this.requireAdmin(adminId);
    const [[chili], [settings]] = await Promise.all([
      this.db.select().from(chilis).where(eq(chilis.id, chiliId)).limit(1),
      this.db.select({ resultsAreFinal: eventSettings.resultsAreFinal }).from(eventSettings).where(eq(eventSettings.id, 1)).limit(1),
    ]);
    if (!chili) throw new DomainError("CHILI_NOT_FOUND", "That chili entry could not be found.", 404);
    if (settings?.resultsAreFinal) throw new DomainError("RESULTS_FINAL", "Chili status cannot change after results are final.", 409);
    if (!allowed.includes(chili.status)) throw new DomainError("INVALID_CHILI_STATUS_TRANSITION", `This chili cannot move from ${chili.status} to ${status}.`, 409);
    if (status === "active" && !chiliIsComplete(chili)) throw new DomainError("CHILI_INCOMPLETE", "Add a title, description, and valid heat level before activation.", 409);
    const now = new Date().toISOString();
    const next = { status, statusReason: reason, activatedAt: status === "active" ? now : chili.activatedAt, activatedByUserId: status === "active" ? adminId : chili.activatedByUserId, updatedAt: now };
    const update = await this.db.update(chilis).set(next)
      .where(and(eq(chilis.id, chiliId), eq(chilis.status, chili.status), eq(chilis.updatedAt, chili.updatedAt)));
    if (update?.meta?.changes === 0) throw new DomainError("CHILI_STATUS_CONFLICT", "This chili changed in another session. Refresh and try again.", 409);
    await this.db.insert(auditEntries).values({
      actorUserId: adminId,
      action: `chili.${status}`,
      entityType: "chili",
      entityId: chiliId,
      reason,
      beforeJson: JSON.stringify({ status: chili.status, statusReason: chili.statusReason }),
      afterJson: JSON.stringify({ status, statusReason: reason }),
      createdAt: now,
    });
    return { id: chiliId, status, statusReason: reason, voteCountPreserved: true };
  }

  private async requireAdmin(adminId: number) {
    const [admin] = await this.db.select({ role: users.role, registrationCompletedAt: users.registrationCompletedAt }).from(users).where(eq(users.id, adminId)).limit(1);
    if (admin?.role !== "admin" || !admin.registrationCompletedAt) throw new DomainError("ADMIN_REQUIRED", "Administrator access is required.", 403);
  }

  private reason(value?: string) { return value?.trim() || null; }

  private async tagsFor(chiliId: number) {
    return this.db.select({ id: tags.id, name: tags.name, slug: tags.slug }).from(chiliTags)
      .innerJoin(tags, eq(tags.id, chiliTags.tagId)).where(eq(chiliTags.chiliId, chiliId)).orderBy(asc(tags.sortOrder), asc(tags.name));
  }
}
