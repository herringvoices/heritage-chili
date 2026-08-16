import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "@/server/domain-error";
import { hashRequestBody, IdempotencyService } from "@/server/services/idempotency-service";

function fakeService(record: null | { requestHash: string; responseStatus: number; responseJson: string }) {
  const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => record ? [record] : [] }) }) }) };
  return new IdempotencyService(db as never);
}

test("request hashing is stable for a retry", async () => {
  assert.equal(await hashRequestBody({ partySize: 3 }), await hashRequestBody({ partySize: 3 }));
});

test("idempotency replay returns the stored response", async () => {
  const service = fakeService({ requestHash: "same", responseStatus: 201, responseJson: '{"data":{"ok":true}}' });
  assert.deepEqual(await service.replay(1, "registration.complete", "key", "same"), { status: 201, body: { data: { ok: true } } });
});

test("idempotency rejects reuse with a different request", async () => {
  const service = fakeService({ requestHash: "first", responseStatus: 201, responseJson: "{}" });
  await assert.rejects(() => service.replay(1, "registration.complete", "key", "different"), (error: unknown) => error instanceof DomainError && error.code === "IDEMPOTENCY_KEY_REUSED");
});
