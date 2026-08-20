import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type DiscoveredSite = {
  // Best-effort label for progress/error reporting: config.json's own
  // `slug` field when it parses, the directory name otherwise — the same
  // "never block on a label, let the real check report the real error"
  // pattern import-sites.ts's rowSlugLabel uses.
  slug: string;
  dirName: string;
  siteDir: string;
};

// Discovers sites/<dir>/ candidates for --all operations (validate-sites,
// generate --all). Deliberately shallow: doesn't parse/validate config.json
// beyond peeking at its `slug` field for the label — a directory with a
// config.json that fails schema validation is still returned here (so the
// caller's own validation reports the real error) rather than silently
// dropped from the batch.
//
// Excludes:
//   - anything not a directory
//   - directories with no config.json at all (not a site)
//   - directories starting with "_" or "." (e.g. sites/_example — a
//     documented human-facing reference, not a real deployable site)
export function listSiteDirs(sitesRoot: string): DiscoveredSite[] {
  if (!existsSync(sitesRoot)) return [];

  const sites: DiscoveredSite[] = [];
  for (const entry of readdirSync(sitesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.startsWith(".")) continue;

    const siteDir = path.join(sitesRoot, entry.name);
    const configPath = path.join(siteDir, "config.json");
    if (!existsSync(configPath)) continue;

    let slug = entry.name;
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8"));
      if (raw && typeof raw === "object" && typeof (raw as { slug?: unknown }).slug === "string") {
        slug = (raw as { slug: string }).slug;
      }
    } catch {
      // Leave slug = dirName — the caller's own config parse will surface
      // the real error against this site.
    }

    sites.push({ slug, dirName: entry.name, siteDir });
  }

  return sites.sort((a, b) => a.slug.localeCompare(b.slug));
}

// Shared --site=<slug> filter: matches against either the resolved slug or
// the raw directory name, so a site whose config.json is broken (slug fell
// back to dirName) can still be targeted directly for debugging.
export function filterBySite(sites: DiscoveredSite[], site: string | undefined): DiscoveredSite[] {
  if (!site) return sites;
  return sites.filter((s) => s.slug === site || s.dirName === site);
}
