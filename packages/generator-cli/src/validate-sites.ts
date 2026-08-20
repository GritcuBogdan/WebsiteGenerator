import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { siteConfigInputSchema, siteDataSchema, type SiteConfig } from "schema";
import { composeContent, loadContentLibrary, type LoadedContentLibrary } from "content-library";
import { resolveSiteConfig } from "./resolve-site-config.js";
import { resolveContentSource } from "./resolve-content-source.js";
import { listSiteDirs, filterBySite, type DiscoveredSite } from "./list-sites.js";

export type CheckLevel = "OK" | "WARNING" | "ERROR";

export type SiteCheck = { name: string; level: CheckLevel; detail: string };

export type SiteValidation = {
  slug: string;
  siteDir: string;
  level: CheckLevel;
  checks: SiteCheck[];
  // Set once config.json resolves far enough to know it — undefined for a
  // site that failed before that point (config parse/schema/profile ERROR).
  locales?: string[];
};

export type ValidateSitesResult = {
  sites: SiteValidation[];
  errorCount: number;
  warningCount: number;
  okCount: number;
};

export type ValidateSitesOptions = {
  sitesRoot: string;
  repoRoot?: string;
  site?: string;
  locale?: string;
  // Lets a caller (bulk-generate, sharing one loaded library per §52/§53)
  // pass an already-loaded library in instead of this reading disk again.
  contentLibrary?: LoadedContentLibrary;
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]);
// The two templates whose rendering (casino-v1-rules.ts) hard-requires a
// resolved logo/banner — everything else degrades more gracefully, so a
// missing local images/ is only a WARNING there, not an ERROR.
const TEMPLATES_REQUIRING_IMAGES = new Set(["casino-v1", "casino-v2"]);

function worstLevel(levels: CheckLevel[]): CheckLevel {
  if (levels.includes("ERROR")) return "ERROR";
  if (levels.includes("WARNING")) return "WARNING";
  return "OK";
}

// Deliberately coarse, and says so in its own output: the real per-role
// (logo/hero/slots) image resolution lives in casino-v1-rules.ts's
// unexported fuzzy matcher, which only runs against a *processed* image
// manifest (image-pipeline's processImages output) — exactly what
// validate-sites is specified not to run (architecture doc §05: "no actual
// image processing, composition, or build"). This checks only what's
// determinable without that: does the site have any local source images at
// all, or a profile to fall back on. A site that passes here can still fail
// generate's own validate-site stage on a specific missing role; a site
// flagged ERROR here is one with no source of imagery whatsoever.
function checkImages(siteDir: string, config: SiteConfig): SiteCheck {
  const imagesDir = path.join(siteDir, "images");
  const localImageCount = existsSync(imagesDir)
    ? readdirSync(imagesDir).filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase())).length
    : 0;

  if (localImageCount > 0) {
    return { name: "images", level: "OK", detail: `${localImageCount} image file(s) in images/` };
  }

  if (config.profile) {
    return {
      name: "images",
      level: "WARNING",
      detail: `no local images/ — relying on profile "${config.profile}" for fallback imagery (not verified here; only images/ presence is checked)`,
    };
  }

  const required = TEMPLATES_REQUIRING_IMAGES.has(config.template);
  return {
    name: "images",
    level: required ? "ERROR" : "WARNING",
    detail: "no images/ directory and no profile to fall back on — logo/banner references will point to files that don't exist",
  };
}

async function validateOneSite(
  site: DiscoveredSite,
  profilesDir: string,
  contentLibrary: LoadedContentLibrary,
): Promise<SiteValidation> {
  const checks: SiteCheck[] = [];
  const configPath = path.join(site.siteDir, "config.json");

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (error) {
    checks.push({ name: "config", level: "ERROR", detail: `cannot read/parse config.json: ${(error as Error).message}` });
    return { slug: site.slug, siteDir: site.siteDir, level: "ERROR", checks };
  }

  const parsedConfig = siteConfigInputSchema.safeParse(raw);
  if (!parsedConfig.success) {
    const detail = parsedConfig.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
    checks.push({ name: "config", level: "ERROR", detail: `schema: ${detail}` });
    return { slug: site.slug, siteDir: site.siteDir, level: "ERROR", checks };
  }

  const resolution = resolveSiteConfig(parsedConfig.data, profilesDir);
  if (!resolution.ok) {
    checks.push({ name: "profile", level: "ERROR", detail: resolution.issue });
    return { slug: site.slug, siteDir: site.siteDir, level: "ERROR", checks };
  }
  const config = resolution.config;
  const locales = config.locales.map((l) => l.code);

  checks.push({
    name: "config",
    level: "OK",
    detail: `schema valid, ${config.locales.length} locale(s): ${config.locales.map((l) => l.code).join(", ")}`,
  });
  checks.push({
    name: "profile",
    level: "OK",
    detail: config.profile ? `resolves ("${config.profile}")` : "none referenced",
  });
  checks.push({ name: "domain/affiliateUrl", level: "OK", detail: `${config.domains.join(", ")} -> ${config.affiliateUrl}` });

  const sourceResolution = resolveContentSource(config, site.siteDir);
  if (!sourceResolution.ok) {
    checks.push({ name: "contentSource", level: "ERROR", detail: sourceResolution.issue });
    return { slug: config.slug, siteDir: site.siteDir, level: worstLevel(checks.map((c) => c.level)), checks, locales };
  }
  checks.push({ name: "contentSource", level: "OK", detail: sourceResolution.contentSource });

  if (sourceResolution.contentSource === "docx") {
    for (const locale of config.locales) {
      if (!locale.docx) {
        checks.push({ name: `docx (${locale.code})`, level: "ERROR", detail: `no "docx" filename set in config.json` });
      } else if (!existsSync(path.join(site.siteDir, locale.docx))) {
        checks.push({ name: `docx (${locale.code})`, level: "ERROR", detail: `${locale.docx} not found` });
      } else {
        checks.push({ name: `docx (${locale.code})`, level: "OK", detail: locale.docx });
      }
    }
  } else {
    const dataPath = path.join(site.siteDir, "data.json");
    if (!existsSync(dataPath)) {
      checks.push({ name: "data.json", level: "ERROR", detail: "missing" });
    } else {
      try {
        const siteData = siteDataSchema.parse(JSON.parse(readFileSync(dataPath, "utf-8")));
        checks.push({ name: "data.json", level: "OK", detail: "schema valid" });

        const contentVersion = siteData.contentVersion ?? "v1";
        for (const locale of config.locales) {
          const result = composeContent({
            slug: config.slug,
            locale: locale.code,
            siteData,
            contentVersion,
            library: contentLibrary.entries,
            skeletons: contentLibrary.skeletons,
            pageTypes: contentLibrary.pageTypes,
          });

          if (!result.content) {
            checks.push({
              name: `content (${locale.code})`,
              level: "ERROR",
              detail: `no eligible pages: ${result.issues.join("; ") || "unknown reason"}`,
            });
          } else if (result.issues.length > 0) {
            checks.push({
              name: `content (${locale.code})`,
              level: "WARNING",
              detail: `${result.content.pages.length} page(s); ${result.issues.length} issue(s): ${result.issues.join("; ")}`,
            });
          } else {
            checks.push({ name: `content (${locale.code})`, level: "OK", detail: `${result.content.pages.length} page(s), no issues` });
          }
        }
      } catch (error) {
        checks.push({ name: "data.json", level: "ERROR", detail: (error as Error).message });
      }
    }
  }

  checks.push(checkImages(site.siteDir, config));

  return { slug: config.slug, siteDir: site.siteDir, level: worstLevel(checks.map((c) => c.level)), checks, locales };
}

// No-build readiness report across every site (architecture doc §05/§08,
// rev.2/3): schema + profile resolution + contentSource + content
// eligibility (via composeContent, which never touches disk — see its own
// header comment) + a coarse image-presence check. Never runs
// process-images, composition-for-real (i.e. never writes a
// content-report.json), or astro build — cheap enough to run against all
// 100 sites before generate --all spends real time on any of them.
//
// A site whose config.json can't even be parsed is still included in the
// report (as an ERROR), not silently skipped — matches import-sites' "one
// bad row surfaces, never disappears" posture.
export async function validateSites(options: ValidateSitesOptions): Promise<ValidateSitesResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const profilesDir = path.join(repoRoot, "profiles");

  const discovered = filterBySite(listSiteDirs(options.sitesRoot), options.site);
  const contentLibrary = options.contentLibrary ?? (await loadContentLibrary(path.join(repoRoot, "content-library")));

  const sites: SiteValidation[] = [];
  for (const site of discovered) {
    const validation = await validateOneSite(site, profilesDir, contentLibrary);
    // A site whose config never resolved (`locales` undefined) can't be
    // conclusively excluded by a locale filter — keeping it is safer than
    // silently dropping a site the filter couldn't evaluate.
    if (options.locale && validation.locales && !validation.locales.includes(options.locale)) continue;
    sites.push(validation);
  }

  return {
    sites,
    errorCount: sites.filter((s) => s.level === "ERROR").length,
    warningCount: sites.filter((s) => s.level === "WARNING").length,
    okCount: sites.filter((s) => s.level === "OK").length,
  };
}
