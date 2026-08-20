# deploy

`DeploymentStrategy` decides which Cloudflare Pages project/branch a site
maps to (today: `PerSiteProjectStrategy`, one project per site slug,
reusing whatever's already in the registry rather than recomputing
defaults). `DeploymentProvider` actually talks to Cloudflare.

## Why deployment shells out to wrangler, but nothing else does

Project creation/lookup, custom domains, Worker routes, and KV writes are
all documented, stable Cloudflare REST API endpoints — implemented as
direct `fetch` calls via `cloudflare-client` throughout this codebase.

**Uploading a built site's files to Cloudflare Pages is not.** Cloudflare's
own docs point exclusively at the `wrangler pages deploy` CLI for direct
(non-git) uploads; the underlying flow it uses (JWT upload tokens, a
specific file-hashing scheme) is Wrangler's internal implementation, not a
published, versioned public API. Reverse-engineering it would mean this
generator's most important step — actually publishing a site — silently
breaks the moment Cloudflare changes something Wrangler itself adapts to
transparently.

So `CloudflarePagesProvider.deployPreview()`/`.promote()` run `npx wrangler
pages deploy` as a subprocess, authenticated non-interactively via the same
`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` env vars `packages/env`
already loads — no Wrangler login/auth state required. This is an
implementation detail behind the `DeploymentProvider` interface; nothing
above this package knows or cares that it happens.

## Preview and promote are both just deployments

Cloudflare Pages has no separate "promote this exact build" operation the
way some platforms do — a deployment is a deployment, distinguished only by
which branch it targets. `deployPreview()` targets a fixed `"preview"`
branch (giving a `*.pages.dev` URL); `promote()` re-runs the same upload
targeting `target.productionBranch`. Cloudflare's content-addressable
storage means unchanged files aren't meaningfully re-uploaded, so this
isn't as wasteful as "deploy twice" sounds.

## Testing

`NoopDeploymentProvider` backs `--dry-run` and tests — no network calls, no
subprocess, deterministic fake URLs. `CloudflarePagesProvider` accepts an
injectable `fetchImpl` and `runWrangler` function so its own tests never
touch a real network or spawn a real process either.
