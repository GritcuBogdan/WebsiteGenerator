import { test } from "node:test";
import assert from "node:assert/strict";
import { CloudflareKVRedirectStore } from "./cloudflare-kv-redirect-store.js";

type FakeCall = { url: string; init?: RequestInit };

function fakeFetch(handler: (url: string, init?: RequestInit) => Response): { fetchImpl: typeof fetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: url.toString(), init });
    return handler(url.toString(), init);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const OPTIONS = { apiToken: "test-token", accountId: "acc123", namespaceId: "ns1" };

test("setRedirect PUTs a form-encoded value to the correct namespace/key path", async () => {
  const { fetchImpl, calls } = fakeFetch(
    () => new Response(JSON.stringify({ success: true, result: null, errors: [], messages: [] }), { status: 200 }),
  );
  const store = new CloudflareKVRedirectStore({ ...OPTIONS, fetchImpl });

  await store.setRedirect("golisimo", "https://affiliate.example/track?id=golisimo");

  assert.equal(calls[0].url, "https://api.cloudflare.com/client/v4/accounts/acc123/storage/kv/namespaces/ns1/values/golisimo");
  assert.equal(calls[0].init?.method, "PUT");
  assert.ok(calls[0].init?.body instanceof FormData);
});

test("getRedirect returns the stored value", async () => {
  const { fetchImpl } = fakeFetch(() => new Response("https://affiliate.example/track?id=golisimo", { status: 200 }));
  const store = new CloudflareKVRedirectStore({ ...OPTIONS, fetchImpl });

  assert.equal(await store.getRedirect("golisimo"), "https://affiliate.example/track?id=golisimo");
});

test("getRedirect returns null for a slug with no stored value", async () => {
  const { fetchImpl } = fakeFetch(() => new Response("key not found", { status: 404 }));
  const store = new CloudflareKVRedirectStore({ ...OPTIONS, fetchImpl });

  assert.equal(await store.getRedirect("no-such-slug"), null);
});

test("slug is URL-encoded in the request path", async () => {
  const { fetchImpl, calls } = fakeFetch(
    () => new Response(JSON.stringify({ success: true, result: null, errors: [], messages: [] }), { status: 200 }),
  );
  const store = new CloudflareKVRedirectStore({ ...OPTIONS, fetchImpl });

  await store.setRedirect("slug with spaces", "https://example.com");
  assert.ok(calls[0].url.endsWith("/values/slug%20with%20spaces"));
});
