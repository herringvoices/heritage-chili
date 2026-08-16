-- Promote the freshly registered production organizer account without
-- changing its display name, party size, pledge history, or vote balances.

INSERT INTO `audit_entries` (
  `actor_user_id`,
  `action`,
  `entity_type`,
  `entity_id`,
  `reason`,
  `before_json`,
  `after_json`,
  `created_at`
)
SELECT
  `id`,
  'administrator.promoted',
  'user',
  `id`,
  'Organizer requested production administrator access',
  json_object('role', `role`),
  json_object('role', 'admin'),
  CURRENT_TIMESTAMP
FROM `users`
WHERE
  `clerk_user_id` = 'user_replace_me'
  AND lower(`email`) = 'organizer@example.com'
  AND `role` IS NOT 'admin';
--> statement-breakpoint
UPDATE `chilis`
SET
  `status` = 'inactive',
  `status_reason` = 'Owner promoted to administrator',
  `updated_at` = CURRENT_TIMESTAMP
WHERE
  `cook_user_id` IN (
    SELECT `id`
    FROM `users`
    WHERE
      `clerk_user_id` = 'user_replace_me'
      AND lower(`email`) = 'organizer@example.com'
  )
  AND `status` <> 'disqualified';
--> statement-breakpoint
UPDATE `users`
SET
  `role` = 'admin',
  `checked_in_at` = NULL,
  `checked_in_by_user_id` = NULL,
  `updated_at` = CURRENT_TIMESTAMP
WHERE
  `clerk_user_id` = 'user_replace_me'
  AND lower(`email`) = 'organizer@example.com';
