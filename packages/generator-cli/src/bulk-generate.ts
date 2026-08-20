import path from "node:path";
import { loadContentLibrary, type LoadedContentLibrary } from "content-library";
import { generate, type GenerateOptions, type GenerateResult, type StageName } from "./pipeline.js";
import { listSiteDirs, filterBySite, type DiscoveredSite } from "./list-sites.js";
import { siteConfigInputSchema } from "schema";
import { readFileSync } from "node:fs";

export type BulkGenerateSiteOutcome =
  | { slug: string; siteDir: string; status: "success"; result: GenerateResult }
  | { slug: string; siteDir: string; status: "failed"; reason: string };

export type BulkGenerateResult = {
  sites: BulkGenerateSiteOutcome[];
  succeeded: string[];
  failed: { slug: string; reason: string }[];
};

export type BulkGenerateOptions = {
  sitesRoot: string;
  repoRoot?: string;
  dryRun?: boolean;
  // Forwarded to every site's generate() call. Without this (and without
  // dryRun), generate() builds real Cloudflare providers and requires real
  // credentials in .env — batch users who just want a local build (e.g.
  // for local dev/preview, or before credentials exist) need this threaded
  // through, the same way single-site `generate` already exposes it.
  skipDeploy?: boolean;
  site?: string;
  locale?: string;
  limit?: number;
  // Caps how many sites' generate() calls run concurrently — 100 sites ×
  // N locales of astro build + Cloudflare API calls all firing at once
  // would be a self-inflicted DoS against both the local machine and
  // Cloudflare's API (architecture doc §08). A handful in flight at a time
  // keeps this I/O/CPU-bound work moving without that.
  concurrency?: number;
  // Forwarded to every site's generate() call — mainly a debugging escape
  // hatch (e.g. --only=validate-site to dry-check every site without
  // building/deploying any of them), same purpose as generate's own
  // single-site --only.
  only?: StageName[];
  // Invoked as each site finishes, in completion order (not dataset
  // order — sites run concurrently) — lets a caller show live progress
  // without bulkGenerate itself doing any console output, keeping this
  // function a pure, independently-testable data producer (same posture as
  // import-sites.ts).
  onSiteComplete?: (outcome: BulkGenerateSiteOutcome, completed: number, total: number) => void;
};

const DEFAULT_CONCURRENCY = 5;

// A site's declared locales, read the same tolerant way list-sites.ts reads
// slug — best-effort only, used purely for the --locale batch filter; the
// real schema validation happens inside generate() itself.
function siteLocales(siteDir: string): string[] {
  try {
    const raw = JSON.parse(readFileSync(path.join(siteDir, "config.json"), "utf-8"));
    const parsed = siteConfigInputSchema.safeParse(raw);
    return parsed.success ? (parsed.data.locales ?? []).map((l) => l.code) : [];
  } catch {
    return [];
  }
}

// Thin --all loop around the existing, unmodified generate() (architecture
// doc §05: "thin loop... try/catch per site, aggregated pass/fail
// summary"). Loads the content library once and passes it to every site
// (§52/§53) instead of each generate() call re-reading disk. Concurrency-
// capped; one site's failure never stops or corrupts another's run.
//
// `locale` filters which *sites* run (only sites that declare that locale
// at all), not which locales run within a site — generate() always builds
// and deploys a site's full locale set together in one astro build, so
// narrowing that per-call would risk shipping a build missing locales that
// were previously live. Scoping to sites-with-that-locale is the safe
// reading of "optional --locale" as a batch filter, consistent with how
// --site and --limit also just narrow which sites are included.
export async function bulkGenerate(options: BulkGenerateOptions): Promise<BulkGenerateResult> {
  const repoRoot = options.repoRoot ?? process.cwd();

  let discovered: DiscoveredSite[] = filterBySite(listSiteDirs(options.sitesRoot), options.site);
  if (options.locale) {
    discovered = discovered.filter((site) => siteLocales(site.siteDir).includes(options.locale as string));
  }
  if (options.limit !== undefined) discovered = discovered.slice(0, options.limit);

  const contentLibrary: LoadedContentLibrary = await loadContentLibrary(path.join(repoRoot, "content-library"));

  const total = discovered.length;
  const outcomes: BulkGenerateSiteOutcome[] = new Array(total);
  let nextIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= total) return;
      const site = discovered[i];

      const generateOptions: GenerateOptions = {
        repoRoot,
        dryRun: options.dryRun,
        skipDeploy: options.skipDeploy,
        contentLibrary,
        quiet: true,
        only: options.only,
      };

      let outcome: BulkGenerateSiteOutcome;
      try {
        const result = await generate(site.siteDir, generateOptions);
        outcome = { slug: site.slug, siteDir: site.siteDir, status: "success", result };
      } catch (error) {
        outcome = { slug: site.slug, siteDir: site.siteDir, status: "failed", reason: error instanceof Error ? error.message : String(error) };
      }

      outcomes[i] = outcome;
      completed += 1;
      options.onSiteComplete?.(outcome, completed, total);
    }
  }

  const workerCount = Math.max(1, Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, total || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    sites: outcomes,
    succeeded: outcomes.filter((o) => o.status === "success").map((o) => o.slug),
    failed: outcomes.filter((o): o is Extract<BulkGenerateSiteOutcome, { status: "failed" }> => o.status === "failed").map((o) => ({ slug: o.slug, reason: o.reason })),
  };
}
