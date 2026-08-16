-- Remove both legacy and production app records for the organizer so the next
-- production Clerk sign-in follows the normal first-time registration flow.
-- Preserve unrelated rehearsal data by clearing administrator references.

UPDATE `users`
SET `checked_in_by_user_id` = NULL
WHERE `checked_in_by_user_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
);
--> statement-breakpoint
UPDATE `users`
SET `participation_disabled_by_user_id` = NULL
WHERE `participation_disabled_by_user_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
);
--> statement-breakpoint
UPDATE `chilis`
SET `activated_by_user_id` = NULL
WHERE `activated_by_user_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
);
--> statement-breakpoint
UPDATE `event_settings`
SET `results_finalized_by_user_id` = NULL
WHERE `results_finalized_by_user_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
);
--> statement-breakpoint
UPDATE `pledges`
SET `recorded_by_user_id` = NULL
WHERE `recorded_by_user_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
);
--> statement-breakpoint
UPDATE `pledges`
SET `corrects_pledge_id` = NULL
WHERE `corrects_pledge_id` IN (
  SELECT `id` FROM `pledges`
  WHERE `user_id` IN (
    SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
  )
);
--> statement-breakpoint
DELETE FROM `official_results`
WHERE `chili_id` IN (
  SELECT `id` FROM `chilis`
  WHERE `cook_user_id` IN (
    SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
  )
);
--> statement-breakpoint
DELETE FROM `chili_tags`
WHERE `chili_id` IN (
  SELECT `id` FROM `chilis`
  WHERE `cook_user_id` IN (
    SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
  )
);
--> statement-breakpoint
DELETE FROM `chili_votes`
WHERE `user_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
)
OR `chili_id` IN (
  SELECT `id` FROM `chilis`
  WHERE `cook_user_id` IN (
    SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
  )
);
--> statement-breakpoint
DELETE FROM `chilis`
WHERE `cook_user_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
);
--> statement-breakpoint
DELETE FROM `idempotency_keys`
WHERE `user_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
);
--> statement-breakpoint
DELETE FROM `vote_adjustments`
WHERE `user_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
)
OR `adjusted_by_user_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
);
--> statement-breakpoint
DELETE FROM `pledges`
WHERE `user_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
);
--> statement-breakpoint
DELETE FROM `audit_entries`
WHERE `actor_user_id` IN (
  SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
)
OR (
  `entity_type` = 'user'
  AND `entity_id` IN (
    SELECT `id` FROM `users` WHERE lower(`email`) = 'organizer@example.com'
  )
);
--> statement-breakpoint
DELETE FROM `users`
WHERE lower(`email`) = 'organizer@example.com';
