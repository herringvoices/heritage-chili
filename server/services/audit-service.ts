import { and, desc, eq, like } from "drizzle-orm";
import type { getDb } from "@/db";
import { auditEntries, users } from "@/db/schema";

type Database = ReturnType<typeof getDb>;

export class AuditService {
  constructor(private readonly db: Database) {}
  async listAuditEntries(filters: { entityType?: string; entityId?: number; action?: string } = {}) {
    const conditions = [];
    if (["user", "chili", "pledge", "event", "result"].includes(filters.entityType ?? "")) conditions.push(eq(auditEntries.entityType, filters.entityType as "user" | "chili" | "pledge" | "event" | "result"));
    if (Number.isInteger(filters.entityId)) conditions.push(eq(auditEntries.entityId, filters.entityId!));
    if (filters.action?.trim()) conditions.push(like(auditEntries.action, `%${filters.action.trim()}%`));
    return this.db.select({ id: auditEntries.id, actorUserId: auditEntries.actorUserId, actorName: users.displayName, action: auditEntries.action, entityType: auditEntries.entityType, entityId: auditEntries.entityId, reason: auditEntries.reason, beforeJson: auditEntries.beforeJson, afterJson: auditEntries.afterJson, createdAt: auditEntries.createdAt }).from(auditEntries).innerJoin(users, eq(users.id, auditEntries.actorUserId)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(auditEntries.createdAt)).limit(200);
  }
}
