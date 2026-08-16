# Chili Cookoff Event Rehearsal

Run this rehearsal against an isolated preview database and bucket. Never seed production.

## Prepare

1. Apply migrations, then run `npm run db:reset -- full-swing` for the local D1 database.
2. Confirm `/api/health` succeeds and the Clerk issuer/audience match the deployed app.
3. Confirm the app can read D1 and upload, replace, fetch, and remove one disposable R2 image.
4. Open two independent admin sessions on phones and attendee sessions for a new user, guest, and contestant.

## Full lifecycle

1. Sign in as the status-4 user. Register a party, record the initial pledge, and confirm the dashboard and check-in code.
2. Sign in as a contestant. Complete the draft chili, add and replace an image, and verify the replaced object is gone.
3. From both admin phones, search the same attendee and tap check-in together. Expect one transition, one audit, and a replay for the loser.
4. Activate the same completed chili from both phones. Expect one transition and one clean `CHILI_STATUS_CONFLICT`.
5. Open voting. From an attendee with one vote left, submit two different final votes concurrently. Expect exactly one vote and a zero balance.
6. Retry registration, pledge, vote, check-in, and event-control requests with the same idempotency key or state. Expect replay, not duplication.
7. Hide standings, close voting, inspect ties, resolve the podium, and finalize results. Verify three durable official rows and no hidden exact totals on attendee endpoints.
8. Reopen results with a reason, verify votes remain, then finalize again.

## Failure and rollback drills

- Interrupt the browser after each mutation and retry. The response may be lost; the state must be complete or unchanged.
- Inject a failed batch during registration, check-in, pledge/vote grant, chili transition, and finalization. Verify there is no partial user state, vote balance, audit, or official result set.
- Simulate a slow request and frantic double-tapping. Controls should remain understandable and retries must be safe.

## Accessibility and phone checklist

- Complete every attendee flow and core admin controls at 320, 375, and 430 CSS pixels.
- Navigate with keyboard only. Focus is visible, dialogs trap and restore focus, and every control has an accessible name.
- Test at 200% zoom without horizontal page scrolling or obscured actions.
- Enable reduced motion and confirm transitions become effectively immediate.
- Run automated accessibility checks on public, registration, dashboard, chili list/detail, standings, check-in, event controls, and results.

## Privacy inspection

Attendee JSON and HTML must not contain `clerkUserId`, `clerk_user_id`, `imageObjectKey`, `image_object_key`, other users' vote history, admin audit data, or exact hidden totals. Images are served through the authenticated image route, never by exposing raw object keys.

## Emergency read-only inspection

Use a read-only D1 console/session and start with counts and invariants:

```sql
SELECT role, COUNT(*) FROM users GROUP BY role;
SELECT status, COUNT(*) FROM chilis GROUP BY status;
SELECT COUNT(*) AS negative_balances FROM users WHERE available_vote_count < 0;
SELECT user_id, idempotency_key, COUNT(*) FROM chili_votes WHERE idempotency_key IS NOT NULL GROUP BY user_id,idempotency_key HAVING COUNT(*) > 1;
SELECT placement, chili_id, vote_count_at_finalization FROM official_results ORDER BY placement;
SELECT created_at, action, entity_type, entity_id FROM audit_entries ORDER BY id DESC LIMIT 100;
```

Before the event, export D1 through the hosting provider's supported backup/export surface and verify that the file is nonempty. During an incident, pause mutations in the UI before inspection; do not hand-edit production rows. Preserve the export and audit log for recovery.

## Reset profiles

- `npm run db:reset -- full-swing` replaces local event data with 25 users, nine chilis, 40 votes, mixed check-in states, operational edge cases, and an in-progress pledge total.
- `npm run db:reset -- baseline` returns local data to an empty launch-ready state: no users or event activity, while preserving event settings and reference tags.
- Both profiles preserve the matching Clerk IDs already stored in D1. They never create, update, or delete Clerk accounts.
- The command intentionally targets only the local rehearsal database. Hosted resets remain a separate, deliberate operation: export the hosted D1 database first, then apply the chosen profile through the hosting provider's database controls.
- Seeded chili rows have no R2 object keys, so switching profiles does not create orphaned images.

## Sign-off

Record date, deployed version, testers, device/browser matrix, automated test results, smoke-test results, backup location, defects, and the organizer's go/no-go decision. Post-MVP ideas go in a separate backlog.
