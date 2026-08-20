import { test } from "node:test";
import assert from "node:assert/strict";
import { HostingerClient, HostingerApiError, HostingerTimeoutError } from "./client.js";

type FakeCall = { url: string; init?: RequestInit };

function fakeFetch(handler: (call: FakeCall, attempt: number) => Response): { fetchImpl: typeof fetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const call = { url: url.toString(), init };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

test("getDomain() sends a bearer token and returns the domain resource, mapping the wire response's snake_case name_servers to nameServers", async () => {
  // Real API response shape (verified against a live GET .../portfolio/
  // {domain} call) - wraps nameservers under snake_case "name_servers",
  // not "nameServers" like this client's own HostingerDomain type uses.
  const { fetchImpl, calls } = fakeFetch(() =>
    json(200, { domain: "example.com", status: "active", name_servers: { ns1: "ns1.dns-parking.com", ns2: "ns2.dns-parking.com" } }),
  );
  const client = new HostingerClient("test-token", { fetchImpl });

  const domain = await client.getDomain("example.com");

  assert.equal(domain?.domain, "example.com");
  assert.equal(domain?.nameServers.ns1, "ns1.dns-parking.com");
  assert.equal(domain?.nameServers.ns2, "ns2.dns-parking.com");
  assert.equal(calls[0].url, "https://developers.hostinger.com/api/domains/v1/portfolio/example.com");
  assert.equal((calls[0].init?.headers as Record<string, string>)?.Authorization, "Bearer test-token");
});

test("getDomain() returns undefined on 404 instead of throwing (domain not in this account)", async () => {
  const { fetchImpl } = fakeFetch(() => new Response("not found", { status: 404 }));
  const client = new HostingerClient("test-token", { fetchImpl });

  const domain = await client.getDomain("not-mine.com");
  assert.equal(domain, undefined);
});

test("updateNameservers() PUTs the exact nameservers given, no defaulting", async () => {
  const { fetchImpl, calls } = fakeFetch(() => json(200, { message: "ok" }));
  const client = new HostingerClient("test-token", { fetchImpl });

  await client.updateNameservers("example.com", { ns1: "ns1.cloudflare.com", ns2: "ns2.cloudflare.com" });

  assert.equal(calls[0].init?.method, "PUT");
  assert.equal(
    calls[0].url,
    "https://developers.hostinger.com/api/domains/v1/portfolio/example.com/nameservers",
  );
  assert.deepEqual(JSON.parse(calls[0].init?.body as string), { ns1: "ns1.cloudflare.com", ns2: "ns2.cloudflare.com" });
});

test("getDnsZoneRecords() returns the parsed zone record list", async () => {
  const records = [{ name: "@", type: "A", ttl: 300, records: [{ content: "1.2.3.4" }] }];
  const { fetchImpl } = fakeFetch(() => json(200, records));
  const client = new HostingerClient("test-token", { fetchImpl });

  const result = await client.getDnsZoneRecords("example.com");
  assert.deepEqual(result, records);
});

test("deleteDnsRecords() sends the filters as the DELETE body", async () => {
  const { fetchImpl, calls } = fakeFetch(() => json(200, { message: "deleted" }));
  const client = new HostingerClient("test-token", { fetchImpl });

  await client.deleteDnsRecords("example.com", [{ name: "@", type: "A" }]);

  assert.equal(calls[0].init?.method, "DELETE");
  assert.deepEqual(JSON.parse(calls[0].init?.body as string), { filters: [{ name: "@", type: "A" }] });
});

test("throws HostingerApiError with the response's message on a non-2xx, non-404 status", async () => {
  const { fetchImpl } = fakeFetch(() => json(422, { message: "invalid nameserver format" }));
  const client = new HostingerClient("test-token", { fetchImpl });

  await assert.rejects(
    () => client.updateNameservers("example.com", { ns1: "bad", ns2: "bad" }),
    (error: unknown) => {
      assert.ok(error instanceof HostingerApiError);
      assert.equal(error.status, 422);
      assert.match(error.message, /invalid nameserver format/);
      return true;
    },
  );
});

test("retries a 5xx up to maxRetries, then succeeds", async () => {
  const { fetchImpl, calls } = fakeFetch((_call, attempt) =>
    attempt < 2 ? json(502, { message: "bad gateway" }) : json(200, { message: "ok" }),
  );
  const client = new HostingerClient("test-token", { fetchImpl, maxRetries: 3 });

  await client.updateNameservers("example.com", { ns1: "a", ns2: "b" });
  assert.equal(calls.length, 3);
});

test("gives up after maxRetries and throws the last error", async () => {
  const { fetchImpl, calls } = fakeFetch(() => json(500, { message: "still broken" }));
  const client = new HostingerClient("test-token", { fetchImpl, maxRetries: 2 });

  await assert.rejects(() => client.getDnsZoneRecords("example.com"), HostingerApiError);
  assert.equal(calls.length, 3); // initial attempt + 2 retries
});

test("does not retry a 4xx (non-429) — fails fast on a real client error", async () => {
  const { fetchImpl, calls } = fakeFetch(() => json(400, { message: "malformed domain" }));
  const client = new HostingerClient("test-token", { fetchImpl, maxRetries: 3 });

  await assert.rejects(() => client.getDnsZoneRecords("example.com"), HostingerApiError);
  assert.equal(calls.length, 1);
});

test("times out and throws HostingerTimeoutError when the request hangs past timeoutMs", async () => {
  const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  }) as typeof fetch;
  const client = new HostingerClient("test-token", { fetchImpl, timeoutMs: 10, maxRetries: 0 });

  await assert.rejects(() => client.getDnsZoneRecords("example.com"), HostingerTimeoutError);
});
