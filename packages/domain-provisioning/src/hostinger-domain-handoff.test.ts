import { test } from "node:test";
import assert from "node:assert/strict";
import { HostingerClient, HostingerApiError } from "hostinger-client";
import {
  HostingerDomainHandoffService,
  NoopHostingerDomainHandoffService,
  DomainHandoffError,
  type CloudflareZoneOperations,
} from "./hostinger-domain-handoff.js";
import type { CloudflareZone } from "./cloudflare-domain-provisioner.js";

const CF_NS = ["ns1.cloudflare.com", "ns2.cloudflare.com"];

function fakeHostingerFetch(
  handlers: Partial<{
    getDomain: () => Response;
    updateNameservers: (body: unknown) => Response;
  }>,
): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const urlString = url.toString();
    const method = init?.method ?? "GET";
    if (method === "GET" && urlString.includes("/api/domains/v1/portfolio/") && handlers.getDomain) {
      return handlers.getDomain();
    }
    if (method === "PUT" && urlString.includes("/nameservers") && handlers.updateNameservers) {
      return handlers.updateNameservers(init?.body ? JSON.parse(init.body as string) : undefined);
    }
    throw new Error(`unexpected call: ${method} ${urlString}`);
  }) as typeof fetch;
}

function fakeCloudflareZones(overrides: Partial<CloudflareZoneOperations & { statusSequence: CloudflareZone[] }> = {}): CloudflareZoneOperations & {
  ensureZoneCalls: string[];
  statusCalls: string[];
} {
  const ensureZoneCalls: string[] = [];
  const statusCalls: string[] = [];
  const statusSequence = [...(overrides.statusSequence ?? [{ id: "zone1", status: "active", nameServers: CF_NS }])];

  return {
    ensureZoneCalls,
    statusCalls,
    ensureZone: async (domain: string) => {
      ensureZoneCalls.push(domain);
      if (overrides.ensureZone) return overrides.ensureZone(domain);
      return { id: "zone1", status: "pending", nameServers: CF_NS };
    },
    getZoneStatus: async (zoneId: string) => {
      statusCalls.push(zoneId);
      if (overrides.getZoneStatus) return overrides.getZoneStatus(zoneId);
      return statusSequence.length > 1 ? statusSequence.shift()! : statusSequence[0]!;
    },
  };
}

test("full successful provisioning flow: verify, zone, nameserver update, immediately active", async () => {
  const hostingerFetch = fakeHostingerFetch({
    getDomain: () => new Response(JSON.stringify({ domain: "example.com", status: "active", name_servers: { ns1: "ns1.dns-parking.com", ns2: "ns2.dns-parking.com" } }), { status: 200 }),
    updateNameservers: () => new Response(JSON.stringify({ message: "ok" }), { status: 200 }),
  });
  const hostinger = new HostingerClient("token", { fetchImpl: hostingerFetch });
  const cloudflareZones = fakeCloudflareZones({ ensureZone: async () => ({ id: "zone1", status: "active", nameServers: CF_NS }) });

  const logs: string[] = [];
  const service = new HostingerDomainHandoffService({ hostingerClient: hostinger, cloudflareZones, logger: { info: (m) => logs.push(m) } });

  const result = await service.provisionDomain("example.com");

  assert.deepEqual(result, { domain: "example.com", state: "CLOUDFLARE_AUTHORITY_CONFIRMED", cloudflareZoneId: "zone1", cloudflareNameServers: CF_NS });
  assert.ok(logs.some((l) => l.includes("Hostinger nameservers updated")));
});

test("idempotent: does not call updateNameservers when Hostinger already points at Cloudflare's nameservers", async () => {
  let updateCalled = false;
  const hostingerFetch = fakeHostingerFetch({
    getDomain: () => new Response(JSON.stringify({ domain: "example.com", status: "active", name_servers: { ns1: "NS1.CLOUDFLARE.COM.", ns2: "ns2.cloudflare.com" } }), { status: 200 }),
    updateNameservers: () => {
      updateCalled = true;
      return new Response(JSON.stringify({ message: "ok" }), { status: 200 });
    },
  });
  const hostinger = new HostingerClient("token", { fetchImpl: hostingerFetch });
  const cloudflareZones = fakeCloudflareZones({ ensureZone: async () => ({ id: "zone1", status: "active", nameServers: CF_NS }) });
  const service = new HostingerDomainHandoffService({ hostingerClient: hostinger, cloudflareZones });

  const result = await service.provisionDomain("example.com");

  assert.equal(updateCalled, false); // already correct (case/trailing-dot-insensitive) — no redundant write
  assert.equal(result.state, "CLOUDFLARE_AUTHORITY_CONFIRMED");
});

test("idempotent: ensureZone (not a raw create) is used, so an existing Cloudflare zone is reused", async () => {
  const hostingerFetch = fakeHostingerFetch({
    getDomain: () => new Response(JSON.stringify({ domain: "example.com", status: "active", name_servers: { ns1: "a", ns2: "b" } }), { status: 200 }),
    updateNameservers: () => new Response(JSON.stringify({ message: "ok" }), { status: 200 }),
  });
  const hostinger = new HostingerClient("token", { fetchImpl: hostingerFetch });
  const cloudflareZones = fakeCloudflareZones({ ensureZone: async () => ({ id: "existing-zone", status: "active", nameServers: CF_NS }) });
  const service = new HostingerDomainHandoffService({ hostingerClient: hostinger, cloudflareZones });

  const result = await service.provisionDomain("example.com");

  assert.equal(result.cloudflareZoneId, "existing-zone");
  assert.deepEqual(cloudflareZones.ensureZoneCalls, ["example.com"]);
});

test("propagation polling: reports CLOUDFLARE_AUTHORITY_CONFIRMED once status flips to active within the window", async () => {
  const hostingerFetch = fakeHostingerFetch({
    getDomain: () => new Response(JSON.stringify({ domain: "example.com", status: "active", name_servers: { ns1: "a", ns2: "b" } }), { status: 200 }),
    updateNameservers: () => new Response(JSON.stringify({ message: "ok" }), { status: 200 }),
  });
  const hostinger = new HostingerClient("token", { fetchImpl: hostingerFetch });
  const cloudflareZones = fakeCloudflareZones({
    ensureZone: async () => ({ id: "zone1", status: "pending", nameServers: CF_NS }),
    statusSequence: [
      { id: "zone1", status: "pending", nameServers: CF_NS },
      { id: "zone1", status: "pending", nameServers: CF_NS },
      { id: "zone1", status: "active", nameServers: CF_NS },
    ],
  });
  const service = new HostingerDomainHandoffService({ hostingerClient: hostinger, cloudflareZones, pollIntervalMs: 1, maxPropagationWaitMs: 100 });

  const result = await service.provisionDomain("example.com");

  assert.equal(result.state, "CLOUDFLARE_AUTHORITY_CONFIRMED");
  assert.ok(cloudflareZones.statusCalls.length >= 3);
});

test("propagation timeout: returns NAMESERVERS_PROPAGATING (not an error) when the bound is reached", async () => {
  const hostingerFetch = fakeHostingerFetch({
    getDomain: () => new Response(JSON.stringify({ domain: "example.com", status: "active", name_servers: { ns1: "a", ns2: "b" } }), { status: 200 }),
    updateNameservers: () => new Response(JSON.stringify({ message: "ok" }), { status: 200 }),
  });
  const hostinger = new HostingerClient("token", { fetchImpl: hostingerFetch });
  const cloudflareZones = fakeCloudflareZones({
    ensureZone: async () => ({ id: "zone1", status: "pending", nameServers: CF_NS }),
    getZoneStatus: async () => ({ id: "zone1", status: "pending", nameServers: CF_NS }),
  });
  const service = new HostingerDomainHandoffService({ hostingerClient: hostinger, cloudflareZones, pollIntervalMs: 5, maxPropagationWaitMs: 20 });

  const result = await service.provisionDomain("example.com");

  assert.equal(result.state, "NAMESERVERS_PROPAGATING");
  assert.equal(result.cloudflareZoneId, "zone1");
});

test("domain not found on Hostinger: returns SKIPPED_NOT_ON_HOSTINGER without touching Cloudflare", async () => {
  const hostingerFetch = fakeHostingerFetch({ getDomain: () => new Response("not found", { status: 404 }) });
  const hostinger = new HostingerClient("token", { fetchImpl: hostingerFetch });
  const cloudflareZones = fakeCloudflareZones();
  const service = new HostingerDomainHandoffService({ hostingerClient: hostinger, cloudflareZones });

  const result = await service.provisionDomain("not-mine.com");

  assert.equal(result.state, "SKIPPED_NOT_ON_HOSTINGER");
  assert.deepEqual(cloudflareZones.ensureZoneCalls, []);
});

test("Hostinger API error during verification surfaces as a retryable DomainHandoffError for a 5xx", async () => {
  const hostingerFetch = (async () => new Response(JSON.stringify({ message: "down" }), { status: 503 })) as typeof fetch;
  const hostinger = new HostingerClient("token", { fetchImpl: hostingerFetch, maxRetries: 0 });
  const cloudflareZones = fakeCloudflareZones();
  const service = new HostingerDomainHandoffService({ hostingerClient: hostinger, cloudflareZones });

  await assert.rejects(() => service.provisionDomain("example.com"), (error: unknown) => {
    assert.ok(error instanceof DomainHandoffError);
    assert.equal(error.stage, "hostinger-verify");
    assert.equal(error.retryable, true);
    return true;
  });
});

test("Hostinger 4xx (non-429) error during nameserver update surfaces as a non-retryable DomainHandoffError", async () => {
  const hostingerFetch = fakeHostingerFetch({
    getDomain: () => new Response(JSON.stringify({ domain: "example.com", status: "active", name_servers: { ns1: "a", ns2: "b" } }), { status: 200 }),
    updateNameservers: () => new Response(JSON.stringify({ message: "invalid nameserver" }), { status: 422 }),
  });
  const hostinger = new HostingerClient("token", { fetchImpl: hostingerFetch, maxRetries: 0 });
  const cloudflareZones = fakeCloudflareZones({ ensureZone: async () => ({ id: "zone1", status: "active", nameServers: CF_NS }) });
  const service = new HostingerDomainHandoffService({ hostingerClient: hostinger, cloudflareZones });

  await assert.rejects(() => service.provisionDomain("example.com"), (error: unknown) => {
    assert.ok(error instanceof DomainHandoffError);
    assert.equal(error.stage, "hostinger-nameserver-update");
    assert.equal(error.retryable, false);
    assert.ok(error.cause instanceof HostingerApiError);
    return true;
  });
});

test("Cloudflare zone creation failure surfaces as a DomainHandoffError at the cloudflare-zone stage", async () => {
  const hostingerFetch = fakeHostingerFetch({
    getDomain: () => new Response(JSON.stringify({ domain: "example.com", status: "active", name_servers: { ns1: "a", ns2: "b" } }), { status: 200 }),
  });
  const hostinger = new HostingerClient("token", { fetchImpl: hostingerFetch });
  const cloudflareZones = fakeCloudflareZones({
    ensureZone: async () => {
      throw new Error("cloudflare unreachable");
    },
  });
  const service = new HostingerDomainHandoffService({ hostingerClient: hostinger, cloudflareZones });

  await assert.rejects(() => service.provisionDomain("example.com"), (error: unknown) => {
    assert.ok(error instanceof DomainHandoffError);
    assert.equal(error.stage, "cloudflare-zone");
    return true;
  });
});

test("resume after partial failure: a second call picks up from live state instead of re-erroring", async () => {
  // First call: Hostinger nameserver update itself fails transiently.
  let updateAttempts = 0;
  const hostingerFetch = fakeHostingerFetch({
    getDomain: () => new Response(JSON.stringify({ domain: "example.com", status: "active", name_servers: { ns1: "old1", ns2: "old2" } }), { status: 200 }),
    updateNameservers: () => {
      updateAttempts += 1;
      if (updateAttempts === 1) return new Response(JSON.stringify({ message: "gateway timeout" }), { status: 504 });
      return new Response(JSON.stringify({ message: "ok" }), { status: 200 });
    },
  });
  const hostinger = new HostingerClient("token", { fetchImpl: hostingerFetch, maxRetries: 0 });
  const cloudflareZones = fakeCloudflareZones({ ensureZone: async () => ({ id: "zone1", status: "active", nameServers: CF_NS }) });
  const service = new HostingerDomainHandoffService({ hostingerClient: hostinger, cloudflareZones });

  await assert.rejects(() => service.provisionDomain("example.com"));

  // Second (rerun) call: re-derives everything from live state again —
  // Hostinger nameservers are still "old1"/"old2" (first attempt never
  // actually committed), so it retries the same update and this time
  // succeeds, reaching a clean terminal state.
  const result = await service.provisionDomain("example.com");
  assert.equal(result.state, "CLOUDFLARE_AUTHORITY_CONFIRMED");
  assert.equal(updateAttempts, 2);
});

test("NoopHostingerDomainHandoffService makes no network calls and returns SKIPPED_NOT_CONFIGURED", async () => {
  const service = new NoopHostingerDomainHandoffService();
  const result = await service.provisionDomain("example.com");
  assert.deepEqual(result, { domain: "example.com", state: "SKIPPED_NOT_CONFIGURED" });
});
