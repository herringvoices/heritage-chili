import { DomainError } from "./domain-error";

export function requireIdempotencyKey(request: Request) {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 128) {
    throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Please retry this action from the form.", 400);
  }
  return key;
}
