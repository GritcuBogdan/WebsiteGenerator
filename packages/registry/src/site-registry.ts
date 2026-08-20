import type { DeploymentRecord, SiteRegistryEntry } from "./registry-entry.js";

// sites/<slug>/config.json describes desired state. This is actual state:
// does this site already have a Cloudflare Pages project, which one, what
// has it deployed. Pipeline code (Phase 8's deploy/domain-provisioning/
// redirects) depends only on this interface, never on a concrete storage
// mechanism — swapping JsonFileSiteRegistry for a real datastore later
// doesn't touch pipeline code.
export interface SiteRegistry {
  get(slug: string): SiteRegistryEntry | undefined;
  list(): SiteRegistryEntry[];

  // Replaces the entry for entry.slug wholesale (update-in-place, never
  // appends a duplicate) — this does NOT merge with whatever was already
  // there. A caller that only knows about part of a site's state (e.g. a
  // stage that only resolved a Cloudflare project name) must read the
  // existing entry via get() first and build the full new entry itself;
  // the registry has no way to guess which fields the caller intended to
  // leave untouched versus intentionally clear.
  upsert(entry: SiteRegistryEntry): void;

  // Appends to an existing entry's deployment history and bumps
  // lastDeployedAt — the one piece of state that's always additive, so it
  // gets its own method instead of going through upsert's replace-
  // wholesale semantics. Throws if the site hasn't been registered yet
  // (call upsert() first).
  recordDeployment(slug: string, deployment: DeploymentRecord): void;
}
