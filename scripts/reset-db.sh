#!/usr/bin/env bash
set -euo pipefail

profile="${1:-}"
shift || true
if (($#)); then
  echo "Unknown option: $1" >&2
  exit 2
fi

case "$profile" in
  baseline|full-swing) ;;
  *)
    echo "Usage: npm run db:reset -- <baseline|full-swing>" >&2
    exit 2
    ;;
esac

node scripts/reset-local-db.mjs "$profile"

echo "Local database reset to '$profile'."
