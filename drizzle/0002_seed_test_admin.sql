INSERT OR IGNORE INTO `users` (
  `clerk_user_id`,
  `email`,
  `display_name`,
  `role`,
  `registration_completed_at`,
  `party_size`,
  `check_in_code`,
  `issued_vote_count`,
  `available_vote_count`,
  `created_at`,
  `updated_at`
) VALUES (
  'seed_admin_test',
  'admin@test.com',
  'Test Admin',
  'guest',
  '2026-07-24T16:30:00Z',
  1,
  '9001',
  1,
  1,
  '2026-07-24T16:30:00Z',
  '2026-07-24T16:30:00Z'
);
