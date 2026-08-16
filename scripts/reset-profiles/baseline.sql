-- Empty launch-ready state. Preserves event configuration and reference data.
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

DELETE FROM idempotency_keys;
DELETE FROM user_notice_states;
DELETE FROM official_results;
DELETE FROM audit_entries;
DELETE FROM vote_adjustments;
DELETE FROM pledges;
DELETE FROM chili_votes;
DELETE FROM chili_tags;
DELETE FROM chilis;

-- Remove user-backed references before deleting every account. The organizer
-- will be created through the normal first-sign-in flow and promoted later.
UPDATE event_settings
SET gofundme_url = COALESCE(
      gofundme_url,
      'https://www.gofundme.com/f/Heritage-family-adoption-fund?utm_source=chili_cookoff&utm_medium=referral&utm_campaign=heritage_family_adoption'
    ),
    voting_is_open = 0,
    standings_are_visible = 1,
    results_are_final = 0,
    results_finalized_at = NULL,
    results_finalized_by_user_id = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

DELETE FROM users;

COMMIT;
PRAGMA foreign_keys = ON;
