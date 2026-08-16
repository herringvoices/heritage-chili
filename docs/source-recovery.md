# Source recovery

This repository was initialized from ChatGPT Sites production version 55 of the Heritage Chili Cookoff application.

- Source commit: `2de27e4d0a83d080d22b4633d9c9de279a4df4eb`
- Recovery date: 2026-08-16
- Pre-sanitization verification: 93 unit tests passed

The public snapshot intentionally excludes:

- The production ChatGPT Sites project identifier
- Clerk secret and publishable key values
- Production database contents
- Uploaded image objects
- Production organizer email and Clerk user identifiers
- The internal ChatGPT Sites Git history

The application source, database schema, migrations, synthetic rehearsal profiles, and automated tests are preserved. The existing production Site was not modified during recovery.
