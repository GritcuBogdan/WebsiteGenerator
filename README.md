# Casino Site Generator

Turns a folder of per-site content (`sites/<slug>/`) into a built, deployed
Astro site: parses/validates content, optimizes images, composes SEO/page
content, builds, and (optionally) deploys to Cloudflare Pages with a
custom domain.

## How it fits together

- `apps/templates/casino-v1`, `apps/templates/casino-v2` — the Astro
  templates sites are built from. Pick one per site via `config.json`'s
  `template` field.
- `packages/generator-cli` — the CLI (`npm run generate`, `new-site`,
  etc.) and the orchestration pipeline that ties everything below
  together.
- `packages/docx-parser`, `packages/content-library`, `packages/codegen`
  — turn a site's raw content (a `.docx` brief, or the reusable
  `content-library`) into page content and images-to-page matching.
- `packages/image-pipeline` — optimizes/resizes images you drop into
  `sites/<slug>/images/` and generates a favicon from the logo.
- `packages/schema` — the `config.json`/`data.json` shape, shared by
  everything that reads or writes them.
- `packages/deploy`, `packages/domain-provisioning`, `packages/redirects`,
  `packages/cloudflare-client`, `packages/hostinger-client` — the deploy
  pipeline: Cloudflare Pages, domain/DNS handoff, affiliate redirects.

## Setup

Requires Node.js >= 22.12.

```
npm install
cp .env.example .env
```

Fill in `.env` as needed:
- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_KV_NAMESPACE_ID` /
  `CLOUDFLARE_REDIRECT_WORKER_NAME` — required for any real deploy
  (`npm run generate` without `--skip-deploy`/`--dry-run`). Not needed for
  local builds/previews.
- `HOSTINGER_API_TOKEN` — optional. Only needed if a domain was bought
  through Hostinger and you want its nameserver handoff to Cloudflare
  automated. See `HOSTINGER_DOMAIN_HANDOFF.md`. Leave unset and this step
  is just skipped.

## Creating a new site, end to end

### 1. Scaffold it

```
npm run new-site -- mycasino
```

Creates `sites/mycasino/` with a starter `config.json`, an `images/`
folder, and a `README.md`.

### 2. Edit `sites/mycasino/config.json`

```json
{
  "slug": "mycasino",
  "domains": ["mycasino.example.com"],
  "affiliateUrl": "https://affiliate.example/track?id=mycasino",
  "locales": [{ "code": "en-US", "default": true }],
  "contentSource": "library",
  "profile": "starter-casino",
  "template": "casino-v1"
}
```

- `affiliateUrl` / `domains` — fill in the real ones once you have them;
  placeholders are fine for a local test.
- `template` — `casino-v1` or `casino-v2` (the two Astro templates).
- `profile: "starter-casino"` (see `profiles/starter-casino.json`) fills
  in theme/navbar/banner defaults for free — omit it and set
  `theme`/`navbar`/`banner` yourself for a fully custom look instead.
- `contentSource: "library"` composes page copy from `content-library/`
  (recommended, no manual writing). Omit it for the older docx-based flow
  — drop a `casino.<locale>.docx` brief into the site folder instead and
  the parser extracts content from that.

### 3. Add `sites/mycasino/data.json`

The site's real facts — `content-library` composes actual page copy from
these:

```json
{
  "brandName": "MyCasino",
  "welcomeBonus": { "amount": 500, "currency": "USD" },
  "minimumDeposit": 20,
  "gameCount": 1500,
  "paymentMethods": ["Visa", "Mastercard", "Skrill"],
  "withdrawalMethods": ["Bank Transfer", "Skrill"],
  "noDepositBonus": { "amount": 25, "currency": "USD" },
  "freeSpins": { "count": 50 },
  "promoCode": "MYCASINO50",
  "supportedCurrencies": ["USD"],
  "contentVersion": "v1"
}
```

Only supply facts you actually have — every field is optional, and a page
whose required facts are missing is skipped gracefully rather than
generated with fake info. Leave `pages` unset to get the standard 11-page
set (index, review, bonus, withdrawal, slots, login, application,
registration, no-deposit-bonus, free-spins, promo-code); set it
explicitly (`"pages": ["index", "bonus", "slots"]`) to generate a subset
instead.

### 4. Add images

Drop images into `sites/mycasino/images/`:
- `logo.(png|jpg|jpeg|webp)` — the site logo; also auto-generates the
  favicon.
- A hero image per page you're generating, named to match the page slug
  (e.g. `index.webp`, `bonus.webp`) — see `sites/_example/` for the full
  naming convention and `packages/codegen/src/casino-v1-rules.ts` for how
  matching works. Optional per-page alternates for promo banners:
  `<pageSlug>-alt-1.*` through `-alt-4.*`.
- Payment method / banner / slots images as referenced by your profile or
  `config.json`.

`npm run generate` (next step) runs everything in `images/` through
optimization (resize, webp conversion) automatically — just drop in
originals.

### 5. Validate

```
npm run validate-sites -- --site=mycasino
```

Catches a broken config/missing facts/bad content composition before you
build anything.

### 6. Generate the site (local only, no deploy)

```
npm run generate -- sites/mycasino --skip-deploy
```

Parses content → applies overrides → processes/optimizes images →
assembles pages → validates → generates content/SEO → Astro build.
Output lands in `sites/mycasino/.generated/` (gitignored, disposable).

### 7. Preview it locally

`SITE_DIR` must be set **before** `astro dev` starts — the template's
`astro.config.mjs` reads it to resolve the `virtual:site` module. If you
skip this (or set it the wrong way for your shell), dev starts fine but
every page errors with `Cannot find module 'virtual:site'`.

macOS/Linux:
```bash
SITE_DIR=sites/mycasino npm run dev --workspace=apps/templates/casino-v1
```

Windows PowerShell:
```powershell
$env:SITE_DIR = "sites/mycasino"
npm run dev --workspace=apps/templates/casino-v1
```

Match `--workspace` to whatever `template` you set in `config.json`.
Opens at `http://localhost:4321` (or the next free port — check the
terminal output).

### 8. Deploy (optional, later)

```
npm run generate -- sites/mycasino
```

(no `--skip-deploy`) does a real Cloudflare Pages deployment — needs the
`CLOUDFLARE_*` vars in `.env`. Use `--preview-only` for a preview
deployment without promoting to production, or `--dry-run` to sanity-check
the orchestration without touching Cloudflare at all.

If the domain was bought on Hostinger and `HOSTINGER_API_TOKEN` is set,
this same command also handles the nameserver handoff (Hostinger →
Cloudflare) automatically before deploying — see
`HOSTINGER_DOMAIN_HANDOFF.md`.

---

## Quick reference

| Step | Command |
|---|---|
| Scaffold | `npm run new-site -- <slug>` |
| Validate | `npm run validate-sites -- --site=<slug>` |
| Build (local only) | `npm run generate -- sites/<slug> --skip-deploy` |
| Preview locally | `SITE_DIR=sites/<slug> npm run dev --workspace=apps/templates/casino-v1` |
| Deploy | `npm run generate -- sites/<slug>` |
| All sites at once | swap `sites/<slug>` for `--all` on `generate`/`validate-sites` |
| Content library checks | `npm run content:validate`, `content:stats`, `content:dedupe` |

## Other useful flags on `generate`

- `--only=stage1,stage2` — rerun specific pipeline stages only (e.g.
  `--only=build`)
- `--verbose` — more logging
- `--dry-run` — simulates deploy stages with fake providers, doesn't touch
  Cloudflare

## More docs

- `sites/_example/` — a fully-documented reference `config.json`.
- `HOSTINGER_DOMAIN_HANDOFF.md` — how the Hostinger → Cloudflare domain
  handoff works end to end.
- Each `packages/*` directory has its own `README.md` where the package
  isn't self-explanatory.
