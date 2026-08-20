# domain-provisioning

Two things live here, covering two different points in a site's
lifecycle:

1. **`CloudflareDomainProvisioner`** (`DomainProvisioner` interface) —
   runs as part of promoting a site to production (a preview deployment
   uses a `*.pages.dev` URL and needs none of this).
2. **`HostingerDomainHandoffService`** (`DomainHandoffService` interface)
   — runs once per domain, earlier: the one-time handoff from Hostinger
   (registrar) to Cloudflare (DNS/Pages/Workers) that replaces what used
   to be a manual step after buying a domain. See
   `HOSTINGER_DOMAIN_HANDOFF.md` at the repo root for the full picture of
   how this fits into `generate`.

## CloudflareDomainProvisioner

- **`ensureCustomDomain(domain, target)`** — attaches `domain` to the
  site's Cloudflare Pages project. Checks the project's existing domains
  first (`GET .../pages/projects/{project}/domains`) and only `POST`s if
  the domain isn't already there.
- **`ensureRedirectWorkerRoute(domain)`** — every casino domain needs its
  own route into the shared redirect Worker, since `/go/<slug>` is served
  relative to whichever domain the visitor is on. Looks up the domain's
  Cloudflare zone (`GET /zones?name=`), checks existing routes on that
  zone for a matching `<domain>/go/*` pattern, and only creates one if
  missing.
- **`ensureZone(domain)`** — idempotent create-or-find for the domain's
  Cloudflare zone itself (`GET /zones?name=` then `POST /zones` with
  `jump_start: false` if none exists). `jump_start: false` matters: the
  default behavior scans the domain's *current* authoritative DNS and
  imports whatever it finds — for a domain still on Hostinger's
  nameservers at the moment this runs, that would import Hostinger's
  parking/default records into the new Cloudflare zone, which nothing
  downstream wants.
- **`getZoneStatus(zoneId)`** — `GET /zones/{id}`. A zone's `status` goes
  `pending` -> `active` once Cloudflare detects the domain's nameservers
  actually delegating to it; this is what `HostingerDomainHandoffService`
  polls to distinguish "nameserver update accepted by Hostinger" from
  "Cloudflare is actually authoritative now."

All four are idempotent by construction (list-then-create), not by
catching an "already exists" error — deliberately, since the exact error
code Cloudflare returns for that case isn't something this package's
author could verify without live credentials, and guessing at it felt
worse than just checking first.

`NoopDomainProvisioner` backs `--dry-run` and tests. `CloudflareDomain
Provisioner` accepts an injectable `fetchImpl` for the same reason.

## HostingerDomainHandoffService

`provisionDomain(domain)` orchestrates the handoff end to end:

1. `hostingerClient.getDomain(domain)` — is this domain actually in the
   configured Hostinger account? If not, returns
   `SKIPPED_NOT_ON_HOSTINGER` immediately (not an error — this generator
   has always supported domains pointed at Cloudflare by other means).
2. `cloudflareZones.ensureZone(domain)` — the zone, and Cloudflare's
   assigned nameservers.
3. Compares the domain's *current* Hostinger nameservers against
   Cloudflare's assigned ones. Already correct? Skip the update
   (idempotent — reruns of an already-handed-off domain do nothing).
   Otherwise, `hostingerClient.updateNameservers(...)`.
4. If the zone isn't `active` yet, polls `getZoneStatus` with bounded
   exponential-feeling backoff (fixed interval, hard deadline — see
   "Propagation" below) until it is, or the deadline passes.
5. Returns a `DomainHandoffResult` with the final state — one of
   `SKIPPED_NOT_ON_HOSTINGER`, `SKIPPED_NOT_CONFIGURED` (the Noop
   service), `HOSTINGER_NAMESERVERS_UPDATED`, `NAMESERVERS_PROPAGATING`,
   or `CLOUDFLARE_AUTHORITY_CONFIRMED`.

**Deliberately stateless across calls.** `provisionDomain()` never trusts
a previously-persisted state to decide what to do — it re-derives "what's
actually true right now" from Hostinger's and Cloudflare's own APIs on
every call. That's what makes it safe to call unconditionally on every
`generate` run for every domain: idempotency comes from always checking
live state before acting (this package's existing list-then-create
convention), not from a separate "have I already done this" ledger that
could drift from reality. Whatever `packages/generator-cli` persists into
the site registry afterward (`SiteRegistryEntry.domainProvisioning`) is
purely an observability/audit record of the last outcome — never an input
back into this service.

**Never deletes Hostinger DNS records.** Hostinger's own DNS management
(hPanel, and this API's DNS zone) is only actually consulted by resolvers
while a domain uses Hostinger's nameservers. Once `updateNameservers()`
switches a domain to Cloudflare's, Hostinger's stored records become
inert — nothing reads them anymore. Deleting them first is therefore never
a required step for this migration to work, so the default flow doesn't
do it. `hostinger-client`'s `deleteDnsRecords`/`getDnsZoneRecords` stay
available for manual inspection/cleanup, but nothing here calls them
automatically.

**Propagation is bounded, not infinite.** Default: 15s poll interval, 5
minute cap (both configurable via the service's constructor). Reaching
the cap without the zone going `active` is not an error —
`NAMESERVERS_PROPAGATING` is a normal result, meant to be resumed by
simply running `generate` again later (since the service is stateless
across calls, that rerun re-checks live state from scratch and picks up
wherever reality actually is).

**Errors vs. propagation timeouts.** A genuine failure (Hostinger/
Cloudflare unreachable, zone creation rejected, nameserver update
rejected) throws `DomainHandoffError` — `.stage` names which step failed
(`"hostinger-verify"`, `"cloudflare-zone"`, `"hostinger-nameserver-
update"`, `"propagation-check"`), and `.retryable` classifies whether the
underlying cause looks transient (5xx/429/timeout — safe to just rerun)
or not (4xx — needs manual investigation, e.g. an invalid nameserver
format Hostinger rejected).

`NoopHostingerDomainHandoffService` backs `--dry-run` and repos without
`HOSTINGER_API_TOKEN` configured — no network calls, returns
`SKIPPED_NOT_CONFIGURED`.
