# hostinger-client

Low-level HTTP plumbing for the Hostinger API — the `Authorization: Bearer`
header, base URL, JSON parsing, and error/retry handling — so callers
(`packages/domain-provisioning`) aren't reimplementing a fetch wrapper.
Plays the same role for Hostinger that `packages/cloudflare-client` plays
for Cloudflare.

```ts
import { HostingerClient, HostingerApiError } from "hostinger-client";

const client = new HostingerClient(apiToken);
const domain = await client.getDomain("example.com"); // undefined if not in this account
await client.updateNameservers("example.com", { ns1: "ns1.cloudflare.com", ns2: "ns2.cloudflare.com" });
const records = await client.getDnsZoneRecords("example.com");
await client.deleteDnsRecords("example.com", [{ name: "@", type: "A" }]);
```

`fetchImpl` is injectable on the constructor, matching this repo's
existing convention (`CloudflareClient`) — every test
here runs against a fake `fetch`, never a real network call.

## Endpoints (verified, not invented)

Hostinger's interactive docs at `developers.hostinger.com` are generated
from the same OpenAPI spec that backs its official SDKs
(`github.com/hostinger/api-php-sdk`), which is what this client's shapes
were verified against:

| Method | HTTP request | Used for |
| --- | --- | --- |
| `getDomain(domain)` | `GET /api/domains/v1/portfolio/{domain}` | Both "is this domain in our account" (404 → `undefined`) and current `nameServers.{ns1,ns2}` |
| `updateNameservers(domain, ns)` | `PUT /api/domains/v1/portfolio/{domain}/nameservers` | Switching a domain to Cloudflare's assigned nameservers |
| `getDnsZoneRecords(domain)` | `GET /api/dns/v1/zones/{domain}` | Inspecting Hostinger-managed DNS records |
| `deleteDnsRecords(domain, filters)` | `DELETE /api/dns/v1/zones/{domain}` | Available for manual recovery only — **not called by the default provisioning flow** |

## Why `deleteDnsRecords` exists but is never called automatically

Hostinger's own DNS management (hPanel, and by extension this API's DNS
zone) is only actually consulted by resolvers while a domain uses
Hostinger's nameservers. Once `updateNameservers()` switches a domain to
Cloudflare's, Hostinger's stored records become inert — nothing reads them
anymore. Deleting them first is therefore never a required step, and
skipping it removes a destructive operation from the default path
entirely. `deleteDnsRecords`/`getDnsZoneRecords` stay on the client for
inspection/manual cleanup, but `packages/domain-provisioning`'s handoff
service never calls them itself. See that package's README for the full
provisioning sequence this backs.

## Retries and timeouts

Every request gets an `AbortController`-based timeout (`timeoutMs`,
default 30s) and up to `maxRetries` (default 3) retries with exponential
backoff (500ms × 2^attempt) — but only for `5xx`/`429` responses and
network/timeout errors. A `4xx` (bad request, validation error, etc.) is
a real client error, not a transient one, so it fails immediately rather
than retrying a request that will never succeed as-is. `404` is treated
as neither: `getDomain()` uses it as an expected "not found" signal, so
it's returned as-is (not retried, not thrown from the transport layer).
