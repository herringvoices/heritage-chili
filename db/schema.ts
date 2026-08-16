import { sql } from "drizzle-orm";
import {
  check,
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    role: text("role", { enum: ["guest", "contestant", "admin"] }),
    registrationCompletedAt: text("registration_completed_at"),
    partySize: integer("party_size"),
    checkInCode: text("check_in_code").unique(),
    checkedInAt: text("checked_in_at"),
    checkedInByUserId: integer("checked_in_by_user_id").references((): AnySQLiteColumn => users.id),
    participationDisabledAt: text("participation_disabled_at"),
    participationDisabledByUserId: integer("participation_disabled_by_user_id").references((): AnySQLiteColumn => users.id),
    participationDisabledReason: text("participation_disabled_reason"),
    issuedVoteCount: integer("issued_vote_count").notNull().default(0),
    availableVoteCount: integer("available_vote_count").notNull().default(0),
    ...timestamps,
    lastSeenAt: text("last_seen_at"),
  },
  (table) => [
    index("users_email_idx").on(table.email),
    index("users_role_idx").on(table.role),
    index("users_registration_completed_at_idx").on(table.registrationCompletedAt),
    index("users_checked_in_at_idx").on(table.checkedInAt),
    uniqueIndex("users_display_name_ci_unique").on(sql`lower(${table.displayName})`),
    check("users_available_votes_nonnegative", sql`${table.availableVoteCount} >= 0`),
    check("users_issued_votes_nonnegative", sql`${table.issuedVoteCount} >= 0`),
    check("users_role_valid", sql`${table.role} IS NULL OR ${table.role} IN ('guest','contestant','admin')`),
  ],
);

export const chilis = sqliteTable(
  "chilis",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cookUserId: integer("cook_user_id").notNull().unique().references(() => users.id),
    name: text("name"),
    description: text("description"),
    spiceLevel: integer("spice_level"),
    imageObjectKey: text("image_object_key"),
    status: text("status", { enum: ["draft", "active", "inactive", "disqualified"] }).notNull().default("draft"),
    statusReason: text("status_reason"),
    activatedAt: text("activated_at"),
    activatedByUserId: integer("activated_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("chilis_status_idx").on(table.status),
    uniqueIndex("chilis_name_ci_unique").on(sql`lower(${table.name})`),
    check("chilis_spice_level_range", sql`${table.spiceLevel} IS NULL OR (${table.spiceLevel} >= 0 AND ${table.spiceLevel} <= 5)`),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [uniqueIndex("tags_name_ci_unique").on(sql`lower(${table.name})`)],
);

export const chiliTags = sqliteTable(
  "chili_tags",
  {
    chiliId: integer("chili_id").notNull().references(() => chilis.id),
    tagId: integer("tag_id").notNull().references(() => tags.id),
  },
  (table) => [primaryKey({ columns: [table.chiliId, table.tagId] })],
);

export const chiliVotes = sqliteTable(
  "chili_votes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    chiliId: integer("chili_id").notNull().references(() => chilis.id),
    idempotencyKey: text("idempotency_key"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("chili_votes_user_idx").on(table.userId), index("chili_votes_chili_idx").on(table.chiliId), index("chili_votes_user_chili_idx").on(table.userId, table.chiliId), uniqueIndex("chili_votes_user_idempotency_unique").on(table.userId, table.idempotencyKey)],
);

export const pledges = sqliteTable(
  "pledges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    recordedByUserId: integer("recorded_by_user_id").references(() => users.id),
    context: text("context", { enum: ["initial", "chili_entry", "additional_votes", "admin", "correction", "reversal"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    additionalVoteCount: integer("additional_vote_count").notNull().default(0),
    correctsPledgeId: integer("corrects_pledge_id").references((): AnySQLiteColumn => pledges.id),
    reason: text("reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("pledges_user_idx").on(table.userId), index("pledges_context_idx").on(table.context), index("pledges_corrects_idx").on(table.correctsPledgeId), index("pledges_created_idx").on(table.createdAt)],
);

export const voteAdjustments = sqliteTable(
  "vote_adjustments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    adjustedByUserId: integer("adjusted_by_user_id").notNull().references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("vote_adjustments_user_idx").on(table.userId), index("vote_adjustments_admin_idx").on(table.adjustedByUserId), index("vote_adjustments_created_idx").on(table.createdAt)],
);

export const eventSettings = sqliteTable("event_settings", {
  id: integer("id").primaryKey(),
  eventName: text("event_name").notNull().default("Chili Cookoff"),
  pledgeGoalCents: integer("pledge_goal_cents").notNull().default(100000),
  gofundmeUrl: text("gofundme_url"),
  minPartySize: integer("min_party_size").notNull().default(1),
  maxPartySize: integer("max_party_size").notNull().default(20),
  suggestedAdmissionCents: integer("suggested_admission_cents").notNull().default(1500),
  suggestedChiliEntryCents: integer("suggested_chili_entry_cents").notNull().default(1000),
  suggestedAdditionalVoteCents: integer("suggested_additional_vote_cents").notNull().default(1000),
  checkInCodeLength: integer("check_in_code_length").notNull().default(4),
  votingIsOpen: integer("voting_is_open", { mode: "boolean" }).notNull().default(false),
  standingsAreVisible: integer("standings_are_visible", { mode: "boolean" }).notNull().default(true),
  resultsAreFinal: integer("results_are_final", { mode: "boolean" }).notNull().default(false),
  resultsFinalizedAt: text("results_finalized_at"),
  resultsFinalizedByUserId: integer("results_finalized_by_user_id").references(() => users.id),
  ...timestamps,
});

export const officialResults = sqliteTable("official_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chiliId: integer("chili_id").notNull().unique().references(() => chilis.id),
  placement: integer("placement").notNull().unique(),
  voteCountAtFinalization: integer("vote_count_at_finalization").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [check("official_results_placement_range", sql`${table.placement} BETWEEN 1 AND 3`)]);

export const auditEntries = sqliteTable(
  "audit_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorUserId: integer("actor_user_id").notNull().references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type", { enum: ["user", "chili", "pledge", "event", "result"] }).notNull(),
    entityId: integer("entity_id"),
    reason: text("reason"),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("audit_actor_idx").on(table.actorUserId), index("audit_entity_idx").on(table.entityType, table.entityId), index("audit_action_idx").on(table.action), index("audit_created_idx").on(table.createdAt)],
);

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    operation: text("operation").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseJson: text("response_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at"),
  },
  (table) => [uniqueIndex("idempotency_user_operation_key_unique").on(table.userId, table.operation, table.idempotencyKey), index("idempotency_expires_idx").on(table.expiresAt)],
);

export const userNoticeStates = sqliteTable(
  "user_notice_states",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    noticeKey: text("notice_key").notNull(),
    noticeVersion: integer("notice_version").notNull().default(1),
    status: text("status", { enum: ["seen", "completed", "dismissed"] }).notNull(),
    firstSeenAt: text("first_seen_at"),
    lastSeenAt: text("last_seen_at"),
    completedAt: text("completed_at"),
    dismissedAt: text("dismissed_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_notice_states_user_key_version_unique").on(table.userId, table.noticeKey, table.noticeVersion),
    index("user_notice_states_user_idx").on(table.userId),
    index("user_notice_states_status_idx").on(table.status),
    check("user_notice_states_status_valid", sql`${table.status} IN ('seen','completed','dismissed')`),
  ],
);
