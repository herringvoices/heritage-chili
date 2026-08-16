ALTER TABLE `chili_votes` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `chili_votes_user_idempotency_unique` ON `chili_votes` (`user_id`,`idempotency_key`);
