# registry

The durable "what actually exists" layer, distinct from
`sites/<slug>/config.json` (which only describes *desired* state). Answers
questions like "does this site already have a Cloudflare Pages project"
without re-deriving them from the Cloudflare API on every run — and is
what makes the remote-resource pipeline stages in Phase 8 idempotent:
they check here before creating anything.

```ts
import { JsonFileSiteRegistry } from "registry";

const registry = new JsonFileSiteRegistry("registry/sites.json");

const existing = registry.get("golisimo");
registry.upsert({
  slug: "golisimo",
  domains: ["golisimogreece.com"],
  templateId: "casino-v1",
  templateVersion: "1.0.0",
  cloudflare: { projectName: "golisimo", branch: "production", workerRouteIds: [] },
  deployments: existing?.deployments ?? [],
});

registry.recordDeployment("golisimo", {
  id: "dep-1",
  environment: "production",
  url: "https://golisimogreece.com",
  timestamp: new Date().toISOString(),
  status: "success",
});
```

## `upsert` replaces, it does not merge

`upsert(entry)` replaces the whole entry for `entry.slug` — it does **not**
merge with whatever was already registered. If you only know about part of
a site's state (e.g. a stage that just resolved a Cloudflare project name
and has no idea what Worker routes a different stage already recorded),
call `get()` first and build the complete new entry yourself:

```ts
const existing = registry.get(slug);
registry.upsert({
  ...existing,
  cloudflare: { ...existing.cloudflare, workerRouteIds: [...existing.cloudflare.workerRouteIds, newRouteId] },
});
```

`recordDeployment` is the one exception — it's always additive (appends to
`deployments`, bumps `lastDeployedAt`), which is why it's a separate method
instead of going through `upsert`.

## Storage

The default implementation, `JsonFileSiteRegistry`, is a single JSON file
(`registry/sites.json` at the repo root, in real usage) — plain,
human-diffable in PRs, synchronous (small, infrequent file I/O, not a hot
path). Every mutation persists to disk immediately, not batched and not
only at the end of a run, so a crashed mid-pipeline run doesn't lose track
of what an earlier stage already created.

Pipeline code should only ever depend on the `SiteRegistry` interface, not
on `JsonFileSiteRegistry` directly — swapping the storage mechanism later
shouldn't require touching pipeline code.
