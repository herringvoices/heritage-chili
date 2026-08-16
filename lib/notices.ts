export const NOTICE_VERSIONS = {
  attendee_dashboard_tutorial: 1,
  contestant_chili_tutorial: 1,
} as const;

export type NoticeKey = keyof typeof NOTICE_VERSIONS;
export type NoticeStatus = "seen" | "completed" | "dismissed";

export function isNoticeKey(value: string): value is NoticeKey {
  return value in NOTICE_VERSIONS;
}
