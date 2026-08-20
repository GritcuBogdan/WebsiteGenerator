import { test } from "node:test";
import assert from "node:assert/strict";
import { CloudflareDomainProvisioner } from "./cloudflare-domain-provisioner.js";
import type { DeployTarget } from "deploy";

const TARGET: DeployTarget = { projectName: "golisimo", productionBranch: "production" };
const OPTIONS = { apiToken: "t", accountId: "acc", workerName: "redirect-worker" };

function envelope(result: unknown) {
  return JSON.stringify({ success: true, result, errors: [], messages: [] });
}

test("ensureCustomDomain does nothing (no POST) when the domain is already attached and its zone isn't found", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const urlString = url.toString();
    if (urlString.includes("/domains")) return new Response(envelope([{ name: "golisimogreece.com" }]), { status: 200 });
    if (urlString.includes("/zones?")) return new Response(envelope([]), { status: 200 });
    throw new Error(`unexpected call: ${urlString}`);
  }) as typeof fetch;

  const provisioner = new CloudflareDomainProvisioner({ ...OPTIONS, fetchImpl });
  await provisioner.ensureCustomDomain("golisimogreece.com", TARGET);

  assert.ok(!calls.some((call) => call.startsWith("POST")));
});

test("ensureCustomDomain POSTs to attach the domain when it isn't in the existing list", async () => {
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const urlString = url.toString();
    calls.push({ method, url: urlString, body: init?.body ? JSON.parse(init.body as string) : undefined });

    if (urlString.endsWith("/domains") && method === "GET") return new Response(envelope([]), { status: 200 });
    if (urlString.endsWith("/domains") && method === "POST") return new Response(envelope({ name: "golisimogreece.com" }), { status: 200 });
    if (urlString.includes("/zones?")) return new Response(envelope([{ id: "zone1" }]), { status: 200 });
    if (urlString.includes("/dns_records") && method === "GET") return new Response(envelope([]), { status: 200 });
    if (urlString.includes("/dns_records") && method === "POST") return new Response(envelope({ id: "record1" }), { status: 200 });
    // The real Cloudflare API returns `subdomain` already suffixed with
    // ".pages.dev" - not a bare project-name prefix.
    if (urlString.endsWith("/pages/projects/golisimo")) return new Response(envelope({ subdomain: "golisimo-ab1.pages.dev" }), { status: 200 });
    throw new Error(`unexpected call: ${urlString}`);
  }) as typeof fetch;

  const provisioner = new CloudflareDomainProvisioner({ ...OPTIONS, fetchImpl });
  await provisioner.ensureCustomDomain("golisimogreece.com", TARGET);

  const domainPost = calls.find((call) => call.url.endsWith("/domains") && call.method === "POST")!;
  assert.deepEqual(domainPost.body, { name: "golisimogreece.com" });

  const dnsPost = calls.find((call) => call.url.includes("/dns_records") && call.method === "POST")!;
  assert.deepEqual(dnsPost.body, { type: "CNAME", name: "golisimogreece.com", content: "golisimo-ab1.pages.dev", proxied: true });
});

test("ensureCustomDomain does not create a duplicate CNAME record when one already exists", async () => {
  const calls: Array<{ method: string; url: string }> = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const urlString = url.toString();
    calls.push({ method, url: urlString });

    if (urlString.endsWith("/domains")) return new Response(envelope([{ name: "golisimogreece.com" }]), { status: 200 });
    if (urlString.includes("/zones?")) return new Response(envelope([{ id: "zone1" }]), { status: 200 });
    if (urlString.includes("/dns_records")) return new Response(envelope([{ id: "existing", name: "golisimogreece.com", type: "CNAME", content: "golisimo-ab1.pages.dev" }]), { status: 200 });
    throw new Error(`unexpected call: ${urlString}`);
  }) as typeof fetch;

  const provisioner = new CloudflareDomainProvisioner({ ...OPTIONS, fetchImpl });
  await provisioner.ensureCustomDomain("golisimogreece.com", TARGET);

  assert.ok(!calls.some((call) => call.method === "POST"));
});

test("ensureRedirectWorkerRoute returns the existing routeId without creating a duplicate", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.toString().includes("/zones?")) return new Response(envelope([{ id: "zone1" }]), { status: 200 });
    return new Response(envelope([{ id: "route1", pattern: "golisimogreece.com/go/*" }]), { status: 200 });
  }) as typeof fetch;

  const provisioner = new CloudflareDomainProvisioner({ ...OPTIONS, fetchImpl });
  const result = await provisioner.ensureRedirectWorkerRoute("golisimogreece.com");

  assert.equal(result.routeId, "route1");
  assert.ok(!calls.some((call) => call.startsWith("POST")));
});

test("ensureRedirectWorkerRoute creates a route with pattern <domain>/go/* when none exists", async () => {
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url: url.toString(), body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (url.toString().includes("/zones?")) return new Response(envelope([{ id: "zone1" }]), { status: 200 });
    if ((init?.method ?? "GET") === "GET") return new Response(envelope([]), { status: 200 });
    return new Response(envelope({ id: "new-route-1" }), { status: 200 });
  }) as typeof fetch;

  const provisioner = new CloudflareDomainProvisioner({ ...OPTIONS, fetchImpl });
  const result = await provisioner.ensureRedirectWorkerRoute("golisimogreece.com");

  assert.equal(result.routeId, "new-route-1");
  const postCall = calls.find((call) => call.method === "POST")!;
  assert.deepEqual(postCall.body, { pattern: "golisimogreece.com/go/*", script: "redirect-worker" });
});

test("ensureRedirectWorkerRoute walks up to the root domain's zone for a subdomain like www", async () => {
  const zoneLookups: string[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const urlString = url.toString();
    if (urlString.includes("/zones?")) {
      zoneLookups.push(urlString);
      // "www.crazytower7.com" has no zone of its own - only "crazytower7.com" does.
      if (urlString.includes("crazytower7.com") && !urlString.includes("www")) {
        return new Response(envelope([{ id: "zone1" }]), { status: 200 });
      }
      return new Response(envelope([]), { status: 200 });
    }
    if ((init?.method ?? "GET") === "GET") return new Response(envelope([]), { status: 200 });
    return new Response(envelope({ id: "new-route-1" }), { status: 200 });
  }) as typeof fetch;

  const provisioner = new CloudflareDomainProvisioner({ ...OPTIONS, fetchImpl });
  const result = await provisioner.ensureRedirectWorkerRoute("www.crazytower7.com");

  assert.equal(result.routeId, "new-route-1");
  assert.equal(zoneLookups.length, 2); // tried "www.crazytower7.com" first, then fell back to "crazytower7.com"
});

test("ensureRedirectWorkerRoute doesn't do an extra zone lookup for a bare domain (no subdomain to walk past)", async () => {
  const zoneLookups: string[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const urlString = url.toString();
    if (urlString.includes("/zones?")) {
      zoneLookups.push(urlString);
      return new Response(envelope([{ id: "zone1" }]), { status: 200 });
    }
    if ((init?.method ?? "GET") === "GET") return new Response(envelope([{ id: "route1", pattern: "golisimogreece.com/go/*" }]), { status: 200 });
    return new Response(envelope({ id: "new-route-1" }), { status: 200 });
  }) as typeof fetch;

  const provisioner = new CloudflareDomainProvisioner({ ...OPTIONS, fetchImpl });
  await provisioner.ensureRedirectWorkerRoute("golisimogreece.com");

  assert.equal(zoneLookups.length, 1);
});

test("ensureRedirectWorkerRoute throws a clear error when the domain has no matching Cloudflare zone", async () => {
  const fetchImpl = (async () => new Response(envelope([]), { status: 200 })) as typeof fetch;
  const provisioner = new CloudflareDomainProvisioner({ ...OPTIONS, fetchImpl });

  await assert.rejects(() => provisioner.ensureRedirectWorkerRoute("not-a-real-domain.example"), /No Cloudflare zone found/);
});

test("ensureZone reuses an existing zone instead of creating a duplicate", async () => {
  const calls: Array<{ method: string; url: string }> = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: url.toString() });
    return new Response(envelope([{ id: "zone1", status: "active", name_servers: ["ns1.cloudflare.com", "ns2.cloudflare.com"] }]), { status: 200 });
  }) as typeof fetch;

  const provisioner = new CloudflareDomainProvisioner({ ...OPTIONS, fetchImpl });
  const zone = await provisioner.ensureZone("crazytower7.com");

  assert.deepEqual(zone, { id: "zone1", status: "active", nameServers: ["ns1.cloudflare.com", "ns2.cloudflare.com"] });
  assert.ok(!calls.some((call) => call.method === "POST"));
});

test("ensureZone creates a zone with jump_start: false when none exists yet", async () => {
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const urlString = url.toString();
    calls.push({ method, url: urlString, body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (urlString.includes("/zones?") && method === "GET") return new Response(envelope([]), { status: 200 });
    return new Response(envelope({ id: "new-zone", status: "pending", name_servers: ["ns1.cloudflare.com", "ns2.cloudflare.com"] }), { status: 200 });
  }) as typeof fetch;

  const provisioner = new CloudflareDomainProvisioner({ ...OPTIONS, fetchImpl });
  const zone = await provisioner.ensureZone("brand-new-domain.com");

  assert.deepEqual(zone, { id: "new-zone", status: "pending", nameServers: ["ns1.cloudflare.com", "ns2.cloudflare.com"] });
  const createCall = calls.find((call) => call.method === "POST")!;
  assert.equal(createCall.url, "https://api.cloudflare.com/client/v4/zones");
  assert.deepEqual(createCall.body, { name: "brand-new-domain.com", account: { id: "acc" }, jump_start: false });
});

test("getZoneStatus reports the zone's current status and nameservers", async () => {
  const fetchImpl = (async () =>
    new Response(envelope({ id: "zone1", status: "pending", name_servers: ["ns1.cloudflare.com", "ns2.cloudflare.com"] }), { status: 200 })) as typeof fetch;

  const provisioner = new CloudflareDomainProvisioner({ ...OPTIONS, fetchImpl });
  const zone = await provisioner.getZoneStatus("zone1");

  assert.equal(zone.status, "pending");
  assert.deepEqual(zone.nameServers, ["ns1.cloudflare.com", "ns2.cloudflare.com"]);
});
