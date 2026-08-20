# Hostinger domain handoff

Automates what used to be a manual step for every new domain: after
buying it on Hostinger, logging into hPanel to point its nameservers at
Cloudflare before the rest of this generator's Cloudflare pipeline
(DNS, Pages, Workers/KV) could take over.

Implemented in `packages/hostinger-client` (low-level Hostinger API
client) and `packages/domain-provisioning`'s `HostingerDomainHandoffService`
(the orchestration) — see that package's README for the implementation
details. This doc is the operational picture: what to configure, what
happens automatically, and how to unstick a domain that didn't finish.

## Setup

Add to `.env` (see `.env.example`):

```
HOSTINGER_API_TOKEN=<bearer token from hPanel -> Account -> API>
HOSTINGER_API_BASE_URL=          # optional, defaults to https://developers.hostinger.com
```

The Cloudflare credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
this pipeline already required are reused as-is — nothing new needed
there. The Cloudflare API token needs Zone-create permission on the
account in addition to whatever Pages/Workers/KV permissions it already
has, since this feature creates a Cloudflare zone per domain if one
doesn't exist yet.

**This is entirely optional.** Leave `HOSTINGER_API_TOKEN` unset and
`generate` behaves exactly as it did before this feature existed — the
`provision-domain` stage runs against `NoopHostingerDomainHandoffService`
and does nothing. Turn it on once you're ready to automate the handoff
for domains actually registered through Hostinger.

## What happens after you buy a domain

Nothing manual. Once the domain exists in your Hostinger account and its
name appears in a site's `config.json` (`domains`), the next `generate`
run for that site (anything short of `--dry-run`/`--skip-deploy`/
`--preview-only`) automatically:

1. Confirms the domain is actually in the configured Hostinger account.
   (If it isn't — a domain registered elsewhere, or not yet showing up —
   this step is skipped, not an error. This generator has always
   supported domains pointed at Cloudflare by other means.)
2. Creates the domain's Cloudflare zone if it doesn't already have one.
3. Reads the domain's *current* Hostinger nameservers and compares them
   to Cloudflare's assigned ones. Already correct? Nothing to do.
   Otherwise, switches them via the Hostinger API.
4. Waits (bounded — see below) for Cloudflare to confirm it's actually
   authoritative for the domain.
5. Continues into the existing Cloudflare pipeline: DNS record for the
   Pages project, the redirect Worker's route, the production deploy.

**Hostinger's own DNS records are never deleted.** Once a domain's
nameservers point at Cloudflare, Hostinger's own DNS zone stops being
consulted by resolvers at all — hPanel DNS management itself only applies
while a domain uses Hostinger's nameservers. There's nothing to clean up,
so nothing is deleted. (See `packages/domain-provisioning`'s README for
the full reasoning, and why the client still exposes delete/read
operations for manual use.)

## Propagation

Nameserver changes are DNS changes — they don't take effect the instant
Hostinger accepts the update. This is handled with a **bounded** poll
(default: check every 15s, give up after 5 minutes), watching
Cloudflare's own zone status (`pending` -> `active`) rather than doing a
raw DNS lookup — Cloudflare has already done that detection work.

If the 5-minute window passes without Cloudflare going active, that's
**not treated as a failure.** The site's deployment continues (Cloudflare
accepts the DNS/Pages/Worker-route API calls regardless of zone status —
the domain just won't resolve publicly until propagation actually
finishes), and the domain is left in a `NAMESERVERS_PROPAGATING` state.

## Retrying / resuming a stuck domain

Just run `generate` again for that site:

```
npm run generate -- sites/<slug>
```

The handoff service never trusts previously-saved state to decide what to
do — every run re-derives "what's actually true right now" from
Hostinger's and Cloudflare's own APIs. A domain still propagating simply
gets re-checked; a domain that's already fully handed off gets a no-op
verification (a couple of read-only API calls) and moves straight on.
There's no separate "retry" command needed, and no risk of double-running
something destructive.

## Where to look when something's stuck

`registry/sites.json`'s per-site `domainProvisioning` array records the
last outcome for each domain — `state`, the Cloudflare zone id/nameservers
if known, and (on failure) `lastError: { stage, message, retryable }`.
This is a record of the last run, not live state — always trust a fresh
`generate` run over what's written here.

Console output during the `provision-domain` stage is prefixed per domain
(`  <domain>: <message>`), progressing through: Hostinger verification →
Cloudflare zone ready → Cloudflare nameservers → updating Hostinger
nameservers → waiting for propagation → Cloudflare authoritative.

## Troubleshooting

**Hostinger API errors (`DomainHandoffError` at stage `hostinger-verify`
or `hostinger-nameserver-update`)**
- Check `HOSTINGER_API_TOKEN` is valid and has domain/DNS permissions for
  the account the domain is actually registered under.
- A `4xx` from Hostinger (invalid nameserver format, domain not eligible
  for a nameserver change, etc.) is not retried automatically — the error
  message includes Hostinger's own explanation. Fix the underlying issue,
  then rerun `generate`.
- A `5xx`/timeout is retried automatically (up to 3 attempts, exponential
  backoff) before surfacing as an error — if you still see one, Hostinger
  itself is likely degraded; rerunning later is safe.

**Cloudflare errors (`DomainHandoffError` at stage `cloudflare-zone`)**
- Usually a permissions issue — the API token needs Zone-create on the
  account, not just Zone-edit on zones that already exist.
- Could also mean the domain is already a zone on a *different*
  Cloudflare account than the one configured — Cloudflare zones are
  globally unique per domain.

**Nameservers won't propagate past 5 minutes**
- Normal for some registrar/TLD combinations — DNS propagation can
  legitimately take longer than 5 minutes, occasionally hours. Rerunning
  `generate` later re-checks and resumes automatically; no action needed
  unless it's been unreasonably long (hours), in which case check the
  domain's nameservers directly in hPanel or via `dig NS <domain>`.
- If Hostinger's own domain status shows something other than active/
  normal (e.g. still finishing registration, locked, pending transfer),
  resolve that in hPanel first — nameserver changes on a domain that
  isn't fully active yet can be rejected or silently ignored by the
  registry.

## Hostinger API limitations (as of this writing)

- No webhook/push notification for "nameservers finished propagating" —
  polling Cloudflare's own zone status is the only practical signal.
- No bulk nameserver-update endpoint — one domain per API call, which is
  what `HostingerDomainHandoffService` does (no batching to worry about,
  but also no way to short-circuit a large batch server-side).
- DNS zone reads/writes (`GET`/`PUT`/`DELETE /api/dns/v1/zones/{domain}`)
  only reflect Hostinger's own DNS while the domain is still on
  Hostinger's nameservers — once switched to Cloudflare, that data is
  stale by definition, which is exactly why this feature doesn't try to
  keep syncing it.
