import { HostingerApiError, HostingerTimeoutError, type HostingerClient, type HostingerNameServers } from "hostinger-client";
import { CloudflareApiError } from "cloudflare-client";
import type { CloudflareZone } from "./cloudflare-domain-provisioner.js";

// The subset of CloudflareDomainProvisioner this service actually needs —
// a structural interface rather than importing the concrete class, so
// tests can supply a minimal fake instead of standing up a full
// CloudflareDomainProvisioner + fetch mock. CloudflareDomainProvisioner
// satisfies this without any changes.
export interface CloudflareZoneOperations {
  ensureZone(domain: string): Promise<CloudflareZone>;
  getZoneStatus(zoneId: string): Promise<CloudflareZone>;
}

export type DomainHandoffState =
  // Domain isn't in the configured Hostinger account at all — nothing to
  // automate (Phase 1's "domain already purchased [elsewhere]" case).
  | "SKIPPED_NOT_ON_HOSTINGER"
  // Hostinger isn't configured for this run at all (--dry-run, or no
  // HOSTINGER_API_TOKEN) — distinct from the above so logs/registry
  // entries don't imply a real Hostinger lookup happened.
  | "SKIPPED_NOT_CONFIGURED"
  | "HOSTINGER_NAMESERVERS_UPDATED"
  | "NAMESERVERS_PROPAGATING"
  | "CLOUDFLARE_AUTHORITY_CONFIRMED";

export type DomainHandoffResult = {
  domain: string;
  state: DomainHandoffState;
  cloudflareZoneId?: string;
  cloudflareNameServers?: string[];
};

export interface DomainHandoffLogger {
  info(message: string): void;
}

export type ProvisionDomainOptions = {
  // Overrides the constructor-level logger for just this call — lets a
  // caller processing several domains (a site can have more than one,
  // config.domains) prefix each line with the domain it's about
  // (Phase 11's "[domain] message" observability shape) without the
  // service needing to know about that formatting itself.
  logger?: DomainHandoffLogger;
};

export interface DomainHandoffService {
  provisionDomain(domain: string, options?: ProvisionDomainOptions): Promise<DomainHandoffResult>;
}

// Thrown only for genuine failures (Hostinger/Cloudflare unreachable, auth
// rejected, zone creation failed, nameserver update rejected) — never for
// "propagation hasn't finished yet", which is an expected outcome at this
// generator's volume and is returned as a normal NAMESERVERS_PROPAGATING
// result instead. `retryable` gives callers (pipeline.ts's error handling,
// or a future bulk-retry command) Phase 9's "is retrying this safe"
// classification without them needing to know Hostinger/Cloudflare's
// specific error shapes themselves.
export class DomainHandoffError extends Error {
  readonly domain: string;
  readonly stage: string;

  constructor(domain: string, stage: string, cause: unknown) {
    super(`Domain handoff failed for "${domain}" at stage "${stage}": ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = "DomainHandoffError";
    this.domain = domain;
    this.stage = stage;
  }

  get retryable(): boolean {
    const cause = this.cause;
    if (cause instanceof HostingerApiError) return cause.status >= 500 || cause.status === 429;
    if (cause instanceof CloudflareApiError) return cause.status >= 500 || cause.status === 429;
    if (cause instanceof HostingerTimeoutError) return true;
    // An error shape we don't specifically recognize (network failure,
    // DNS lookup failure, etc.) — default to "safe to retry" rather than
    // "give up", since the far more common failure mode at this volume is
    // transient infrastructure, not a permanently broken request.
    return true;
  }
}

function normalizeNameServer(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function nameServersAlreadyCorrect(current: HostingerNameServers, target: string[]): boolean {
  if (target.length === 0) return false;
  const currentSet = new Set([current.ns1, current.ns2].map(normalizeNameServer));
  const targetSet = new Set(target.map(normalizeNameServer));
  if (currentSet.size !== targetSet.size) return false;
  for (const ns of targetSet) if (!currentSet.has(ns)) return false;
  return true;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const noopLogger: DomainHandoffLogger = { info: () => {} };

export type HostingerDomainHandoffServiceOptions = {
  hostingerClient: HostingerClient;
  cloudflareZones: CloudflareZoneOperations;
  // Bounded propagation polling (Phase 5: never an infinite loop). 15s
  // interval / 5 minute cap by default — nameserver delegation is a DNS
  // change, not a Cloudflare-side operation, so most of that time is
  // genuinely unrecoverable wait, not something a tighter loop would
  // shorten. A domain that's still propagating past the cap comes back as
  // NAMESERVERS_PROPAGATING, not a timeout error — a later `generate` run
  // for the same site re-checks and picks up from there.
  pollIntervalMs?: number;
  maxPropagationWaitMs?: number;
  logger?: DomainHandoffLogger;
};

// Orchestrates the one-time handoff of a domain from Hostinger (registrar)
// to Cloudflare (DNS/Pages/Workers) — steps 2-5 of the previously-manual
// process this feature replaces. Deliberately stateless across calls: it
// never trusts a previously-persisted state to decide what to do next,
// it re-derives "what's actually true right now" from Hostinger's and
// Cloudflare's own APIs on every call. That's what makes provisionDomain()
// safe to call on every `generate` run for every domain, unconditionally —
// idempotency here comes from always checking live state before acting
// (list-then-create/update, this package's existing convention), not from
// a separate "have I already done this" ledger that could drift from
// reality. (Whatever pipeline.ts persists into the registry afterward is
// purely an observability/audit record of the last outcome — see
// packages/registry's siteRegistryEntrySchema.domainProvisioning — never
// an input back into this service.)
//
// Never deletes Hostinger DNS records — see this package's README and
// hostinger-client's for why that's not just an omission but the deliberate,
// API-behavior-driven safe default (Phase 6): once nameservers point at
// Cloudflare, Hostinger's own records stop being consulted by resolvers at
// all, so there is nothing to clean up.
export class HostingerDomainHandoffService implements DomainHandoffService {
  #hostinger: HostingerClient;
  #cloudflareZones: CloudflareZoneOperations;
  #pollIntervalMs: number;
  #maxPropagationWaitMs: number;
  #logger: DomainHandoffLogger;

  constructor(options: HostingerDomainHandoffServiceOptions) {
    this.#hostinger = options.hostingerClient;
    this.#cloudflareZones = options.cloudflareZones;
    this.#pollIntervalMs = options.pollIntervalMs ?? 15_000;
    this.#maxPropagationWaitMs = options.maxPropagationWaitMs ?? 5 * 60_000;
    this.#logger = options.logger ?? noopLogger;
  }

  async provisionDomain(domain: string, options: ProvisionDomainOptions = {}): Promise<DomainHandoffResult> {
    const logger = options.logger ?? this.#logger;

    let hostingerDomain;
    try {
      hostingerDomain = await this.#hostinger.getDomain(domain);
    } catch (error) {
      throw new DomainHandoffError(domain, "hostinger-verify", error);
    }

    if (!hostingerDomain) {
      logger.info("not managed by the configured Hostinger account — skipping automated nameserver handoff");
      return { domain, state: "SKIPPED_NOT_ON_HOSTINGER" };
    }
    logger.info("Hostinger verification OK");

    let zone: CloudflareZone;
    try {
      zone = await this.#cloudflareZones.ensureZone(domain);
    } catch (error) {
      throw new DomainHandoffError(domain, "cloudflare-zone", error);
    }
    logger.info(`Cloudflare zone ready (${zone.id})`);

    if (zone.nameServers.length === 0) {
      // Not expected in practice (Cloudflare assigns nameservers at zone
      // creation), but if it ever happens there's nothing safe to hand
      // Hostinger yet — fail loudly rather than writing garbage
      // nameservers into the domain's registrar record.
      throw new DomainHandoffError(domain, "cloudflare-zone", new Error("Cloudflare zone has no assigned nameservers yet"));
    }
    logger.info(`Cloudflare nameservers: ${zone.nameServers.join(", ")}`);

    if (nameServersAlreadyCorrect(hostingerDomain.nameServers, zone.nameServers)) {
      logger.info("Hostinger nameservers already point at Cloudflare — no update needed");
    } else {
      logger.info("updating Hostinger nameservers");
      try {
        await this.#hostinger.updateNameservers(domain, { ns1: zone.nameServers[0]!, ns2: zone.nameServers[1] ?? zone.nameServers[0]! });
      } catch (error) {
        throw new DomainHandoffError(domain, "hostinger-nameserver-update", error);
      }
      logger.info("Hostinger nameservers updated");
    }

    if (zone.status === "active") {
      logger.info("Cloudflare authoritative");
      return { domain, state: "CLOUDFLARE_AUTHORITY_CONFIRMED", cloudflareZoneId: zone.id, cloudflareNameServers: zone.nameServers };
    }

    logger.info("waiting for nameserver propagation");
    let confirmed: boolean;
    try {
      confirmed = await this.#pollForAuthority(zone.id);
    } catch (error) {
      throw new DomainHandoffError(domain, "propagation-check", error);
    }

    if (confirmed) {
      logger.info("Cloudflare authoritative");
      return { domain, state: "CLOUDFLARE_AUTHORITY_CONFIRMED", cloudflareZoneId: zone.id, cloudflareNameServers: zone.nameServers };
    }

    logger.info(`nameservers not yet propagated after ${this.#maxPropagationWaitMs}ms — will re-check on the next run`);
    return { domain, state: "NAMESERVERS_PROPAGATING", cloudflareZoneId: zone.id, cloudflareNameServers: zone.nameServers };
  }

  async #pollForAuthority(zoneId: string): Promise<boolean> {
    const deadline = Date.now() + this.#maxPropagationWaitMs;
    for (;;) {
      const zone = await this.#cloudflareZones.getZoneStatus(zoneId);
      if (zone.status === "active") return true;
      if (Date.now() + this.#pollIntervalMs > deadline) return false;
      await sleep(this.#pollIntervalMs);
    }
  }
}

// Backs --dry-run and "Hostinger not configured" (no HOSTINGER_API_TOKEN)
// runs — no network calls, matching NoopDomainProvisioner/
// NoopDeploymentProvider/NoopRedirectStore's existing role in this
// codebase. Distinct from a real "domain not on Hostinger" result
// (SKIPPED_NOT_CONFIGURED vs. SKIPPED_NOT_ON_HOSTINGER) so logs/registry
// entries can't be misread as "we checked Hostinger and it wasn't there".
export class NoopHostingerDomainHandoffService implements DomainHandoffService {
  async provisionDomain(domain: string, _options: ProvisionDomainOptions = {}): Promise<DomainHandoffResult> {
    return { domain, state: "SKIPPED_NOT_CONFIGURED" };
  }
}
