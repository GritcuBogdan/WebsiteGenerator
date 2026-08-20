import { test } from "node:test";
import assert from "node:assert/strict";
import { CloudflareClient, CloudflareApiError } from "./client.js";

type FakeCall = { url: string; init?: RequestInit };

function fakeFetch(
  responses: Array<{ status: number; body: unknown; isJson?: boolean }>,
): { fetchImpl: typeof fetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  let index = 0;

  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: url.toString(), init });
    const response = responses[index] ?? responses[responses.length - 1];
    index += 1;
    const isJson = response.isJson ?? true;
    return new Response(isJson ? JSON.stringify(response.body) : (response.body as string), {
      status: response.status,
    });
  }) as typeof fetch;

  return { fetchImpl, calls };
}

test("get() sends a bearer token and returns the envelope's result", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: { success: true, result: { id: "abc" }, errors: [], messages: [] } }]);
  const client = new CloudflareClient("test-token", { fetchImpl });

  const result = await client.get<{ id: string }>("/accounts/acc123/pages/projects/foo");

  assert.deepEqual(result, { id: "abc" });
  assert.equal(calls[0].url, "https://api.cloudflare.com/client/v4/accounts/acc123/pages/projects/foo");
  assert.equal((calls[0].init?.headers as Record<string, string>)?.Authorization, "Bearer test-token");
});

test("postJson() sends JSON content-type and serializes the body", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: { success: true, result: { created: true }, errors: [], messages: [] } }]);
  const client = new CloudflareClient("test-token", { fetchImpl });

  await client.postJson("/accounts/acc123/pages/projects", { name: "golisimo", production_branch: "production" });

  const headers = calls[0].init?.headers as Record<string, string>;
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(calls[0].init?.body, JSON.stringify({ name: "golisimo", production_branch: "production" }));
});

test("putForm() sends a multipart form body", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: { success: true, result: null, errors: [], messages: [] } }]);
  const client = new CloudflareClient("test-token", { fetchImpl });

  await client.putForm("/accounts/acc123/storage/kv/namespaces/ns1/values/golisimo", { value: "https://affiliate.example" });

  assert.ok(calls[0].init?.body instanceof FormData);
});

test("throws CloudflareApiError when the envelope reports success: false", async () => {
  const { fetchImpl } = fakeFetch([
    { status: 200, body: { success: false, result: null, errors: [{ code: 8000007, message: "project not found" }], messages: [] } },
  ]);
  const client = new CloudflareClient("test-token", { fetchImpl });

  await assert.rejects(() => client.get("/accounts/acc123/pages/projects/missing"), (error: unknown) => {
    assert.ok(error instanceof CloudflareApiError);
    assert.equal(error.status, 200);
    assert.match(error.message, /project not found/);
    return true;
  });
});

test("throws CloudflareApiError on a non-2xx HTTP status even if the envelope parses", async () => {
  const { fetchImpl } = fakeFetch([{ status: 404, body: { success: false, result: null, errors: [{ code: 8000000, message: "not found" }], messages: [] } }]);
  const client = new CloudflareClient("test-token", { fetchImpl });

  await assert.rejects(() => client.get("/accounts/acc123/pages/projects/missing"), CloudflareApiError);
});

test("getRawOrNull() returns the raw body text, not a parsed envelope", async () => {
  const { fetchImpl } = fakeFetch([{ status: 200, body: "https://affiliate.example/track?id=golisimo", isJson: false }]);
  const client = new CloudflareClient("test-token", { fetchImpl });

  const value = await client.getRawOrNull("/accounts/acc123/storage/kv/namespaces/ns1/values/golisimo");
  assert.equal(value, "https://affiliate.example/track?id=golisimo");
});

test("getRawOrNull() returns null on a 404 instead of throwing", async () => {
  const { fetchImpl } = fakeFetch([{ status: 404, body: "key not found", isJson: false }]);
  const client = new CloudflareClient("test-token", { fetchImpl });

  const value = await client.getRawOrNull("/accounts/acc123/storage/kv/namespaces/ns1/values/no-such-slug");
  assert.equal(value, null);
});

test("getRawOrNull() still throws on a non-404 error status", async () => {
  const { fetchImpl } = fakeFetch([{ status: 500, body: "internal error", isJson: false }]);
  const client = new CloudflareClient("test-token", { fetchImpl });

  await assert.rejects(() => client.getRawOrNull("/accounts/acc123/storage/kv/namespaces/ns1/values/golisimo"), CloudflareApiError);
});
