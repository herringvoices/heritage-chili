import { DomainError } from "../domain-error";

export function extractBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new DomainError("UNAUTHENTICATED", "Please sign in to continue.", 401);
  return match[1];
}
