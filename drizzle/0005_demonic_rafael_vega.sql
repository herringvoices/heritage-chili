CREATE TABLE `user_notice_states` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`notice_key` text NOT NULL,
	`notice_version` integer DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`first_seen_at` text,
	`last_seen_at` text,
	`completed_at` text,
	`dismissed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "user_notice_states_status_valid" CHECK("user_notice_states"."status" IN ('seen','completed','dismissed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_notice_states_user_key_version_unique` ON `user_notice_states` (`user_id`,`notice_key`,`notice_version`);--> statement-breakpoint
CREATE INDEX `user_notice_states_user_idx` ON `user_notice_states` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_notice_states_status_idx` ON `user_notice_states` (`status`);