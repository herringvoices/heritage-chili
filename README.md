# Heritage Chili Cookoff

A mobile-first fundraiser app for RSVPs, chili entries, pledges, event check-in, voting, standings, and administrative event management.

The application is built with Next.js, React, Tailwind CSS, Drizzle ORM, Clerk authentication, Cloudflare D1, and Cloudflare R2. This repository began as a clean, sanitized snapshot of the production ChatGPT Sites deployment.

## Requirements

- Node.js 22.13 or newer
- A Clerk application
- Cloudflare D1 for relational data
- Cloudflare R2 for uploaded chili images

## Local development

1. Copy `.env.example` to `.env.local` and supply development credentials.
2. Install dependencies with `npm ci`.
3. Start the development server with `npm run dev`.

Useful commands:

- `npm run test:unit` runs the unit and service tests.
- `npm test` runs unit tests, a production build, and rendered HTML checks.
- `npm run lint` runs ESLint.
- `npm run db:generate` generates Drizzle migrations.
- `npm run db:reset -- baseline` resets a local database to launch-ready state.
- `npm run rehearsal:seed` loads deterministic rehearsal data.

## Environment variables

Secrets belong in the deployment platform's secret manager and must never be committed. See `.env.example` for the supported variables.

## Data and privacy

This public repository contains database schema, migrations, and synthetic rehearsal data only. It does not contain production database exports, pledge records, Clerk credentials, or uploaded images.

The production-specific Sites project identifier and organizer identity were removed from the public snapshot. See `docs/source-recovery.md` for provenance and verification details.
