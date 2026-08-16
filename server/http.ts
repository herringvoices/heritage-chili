import { ZodError } from "zod";
import { DomainError } from "./domain-error";

export function dataResponse<T>(data: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "private, no-store");
  return Response.json({ data }, { ...init, headers });
}

export function errorResponse(error: unknown) {
  if (error instanceof DomainError) {
    return Response.json(
      { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
      { status: error.status, headers: { "cache-control": "private, no-store" } },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "Please check the information you entered.", details: { fields: error.flatten().fieldErrors } } },
      { status: 400, headers: { "cache-control": "private, no-store" } },
    );
  }

  console.error(error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
    { status: 500, headers: { "cache-control": "private, no-store" } },
  );
}
