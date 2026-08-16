CREATE TABLE `audit_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` integer NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer,
	`reason` text,
	`before_json` text,
	`after_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_entries` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_entries` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_action_idx` ON `audit_entries` (`action`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_entries` (`created_at`);--> statement-breakpoint
CREATE TABLE `chili_tags` (
	`chili_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`chili_id`, `tag_id`),
	FOREIGN KEY (`chili_id`) REFERENCES `chilis`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `chili_votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`chili_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chili_id`) REFERENCES `chilis`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chili_votes_user_idx` ON `chili_votes` (`user_id`);--> statement-breakpoint
CREATE INDEX `chili_votes_chili_idx` ON `chili_votes` (`chili_id`);--> statement-breakpoint
CREATE INDEX `chili_votes_user_chili_idx` ON `chili_votes` (`user_id`,`chili_id`);--> statement-breakpoint
CREATE TABLE `chilis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cook_user_id` integer NOT NULL,
	`name` text,
	`description` text,
	`spice_level` integer,
	`image_object_key` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`status_reason` text,
	`activated_at` text,
	`activated_by_user_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`cook_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chilis_spice_level_range" CHECK("chilis"."spice_level" IS NULL OR ("chilis"."spice_level" >= 0 AND "chilis"."spice_level" <= 5))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chilis_cook_user_id_unique` ON `chilis` (`cook_user_id`);--> statement-breakpoint
CREATE INDEX `chilis_status_idx` ON `chilis` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `chilis_name_ci_unique` ON `chilis` (lower("name"));--> statement-breakpoint
CREATE TABLE `event_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`event_name` text DEFAULT 'Chili Cookoff' NOT NULL,
	`pledge_goal_cents` integer DEFAULT 100000 NOT NULL,
	`gofundme_url` text,
	`min_party_size` integer DEFAULT 1 NOT NULL,
	`max_party_size` integer DEFAULT 20 NOT NULL,
	`suggested_admission_cents` integer DEFAULT 1500 NOT NULL,
	`suggested_chili_entry_cents` integer DEFAULT 1000 NOT NULL,
	`suggested_additional_vote_cents` integer DEFAULT 1000 NOT NULL,
	`check_in_code_length` integer DEFAULT 4 NOT NULL,
	`voting_is_open` integer DEFAULT false NOT NULL,
	`standings_are_visible` integer DEFAULT true NOT NULL,
	`results_are_final` integer DEFAULT false NOT NULL,
	`results_finalized_at` text,
	`results_finalized_by_user_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`results_finalized_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`operation` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_status` integer NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_user_operation_key_unique` ON `idempotency_keys` (`user_id`,`operation`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idempotency_expires_idx` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE TABLE `official_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chili_id` integer NOT NULL,
	`placement` integer NOT NULL,
	`vote_count_at_finalization` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`chili_id`) REFERENCES `chilis`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "official_results_placement_range" CHECK("official_results"."placement" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `official_results_chili_id_unique` ON `official_results` (`chili_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `official_results_placement_unique` ON `official_results` (`placement`);--> statement-breakpoint
CREATE TABLE `pledges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`recorded_by_user_id` integer,
	`context` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`additional_vote_count` integer DEFAULT 0 NOT NULL,
	`corrects_pledge_id` integer,
	`reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`corrects_pledge_id`) REFERENCES `pledges`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pledges_user_idx` ON `pledges` (`user_id`);--> statement-breakpoint
CREATE INDEX `pledges_context_idx` ON `pledges` (`context`);--> statement-breakpoint
CREATE INDEX `pledges_corrects_idx` ON `pledges` (`corrects_pledge_id`);--> statement-breakpoint
CREATE INDEX `pledges_created_idx` ON `pledges` (`created_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_unique` ON `tags` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_ci_unique` ON `tags` (lower("name"));--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clerk_user_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`role` text,
	`registration_completed_at` text,
	`party_size` integer,
	`check_in_code` text,
	`checked_in_at` text,
	`checked_in_by_user_id` integer,
	`participation_disabled_at` text,
	`participation_disabled_by_user_id` integer,
	`participation_disabled_reason` text,
	`issued_vote_count` integer DEFAULT 0 NOT NULL,
	`available_vote_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text,
	FOREIGN KEY (`checked_in_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participation_disabled_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "users_available_votes_nonnegative" CHECK("users"."available_vote_count" >= 0),
	CONSTRAINT "users_issued_votes_nonnegative" CHECK("users"."issued_vote_count" >= 0),
	CONSTRAINT "users_role_valid" CHECK("users"."role" IS NULL OR "users"."role" IN ('guest','contestant','admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_clerk_user_id_unique` ON `users` (`clerk_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_check_in_code_unique` ON `users` (`check_in_code`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `users_registration_completed_at_idx` ON `users` (`registration_completed_at`);--> statement-breakpoint
CREATE INDEX `users_checked_in_at_idx` ON `users` (`checked_in_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_display_name_ci_unique` ON `users` (lower("display_name"));--> statement-breakpoint
CREATE TABLE `vote_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`adjusted_by_user_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`adjusted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vote_adjustments_user_idx` ON `vote_adjustments` (`user_id`);--> statement-breakpoint
CREATE INDEX `vote_adjustments_admin_idx` ON `vote_adjustments` (`adjusted_by_user_id`);--> statement-breakpoint
CREATE INDEX `vote_adjustments_created_idx` ON `vote_adjustments` (`created_at`);--> statement-breakpoint
INSERT INTO `event_settings` (`id`, `event_name`) VALUES (1, 'Chili Cookoff');--> statement-breakpoint
INSERT INTO `tags` (`name`, `slug`, `description`, `sort_order`) VALUES
  ('Vegetarian', 'vegetarian', 'Made without meat.', 10),
  ('Vegan', 'vegan', 'Made without animal products.', 20),
  ('Gluten-free', 'gluten-free', 'Made without gluten-containing ingredients.', 30),
  ('Dairy-free', 'dairy-free', 'Made without dairy ingredients.', 40),
  ('Contains nuts', 'contains-nuts', 'Contains nuts or nut-derived ingredients.', 50),
  ('Kid-friendly', 'kid-friendly', 'A gentler option for younger tasters.', 60);
