import { eq, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { userNoticeStates } from "@/db/schema";
import { isNoticeKey, NOTICE_VERSIONS, type NoticeKey, type NoticeStatus } from "@/lib/notices";
import { DomainError } from "@/server/domain-error";

type Database = ReturnType<typeof getDb>;

export class NoticeStateService {
  constructor(private readonly db: Database) {}

  async getForUser(userId: number) {
    return this.db.select({
      noticeKey: userNoticeStates.noticeKey,
      noticeVersion: userNoticeStates.noticeVersion,
      status: userNoticeStates.status,
    }).from(userNoticeStates).where(eq(userNoticeStates.userId, userId));
  }

  async record(userId: number, rawNoticeKey: string, status: NoticeStatus) {
    if (!isNoticeKey(rawNoticeKey)) throw new DomainError("NOTICE_NOT_FOUND", "That notice is not available.", 404);
    const noticeKey: NoticeKey = rawNoticeKey;
    const noticeVersion = NOTICE_VERSIONS[noticeKey];
    const now = new Date().toISOString();
    const terminalTimes = status === "completed"
      ? { completedAt: now, dismissedAt: null }
      : status === "dismissed"
        ? { dismissedAt: now, completedAt: null }
        : {};

    await this.db.insert(userNoticeStates).values({
      userId,
      noticeKey,
      noticeVersion,
      status,
      firstSeenAt: now,
      lastSeenAt: now,
      ...terminalTimes,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [userNoticeStates.userId, userNoticeStates.noticeKey, userNoticeStates.noticeVersion],
      set: {
        status,
        firstSeenAt: sql`coalesce(${userNoticeStates.firstSeenAt}, ${now})`,
        lastSeenAt: now,
        ...terminalTimes,
        updatedAt: now,
      },
    });

    return { noticeKey, noticeVersion, status };
  }
}
