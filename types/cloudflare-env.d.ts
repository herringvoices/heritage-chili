declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    BUCKET: R2Bucket;
    CLERK_JWKS_URL?: string;
    CLERK_ISSUER?: string;
    CLERK_SECRET_KEY?: string;
    DB_RESET_TOKEN?: string;
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
    REHEARSAL_ACCOUNT_PASSWORD?: string;
  }
}
