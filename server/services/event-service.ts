import { and, count, eq, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { auditEntries, chilis, chiliVotes, eventSettings, users } from "@/db/schema";
import { DomainError } from "@/server/domain-error";

type Database = ReturnType<typeof getDb>;

export function buildEventChangeStatements(
  db: Database,
  adminId: number,
  before: typeof eventSettings.$inferSelect,
  values: Partial<typeof eventSettings.$inferInsert>,
  action: string,
  updatedAt: string,
) {
  const after = { ...before, ...values, updatedAt };
  const unchanged = and(eq(eventSettings.id, 1), eq(eventSettings.updatedAt, before.updatedAt));

  return [
    // D1 batches accept prepared Drizzle queries, not a bare `sql` fragment.
    // Select from the guarded settings row so the audit is written only when
    // the following optimistic update can succeed.
    db.insert(auditEntries).select((qb) => qb.select({
      id: sql<number | null>`NULL`,
      actorUserId: sql<number>`${adminId}`,
      action: sql<string>`${action}`,
      entityType: sql<"event">`'event'`,
      entityId: sql<number>`1`,
      reason: sql<string | null>`NULL`,
      beforeJson: sql<string>`${JSON.stringify(before)}`,
      afterJson: sql<string>`${JSON.stringify(after)}`,
      createdAt: sql<string>`CURRENT_TIMESTAMP`,
    }).from(eventSettings).where(unchanged)),
    db.update(eventSettings).set({ ...values, updatedAt }).where(unchanged),
  ] as const;
}

export class EventService {
  constructor(private readonly db: Database) {}

  async getPublicEventState() {
    const settings = await this.settings();
    return {
      eventName: settings.eventName,
      pledgeGoalCents: settings.pledgeGoalCents,
      gofundmeUrl: settings.gofundmeUrl,
      votingIsOpen: settings.votingIsOpen,
      standingsAreVisible: settings.standingsAreVisible,
      resultsAreFinal: settings.resultsAreFinal,
    };
  }

  async getAdminEventState() {
    const [settings, [active], [votes]] = await Promise.all([
      this.settings(),
      this.db.select({ count: count() }).from(chilis).where(eq(chilis.status, "active")),
      this.db.select({ count: count() }).from(chiliVotes),
    ]);
    return { ...settings, activeChiliCount: active?.count ?? 0, exactVoteCount: votes?.count ?? 0 };
  }

  async openVoting(adminId: number) {
    await this.requireAdmin(adminId);
    const before = await this.settings();
    if (before.resultsAreFinal) throw new DomainError("RESULTS_FINAL", "Final results must be reopened before voting can open.", 409);
    if (before.votingIsOpen) return { ...(await this.getAdminEventState()), replayed: true };
    const [active] = await this.db.select({ count: count() }).from(chilis).where(eq(chilis.status, "active"));
    if (!active?.count) throw new DomainError("NO_ACTIVE_CHILIS", "Activate at least one chili before opening voting.", 409);
    const changed = await this.change(adminId, before, { votingIsOpen: true }, "event.voting_opened");
    return { ...(await this.getAdminEventState()), replayed: !changed };
  }

  async closeVoting(adminId: number) {
    await this.requireAdmin(adminId);
    const before = await this.settings();
    if (!before.votingIsOpen) return { ...(await this.getAdminEventState()), replayed: true };
    const changed = await this.change(adminId, before, { votingIsOpen: false }, "event.voting_closed");
    return { ...(await this.getAdminEventState()), replayed: !changed };
  }

  async setStandingsVisibility(adminId: number, isVisible: boolean) {
    await this.requireAdmin(adminId);
    const before = await this.settings();
    if (before.standingsAreVisible === isVisible) return { ...(await this.getAdminEventState()), replayed: true };
    const changed = await this.change(adminId, before, { standingsAreVisible: isVisible }, "event.standings_visibility_changed");
    return { ...(await this.getAdminEventState()), replayed: !changed };
  }

  async updatePledgeGoal(adminId: number, amountCents: number) {
    if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new DomainError("INVALID_PLEDGE_GOAL", "Enter a valid nonnegative pledge goal.", 400);
    await this.requireAdmin(adminId);
    const before = await this.settings();
    if (before.pledgeGoalCents === amountCents) return { ...(await this.getAdminEventState()), replayed: true };
    const changed = await this.change(adminId, before, { pledgeGoalCents: amountCents }, "event.pledge_goal_changed");
    return { ...(await this.getAdminEventState()), replayed: !changed };
  }

  async updateGoFundMeUrl(adminId: number, value: string | null) {
    const trimmed = value?.trim() || null;
    if (trimmed) {
      let parsed: URL;
      try { parsed = new URL(trimmed); } catch { throw new DomainError("INVALID_GOFUNDME_URL", "Enter a complete HTTPS GoFundMe URL.", 400); }
      if (parsed.protocol !== "https:" || !/(^|\.)gofundme\.com$/i.test(parsed.hostname)) throw new DomainError("INVALID_GOFUNDME_URL", "Enter a secure gofundme.com URL.", 400);
    }
    await this.requireAdmin(adminId);
    const before = await this.settings();
    if (before.gofundmeUrl === trimmed) return { ...(await this.getAdminEventState()), replayed: true };
    const changed = await this.change(adminId, before, { gofundmeUrl: trimmed }, "event.gofundme_url_changed");
    return { ...(await this.getAdminEventState()), replayed: !changed };
  }

  private async settings() {
    const [settings] = await this.db.select().from(eventSettings).where(eq(eventSettings.id, 1)).limit(1);
    if (!settings) throw new DomainError("EVENT_SETTINGS_MISSING", "Event settings are unavailable.", 500);
    return settings;
  }

  private async requireAdmin(id: number) {
    const [user] = await this.db.select({ role: users.role, registrationCompletedAt: users.registrationCompletedAt }).from(users).where(eq(users.id, id)).limit(1);
    if (user?.role !== "admin" || !user.registrationCompletedAt) throw new DomainError("ADMIN_REQUIRED", "Administrator access is required.", 403);
  }

  private async change(adminId: number, before: typeof eventSettings.$inferSelect, values: Partial<typeof eventSettings.$inferInsert>, action: string) {
    const statements = buildEventChangeStatements(this.db, adminId, before, values, action, new Date().toISOString());
    const results = await this.db.batch(statements);
    const update = results[1] as { meta?: { changes?: number } } | undefined;
    return update?.meta?.changes !== 0;
  }
}
