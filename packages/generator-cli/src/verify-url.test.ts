import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyUrl } from "./verify-url.js";

function fetchReturning(...statuses: Array<number | Error>): typeof fetch {
  let index = 0;
  return (async () => {
    const next = statuses[Math.min(index, statuses.length - 1)];
    index += 1;
    if (next instanceof Error) throw next;
    return new Response("", { status: next });
  }) as typeof fetch;
}

test("succeeds on a 200 with no retries needed", async () => {
  const result = await verifyUrl("https://example.com", { fetchImpl: fetchReturning(200), initialDelayMs: 1 });
  assert.deepEqual(result, { ok: true, status: 200 });
});

test("treats a 3xx as success (redirect: manual, so it never actually follows)", async () => {
  const result = await verifyUrl("https://example.com/go/golisimo", {
    fetchImpl: fetchReturning(302),
    initialDelayMs: 1,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 302);
});

test("retries on failure and succeeds once a later attempt returns 200", async () => {
  const result = await verifyUrl("https://example.com", {
    fetchImpl: fetchReturning(503, 503, 200),
    retries: 5,
    initialDelayMs: 1,
  });
  assert.equal(result.ok, true);
});

test("returns ok: false with the last error after exhausting retries", async () => {
  const result = await verifyUrl("https://example.com", {
    fetchImpl: fetchReturning(500),
    retries: 3,
    initialDelayMs: 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "HTTP 500");
});

test("captures a thrown network error rather than propagating it", async () => {
  const result = await verifyUrl("https://example.com", {
    fetchImpl: fetchReturning(new Error("ECONNREFUSED")),
    retries: 2,
    initialDelayMs: 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "ECONNREFUSED");
});

test("delay doubles each attempt, capped at maxDelayMs", async () => {
  const delays: number[] = [];
  const originalSetTimeout = global.setTimeout;
  // @ts-expect-error - intentionally shadowing for this test only
  global.setTimeout = (fn: () => void, ms: number) => {
    delays.push(ms);
    return originalSetTimeout(fn, 0); // don't actually wait in the test
  };

  try {
    await verifyUrl("https://example.com", {
      fetchImpl: fetchReturning(500),
      retries: 5,
      initialDelayMs: 100,
      maxDelayMs: 300,
    });
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  // 100 -> 200 -> 300 (cap) -> 300 (cap), 4 gaps for 5 attempts
  assert.deepEqual(delays, [100, 200, 300, 300]);
});
