import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { deploymentRecordSchema, siteRegistryEntrySchema, type DeploymentRecord, type SiteRegistryEntry } from "./registry-entry.js";
import type { SiteRegistry } from "./site-registry.js";

const registryFileSchema = z.object({
  sites: z.array(siteRegistryEntrySchema),
});

// Default SiteRegistry implementation: a single JSON file
// (registry/sites.json at the repo root, in real usage), plain and
// human-diffable in PRs. Deliberately synchronous — this is small,
// infrequent file I/O (loaded once per pipeline run, mutated a handful of
// times), not a hot path, so plain fs sync calls are simpler than adding
// async ceremony that buys nothing here.
//
// Every mutation persists to disk immediately (not batched, not only at
// the end of a run): if the pipeline crashes mid-run after a Cloudflare
// project was created but before the run finished, the next run's re-read
// of this file still knows that project exists — this is what makes
// remote-resource pipeline stages idempotent, not something bolted on
// separately.
export class JsonFileSiteRegistry implements SiteRegistry {
  #filePath: string;
  #entries: Map<string, SiteRegistryEntry>;
  // Slugs this instance has itself upserted/recordDeployment'd. bulkGenerate
  // runs several sites' generate() calls concurrently in one process, each
  // constructing its own JsonFileSiteRegistry from whatever the file looked
  // like at that moment — without this, #persist() blindly overwrote the
  // file with this instance's full (possibly stale) snapshot, silently
  // dropping other sites' concurrently-written entries (observed: 3 of 9
  // sites' deployment records vanished from a single --all run even though
  // every site's actual Cloudflare/Hostinger deploy succeeded). #persist()
  // re-reads the file and only overlays the slugs actually touched here.
  #touched: Set<string>;

  constructor(filePath: string) {
    this.#filePath = filePath;
    this.#entries = new Map();
    this.#touched = new Set();

    for (const entry of this.#readFromDisk()) {
      this.#entries.set(entry.slug, entry);
    }
  }

  #readFromDisk(): SiteRegistryEntry[] {
    if (!existsSync(this.#filePath)) return [];
    const raw = JSON.parse(readFileSync(this.#filePath, "utf-8"));
    return registryFileSchema.parse(raw).sites;
  }

  get(slug: string): SiteRegistryEntry | undefined {
    return this.#entries.get(slug);
  }

  list(): SiteRegistryEntry[] {
    return [...this.#entries.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  }

  upsert(entry: SiteRegistryEntry): void {
    const validated = siteRegistryEntrySchema.parse(entry);
    this.#entries.set(validated.slug, validated);
    this.#touched.add(validated.slug);
    this.#persist();
  }

  recordDeployment(slug: string, deployment: DeploymentRecord): void {
    const entry = this.#entries.get(slug);
    if (!entry) {
      throw new Error(`Cannot record a deployment for unknown site "${slug}" — call upsert() first.`);
    }

    const validatedDeployment = deploymentRecordSchema.parse(deployment);
    const updated: SiteRegistryEntry = {
      ...entry,
      deployments: [...entry.deployments, validatedDeployment],
      lastDeployedAt: validatedDeployment.timestamp,
    };
    this.#entries.set(slug, updated);
    this.#touched.add(slug);
    this.#persist();
  }

  // Re-reads the file immediately before writing and overlays only this
  // instance's own touched slugs on top of that fresh read, rather than
  // writing this.#entries wholesale — see #touched's comment. The read and
  // write below are both synchronous with no `await` between them, so
  // nothing else in this process can interleave a write in that window.
  #persist(): void {
    const merged = new Map<string, SiteRegistryEntry>();
    for (const entry of this.#readFromDisk()) merged.set(entry.slug, entry);
    for (const slug of this.#touched) {
      const entry = this.#entries.get(slug);
      if (entry) merged.set(slug, entry);
    }
    this.#entries = merged;

    mkdirSync(path.dirname(this.#filePath), { recursive: true });
    const body = { sites: this.list() };
    writeFileSync(this.#filePath, `${JSON.stringify(body, null, 2)}\n`, "utf-8");
  }
}
