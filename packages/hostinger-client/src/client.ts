// Low-level HTTP plumbing for the Hostinger API, mirroring
// packages/cloudflare-client's role for Cloudflare: bearer auth, one place
// that knows the base URL, structured errors. Unlike CloudflareClient,
// this adds a timeout + bounded retry — Hostinger's registrar API is
// called far less often than Cloudflare's, but a domain-purchase-day burst
// of "generate" runs against it is exactly the kind of bursty traffic that
// benefits from not treating a single transient 502 as fatal.
//
// Endpoints/schemas here are verified against Hostinger's actual
// OpenAPI-generated SDKs (github.com/hostinger/api-php-sdk,
// docs/Api/DomainsPortfolioApi.md and docs/Api/DNSZoneApi.md) — that's
// the real source of truth developers.hostinger.com's interactive
// reference is generated from, not a guess at endpoint shapes.

export type FetchLike = typeof fetch;

export class HostingerApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`Hostinger API error (HTTP ${status}): ${message}`);
    this.name = "HostingerApiError";
    this.status = status;
  }
}

export class HostingerTimeoutError extends Error {}

export type HostingerNameServers = { ns1: string; ns2: string };

// Only the fields this codebase actually reads from
// DomainsV1DomainDomainExtendedResource — not a full mirror of Hostinger's
// response, matching this repo's existing convention of minimal duck-typed
// API shapes (e.g. cloudflare-domain-provisioner.ts's local `Zone`/`PagesDomain`).
export type HostingerDomain = {
  domain: string;
  status: string;
  nameServers: HostingerNameServers;
};

export type DnsZoneNameRecord = { content: string; isDisabled?: boolean };
export type DnsZoneRecord = { name: string; type: string; ttl: number; records: DnsZoneNameRecord[] };
export type DnsZoneDeleteFilter = { name: string; type: string };

export type HostingerClientOptions = {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
};

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HostingerClient {
  #apiToken: string;
  #baseUrl: string;
  #fetchImpl: FetchLike;
  #timeoutMs: number;
  #maxRetries: number;

  constructor(apiToken: string, options: HostingerClientOptions = {}) {
    this.#apiToken = apiToken;
    this.#baseUrl = options.baseUrl ?? "https://developers.hostinger.com";
    this.#fetchImpl = options.fetchImpl ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#maxRetries = options.maxRetries ?? 3;
  }

  // GET /api/domains/v1/portfolio/{domain} — the one call that answers
  // both "is this domain actually in our Hostinger account" and "what are
  // its current nameservers", so callers use it as their existence check
  // too. Returns undefined on 404 rather than throwing, the same
  // convention CloudflareClient.getRawOrNull uses for "expected absence" —
  // a domain not (yet, or ever) in this Hostinger account isn't an error
  // for a caller that's about to decide whether to skip it.
  async getDomain(domain: string): Promise<HostingerDomain | undefined> {
    const response = await this.#requestWithRetry("GET", `/api/domains/v1/portfolio/${encodeURIComponent(domain)}`);
    if (response.status === 404) return undefined;
    // The live response wraps nameservers under snake_case "name_servers"
    // (confirmed against the real API - DomainsV1DomainDomainExtendedResource's
    // wire format, not just its PHP-SDK binding name), not the "nameServers"
    // this client's own HostingerDomain type uses - map it explicitly rather
    // than casting the raw body, or hostingerDomain.nameServers silently
    // comes back undefined for every caller.
    const raw = await this.#parseJson<{ domain: string; status: string; name_servers: HostingerNameServers }>(response);
    return { domain: raw.domain, status: raw.status, nameServers: raw.name_servers };
  }

  // PUT /api/domains/v1/portfolio/{domain}/nameservers. Hostinger's own
  // docs warn that an incorrect nameserver set can make the domain
  // unresolvable, so this never guesses or defaults — callers always pass
  // the exact nameservers to set (ns3/ns4 optional, matching Hostinger's
  // request shape; Cloudflare zones only ever hand back two).
  async updateNameservers(
    domain: string,
    nameServers: { ns1: string; ns2: string; ns3?: string; ns4?: string },
  ): Promise<void> {
    const response = await this.#requestWithRetry(
      "PUT",
      `/api/domains/v1/portfolio/${encodeURIComponent(domain)}/nameservers`,
      nameServers,
    );
    await this.#parseJson(response);
  }

  // GET /api/dns/v1/zones/{domain}. Only reflects Hostinger's stored
  // records — once a domain's nameservers point elsewhere, this is no
  // longer what's actually being served to resolvers.
  async getDnsZoneRecords(domain: string): Promise<DnsZoneRecord[]> {
    const response = await this.#requestWithRetry("GET", `/api/dns/v1/zones/${encodeURIComponent(domain)}`);
    return this.#parseJson<DnsZoneRecord[]>(response);
  }

  // DELETE /api/dns/v1/zones/{domain}. Exposed for completeness/manual
  // recovery only — nothing in this codebase's default provisioning flow
  // calls it. Once nameservers point at Cloudflare, Hostinger's own DNS
  // records stop being consulted by resolvers at all (hPanel DNS
  // management itself is only active while a domain actually uses
  // Hostinger's nameservers), so deleting them first is never a required
  // step. See packages/domain-provisioning's README for the full
  // rationale behind not calling this by default.
  async deleteDnsRecords(domain: string, filters: DnsZoneDeleteFilter[]): Promise<void> {
    const response = await this.#requestWithRetry("DELETE", `/api/dns/v1/zones/${encodeURIComponent(domain)}`, {
      filters,
    });
    await this.#parseJson(response);
  }

  async #parseJson<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new HostingerApiError(response.status, this.#extractMessage(body) ?? (body || response.statusText));
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  #extractMessage(body: string): string | undefined {
    try {
      return (JSON.parse(body) as { message?: string }).message;
    } catch {
      return undefined;
    }
  }

  async #requestWithRetry(method: string, path: string, jsonBody?: unknown): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
      try {
        const response = await this.#fetchImpl(`${this.#baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.#apiToken}`,
            ...(jsonBody !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timer);
        // A 404 is an expected, caller-handled outcome (e.g. getDomain's
        // "not in this account"), never transient — returned as-is rather
        // than retried.
        if (response.status === 404) return response;
        if ((response.status >= 500 || response.status === 429) && attempt < this.#maxRetries) {
          lastError = new HostingerApiError(response.status, "transient server error");
          await sleep(500 * 2 ** attempt);
          continue;
        }
        return response;
      } catch (error) {
        clearTimeout(timer);
        lastError =
          error instanceof Error && error.name === "AbortError"
            ? new HostingerTimeoutError(`Request to ${path} timed out after ${this.#timeoutMs}ms`)
            : error;
        if (attempt < this.#maxRetries) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
