import { and, eq } from "drizzle-orm";
import type { getDb } from "@/db";
import { idempotencyKeys } from "@/db/schema";
import { DomainError } from "@/server/domain-error";

type Database = ReturnType<typeof getDb>;

export async function hashRequestBody(body: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export class IdempotencyService {
  constructor(private readonly db: Database) {}

  async replay(userId: number, operation: string, key: string, requestHash: string) {
    const [record] = await this.db.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.operation, operation), eq(idempotencyKeys.idempotencyKey, key))).limit(1);
    if (!record) return null;
    if (record.requestHash !== requestHash) {
      throw new DomainError("IDEMPOTENCY_KEY_REUSED", "This request key was already used for different information.", 409);
    }
    return { status: record.responseStatus, body: JSON.parse(record.responseJson) as unknown };
  }

  async store(userId: number, operation: string, key: string, requestHash: string, status: number, body: unknown) {
    await this.db.insert(idempotencyKeys).values({
      userId,
      operation,
      idempotencyKey: key,
      requestHash,
      responseStatus: status,
      responseJson: JSON.stringify(body),
      createdAt: new Date().toISOString(),
    });
  }
}
