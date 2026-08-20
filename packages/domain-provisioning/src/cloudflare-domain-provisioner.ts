import { CloudflareClient, type FetchLike } from "cloudflare-client";
import type { DeployTarget } from "deploy";
import type { DomainProvisioner } from "./domain-provisioner.js";

type PagesDomain = { name: string };
type PagesProject = { subdomain: string };
type Zone = { id: string; status?: string; name_servers?: string[] };
type WorkerRoute = { id: string; pattern: string };
type DnsRecord = { id: string; name: string; type: string; content: string };

// Cloudflare zone status progresses "initializing" -> "pending" -> "active"
// (or "moved") as it detects the domain's nameservers actually delegating
// to Cloudflare — see ensureZone()/getZoneStatus() below.
export type CloudflareZone = { id: string; status: string; nameServers: string[] };

export type CloudflareDomainProvisionerOptions = {
  apiToken: string;
  accountId: string;
  // Name of the deployed Worker that serves /go/<slug> redirects — every
  // casino domain gets its own route into this one shared Worker.
  workerName: string;
  fetchImpl?: FetchLike;
};

export class CloudflareDomainProvisioner implements DomainProvisioner {
  #client: CloudflareClient;
  #accountId: string;
  #workerName: string;

  constructor(options: CloudflareDomainProvisionerOptions) {
    this.#client = new CloudflareClient(options.apiToken, { fetchImpl: options.fetchImpl });
    this.#accountId = options.accountId;
    this.#workerName = options.workerName;
  }

  async ensureCustomDomain(domain: string, target: DeployTarget): Promise<void> {
    const existing = await this.#client.get<PagesDomain[]>(
      `/accounts/${this.#accountId}/pages/projects/${target.projectName}/domains`,
    );
    if (!existing.some((entry) => entry.name === domain)) {
      await this.#client.postJson(`/accounts/${this.#accountId}/pages/projects/${target.projectName}/domains`, {
        name: domain,
      });
    }

    // Registering the custom domain with the Pages project (above) only
    // records the *intent* - Cloudflare's own dashboard flow additionally
    // creates the DNS record that makes it actually resolve, which the raw
    // API call does not do for you. Skipping this leaves the domain stuck
    // at Pages' own "pending" / "CNAME record not set" verification state
    // indefinitely, not just slow to propagate. Only attempted when the
    // domain's zone is already on this account - if it isn't (yet),
    // ensureRedirectWorkerRoute raises the clearer "no zone found" error
    // for that later in the pipeline.
    const zone = await this.findZone(domain);
    if (!zone) return;

    // Unfiltered by type (unlike the old type=CNAME-only query this replaced) -
    // a domain handed off from Hostinger routinely arrives with a stale A
    // record still in the zone (Cloudflare imports whatever DNS existed at
    // zone creation), and Cloudflare rejects the CNAME create below with
    // "record with that host already exists" (81053) if any record of any
    // type already occupies this name, not just a conflicting CNAME.
    const existingRecords = await this.#client.get<DnsRecord[]>(
      `/zones/${zone.id}/dns_records?name=${encodeURIComponent(domain)}`,
    );
    if (existingRecords.some((record) => record.type === "CNAME")) return;

    const project = await this.#client.get<PagesProject>(
      `/accounts/${this.#accountId}/pages/projects/${target.projectName}`,
    );

    // Clear the way for the CNAME below - any A/AAAA record here is leftover
    // from before the domain pointed at Cloudflare (e.g. a registrar's
    // default parking record), never something this pipeline put there
    // intentionally, so it's always safe to remove before creating the
    // record that actually makes the site resolve.
    for (const record of existingRecords) {
      await this.#client.deleteJson(`/zones/${zone.id}/dns_records/${record.id}`);
    }

    await this.#client.postJson(`/zones/${zone.id}/dns_records`, {
      type: "CNAME",
      name: domain,
      // project.subdomain from the Cloudflare API already includes the
      // ".pages.dev" suffix (e.g. "mad-dm5.pages.dev") - appending it again
      // here previously produced a bogus double-suffixed target
      // ("mad-dm5.pages.dev.pages.dev"), which Cloudflare's edge rejected
      // with "Error 1014: CNAME Cross-User Banned" rather than a clean DNS
      // failure, since that hostname belongs to no verifiable owner.
      content: project.subdomain,
      // Cloudflare flattens a proxied CNAME automatically even at the zone
      // apex, where a literal CNAME wouldn't otherwise be valid DNS.
      proxied: true,
    });
  }

  async ensureRedirectWorkerRoute(domain: string): Promise<{ routeId: string }> {
    const zone = await this.findZone(domain);
    if (!zone) {
      throw new Error(
        `No Cloudflare zone found for domain "${domain}" (or its root domain) — has it been added to this Cloudflare account?`,
      );
    }

    const pattern = `${domain}/go/*`;
    const existingRoutes = await this.#client.get<WorkerRoute[]>(`/zones/${zone.id}/workers/routes`);
    const existingRoute = existingRoutes.find((route) => route.pattern === pattern);
    if (existingRoute) return { routeId: existingRoute.id };

    const created = await this.#client.postJson<{ id: string }>(`/zones/${zone.id}/workers/routes`, {
      pattern,
      script: this.#workerName,
    });
    return { routeId: created.id };
  }

  // Cloudflare zones are always registered at a domain's actual root (e.g.
  // "crazytower7.com") - a subdomain like "www.crazytower7.com" has no zone
  // of its own, it belongs to the "crazytower7.com" zone. Walks up the
  // label hierarchy (www.example.com -> example.com) trying each candidate
  // until one matches a real zone in the account, stopping short of the
  // bare TLD - there's no public-suffix-list dependency here to compute the
  // exact registrable domain for arbitrary TLDs, so this is a pragmatic
  // approximation, not a fully correct eTLD+1 resolver (a multi-part TLD
  // like "co.uk" would walk one label too far before finding a zone, which
  // is harmless - it just means one extra lookup).
  //
  // Public (not just used internally by ensureCustomDomain/
  // ensureRedirectWorkerRoute above) so the Hostinger handoff flow
  // (packages/domain-provisioning's hostinger-domain-handoff.ts) can look
  // up an already-registered zone the same way, before deciding whether
  // ensureZone() needs to create one.
  async findZone(domain: string): Promise<Zone | undefined> {
    const labels = domain.split(".");
    for (let start = 0; start < labels.length - 1; start++) {
      const candidate = labels.slice(start).join(".");
      const zones = await this.#client.get<Zone[]>(`/zones?name=${encodeURIComponent(candidate)}`);
      if (zones[0]) return zones[0];
    }
    return undefined;
  }

  // Idempotent create-or-find: list-then-create (this package's existing
  // convention, not a try/create/catch-"already exists"), so a zone
  // created by a previous, since-interrupted run is reused rather than
  // erroring or creating a duplicate. Domains are registered at their
  // exact given form here (no root-walking like findZone/
  // ensureRedirectWorkerRoute do for subdomains) since zone creation is
  // only ever meaningful for a domain's actual registrable root - the
  // Hostinger handoff (this method's only caller) always passes that root.
  //
  // jump_start: false - Cloudflare's default jump_start behavior scans the
  // domain's *current* authoritative DNS and imports whatever it finds.
  // For a domain still on Hostinger's nameservers at the moment this
  // runs, that would import Hostinger's parking/default records into the
  // new Cloudflare zone - not useful, and something ensureCustomDomain
  // already creates the one DNS record this pipeline actually needs
  // (the Pages CNAME) once the zone exists.
  async ensureZone(domain: string): Promise<CloudflareZone> {
    const existing = await this.findZone(domain);
    const zone =
      existing ??
      (await this.#client.postJson<Zone>("/zones", {
        name: domain,
        account: { id: this.#accountId },
        jump_start: false,
      }));

    return { id: zone.id, status: zone.status ?? "pending", nameServers: zone.name_servers ?? [] };
  }

  // GET /zones/{id} - status flips "pending" -> "active" once Cloudflare
  // detects the domain's nameservers actually delegating to it. This is
  // the real "is Cloudflare authoritative yet" signal (Phase 5's
  // requirement to separate "nameserver update accepted by the registrar"
  // from "nameservers are globally authoritative") - deliberately not a
  // raw DNS NS lookup done by this codebase itself, since Cloudflare has
  // already done that detection work and exposes the result directly.
  async getZoneStatus(zoneId: string): Promise<CloudflareZone> {
    const zone = await this.#client.get<Zone>(`/zones/${zoneId}`);
    return { id: zone.id, status: zone.status ?? "pending", nameServers: zone.name_servers ?? [] };
  }
}
