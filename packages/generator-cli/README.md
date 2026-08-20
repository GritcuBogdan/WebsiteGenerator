# generator-cli

The orchestrator: ties `docx-parser` → `overrides` → `image-pipeline` →
`codegen` → `deploy` → `domain-provisioning` → `redirects` together, plus
(`content-library` + `schema`'s `SiteData`/`CasinoDatasetRow`) for the
structured-data path that scales past hand-writing a docx per site.

```
npm run new-site -- <slug>
npm run generate -- sites/<slug> [--dry-run] [--preview-only] [--skip-deploy] [--only=stage1,stage2] [--verbose]
npm run generate -- --site=<slug> --preview
npm run generate -- --all [--dry-run] [--site=<slug>] [--locale=<code>] [--limit=<n>]
npm run import-sites -- data/casinos.json [--force] [--dry-run]
npm run validate-sites -- --all [--site=<slug>] [--locale=<code>]
npm run content:validate | content:stats | content:dedupe
```

All of the above must be run from the repo root (SITE_DIR resolution in
`apps/templates/*/astro.config.mjs` assumes this, same as `.env`/registry
resolution in `providers.ts`).

## Two ways to bring up a site

A single, bespoke site is still `new-site <slug>` → hand-edit
`config.json`/`data.json` (or add a docx) → `generate -- sites/<slug>`,
exactly as before content-library/import-sites existed.

At scale (the "100+ sites/day" goal), the path is dataset-first:

```
data/casinos.json                      one row per site: slug, brandName,
      │                                domain, affiliateUrl, locale,
      │                                profile, welcomeBonus, gameCount, …
      ▼
npm run import-sites -- data/casinos.json
      │                                scaffolds/updates sites/<slug>/
      │                                {config.json, data.json, images/},
      │                                idempotent (see import-sites.ts)
      ▼
sites/<slug>/{config.json,data.json}   config.contentSource explicitly
      │                                "library" (never inferred)
      ▼
npm run validate-sites -- --all        no-build readiness report — schema,
      │                                profile resolution, contentSource,
      │                                content-eligibility, images —
      │                                cheap enough to run on all 100
      │                                before any real generation starts
      ▼
   (fix anything flagged, in the dataset row or a per-site override)
      ▼
npm run generate -- --all              per-site build+deploy, concurrency-
                                        capped, one site's failure never
                                        stops the batch
```

`content-library/*.md` growth (adding more reusable copy variants, or a
new locale) is a separate, occasional maintenance task — not part of the
per-casino loop above. See `packages/content-library` for its
discovery/composition rules and `packages/schema/src/casino-dataset.ts` for
`data/casinos.json`'s row shape.

### import-sites

Reads `data/casinos.json` (a JSON array of rows validated against
`CasinoDatasetRow`), and for each row scaffolds or updates
`sites/<slug>/config.json` + `data.json` + `images/`. Splits each row's
identity fields (slug/domain/affiliateUrl/locale/contentSource) into
`config.json`; every other field (the facts) into `data.json`.

Idempotent by default, at **field-level** granularity: a field only
refreshes from the dataset when the site doesn't have it yet, or when its
current on-disk value still matches what `import-sites` itself wrote there
last time — tracked via a hidden `sites/<slug>/.import-sites-state.json`
manifest. A field a human has since hand-edited is left alone, even if the
dataset's value for it changes too. `--force` discards existing
config.json/data.json content entirely and rewrites exactly what the row
says. `--dry-run` reports what would happen (`Would create:` /
`Would update:` / `Would reject:`) without writing anything.

A duplicate slug or domain within the dataset, or a row that fails schema
validation, fails that row in isolation — the rest of the batch still
imports. Batch progress prints as `[NNN/total] slug ... CREATE/UPDATE/
UNCHANGED/ERROR`, with a final summary and a non-zero exit code if
anything failed.

### validate-sites

A no-build readiness check across every `sites/*` directory (or a `--site=`
/`--locale=`-filtered subset): config schema, profile resolution,
`contentSource` resolution, docx-file-exists (docx sites) or
`data.json` schema + content-eligibility (library sites — reusing
`composeContent`, which never touches disk), and a coarse image-presence
check. Each check is graded OK/WARNING/ERROR; a site's overall level is the
worst of its checks. Non-zero exit if anything is ERROR.

The image check only verifies a source image exists somewhere (locally or
via a referenced profile) — it does **not** replicate `casino-v1-rules.ts`'s
real per-role (logo/hero/slots) fuzzy matcher, which needs a *processed*
image manifest that `validate-sites` deliberately never produces (it must
stay cheap enough to run against all 100 sites with no image processing, no
composition-for-real, no build). A site that passes here can still fail
`generate`'s own `validate-site` stage on a specific missing image role;
that stage remains the authoritative check.

### generate --all

A concurrency-capped (default 5) loop over `sites/*` calling the same,
unmodified `generate()` used for a single site — the `--dry-run` /
`--only=` flags documented below all still apply per site. Loads the
content library once and shares it across every site in the batch instead
of each site re-reading disk. One site's failure is caught and reported,
never stopping or corrupting the rest of the batch. `--site=<slug>`
restricts the batch to one site (useful for testing the bulk path
in isolation); `--locale=<code>` restricts it to sites that declare that
locale at all — **not** to generating only that locale for a multi-locale
site, since `generate()` always builds and deploys a site's full locale
set together in one non-incremental `astro build`, and narrowing that per
call would risk shipping a build that silently drops a previously-live
locale. `--limit=<n>` caps how many sites run.

### generate --site=&lt;slug&gt; --preview

Runs the pipeline through `validate-site` only (no build, no deploy — not
even a Cloudflare provider gets constructed), then prints the resolved
profile, chosen skeleton/components per page, and word counts (from
`.generated/content-report.json`, a byproduct `parse-docx` already writes
for library sites) instead of building. A docx site has no content report,
so preview falls back to page counts.

## Pipeline stages

`load-config → parse-docx → apply-overrides → process-images →
assemble-site → validate-site → generate-content → generate-seo-assets →
build → resolve-deployment-target → deploy-preview → verify-preview →
promote-to-production → update-redirect → verify-deployment`

This differs from the architecture doc's stage *numbering* in one
deliberate way: **process-images runs before assemble-site/validate-site**,
not after. Two reasons:
- validate-site's "referenced images exist" check is meaningless before
  images have actually been processed into `.generated/public/images`.
- Automatic favicon generation (from a `logo.*` file in `images/`) needs to
  resolve *before* assemble-site runs, so the generated `favicon.ico` path
  can be embedded in the assembled `Casino` rather than patched in after.

`--only=stage1,stage2` is a debugging escape hatch (e.g. `--only=build` to
re-run just the Astro build against already-generated `.generated/
content`), not a dependency-aware stage selector — skipped stages simply
don't run, they don't get their prior output backfilled.

## Flags controlling the deploy stages

- **`--skip-deploy`** — skips stages 10–16 entirely, including
  resolve-deployment-target. Stays fully local: touches neither Cloudflare
  nor `registry/sites.json`.
- **`--dry-run`** — deploy stages still run, but `providers.ts` (the
  composition root) selects `Noop*` implementations instead of the real
  Cloudflare ones, so `resolve-deployment-target` still writes to the
  registry (proving the orchestration logic end-to-end) but nothing calls
  Cloudflare. `verify-preview`/`verify-deployment` are skipped rather than
  actually attempted in this mode too — a Noop deploy hands back a fake
  `*.pages.dev` URL that will never resolve, so a real HTTP check against
  it would always "fail" for a reason that has nothing to do with the
  site.
- **`--preview-only`** — stops after `verify-preview`: no domain/route
  provisioning, no production deploy, no KV redirect write.

Every remote-resource stage is idempotent, checked against
`registry/sites.json` before creating anything (see `packages/registry`'s
README for the `upsert`-replaces-not-merges caveat, and note that
`promote-to-production` reads the current registry entry, merges in any
newly-provisioned Worker route ids, and writes that back *before* calling
`deploymentProvider.promote()` — so a failure partway through doesn't lose
track of domains/routes that were already provisioned).

## Errors

Every stage's failure is wrapped in a `PipelineError` naming the stage.
Zod validation errors are formatted as one `path: message` per issue
(duck-typed by `{ name: "ZodError", issues: [...] }` shape rather than
`instanceof ZodError` — this workspace ends up with two different major
versions of zod installed, v3 in every package here and v4 pulled in
transitively at the root, likely by Astro's own toolchain, so `instanceof`
across that boundary silently returns false even for a real Zod error).

## Verification

This package's own unit tests cover the CLI's pure logic (arg parsing,
`new-site` scaffolding, error/summary formatting, the provider composition
root's Noop-vs-Cloudflare selection, URL verification retry/backoff) — the
deploy stages themselves (10-16, with `--dry-run`, `--skip-deploy`, and
`--preview-only`) were verified manually against real throwaway sites with
a real `astro build`, rather than as an automated test, since a full deploy
isn't a good fit for the fast unit-test loop the rest of this repo uses.
**The real Cloudflare implementations (`CloudflarePagesProvider`,
`CloudflareDomainProvisioner`, `CloudflareKVRedirectStore`) have only been
verified via unit tests against a fake `fetch`/fake `wrangler` — not
against a live Cloudflare account — since this development environment has
no Cloudflare credentials.** Their request shapes were independently
checked against Cloudflare's current public API docs, but a real
end-to-end deploy should be smoke-tested against a disposable test
site/domain before pointing this at production sites.

The local stages (1-9, `load-config` through `validate-site`) **are**
covered by automated tests, including the "docx" contentSource end to end —
`pipeline.test.ts` reuses `docx-parser`'s own real fixture
(`packages/docx-parser/test/fixtures/sample.docx`, parsed through this
package's own `.venv`) rather than a fake, so a real docx site is proven to
still generate correctly after every content-library-path phase built
around it. Also covered at the pipeline level (not just each package's own
unit tests): multi-locale generation (distinct per-locale content-library
entries actually get used), a site with zero usable content failing loudly
as a whole rather than silently producing an empty site, and repeated runs
of the same site being byte-for-byte deterministic
(`content-report.json` identical across two back-to-back generations).

`import-sites`, `validate-sites`, and `generate --all`/`--preview` are each
covered by both unit tests (in temp directories, using the same
content-library fixture pattern as `pipeline.test.ts`) and a manual live
CLI smoke test in an isolated scratch repo (dry-run reports, real
create/update/idempotent-no-op/hand-edit-preservation cycles, per-site
batch failure isolation, and `--preview` stopping correctly before any
build/deploy work).
