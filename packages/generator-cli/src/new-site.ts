import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SLUG_PATTERN = /^[a-z0-9-]+$/;

// Scaffolds sites/<slug>/{config.json, data.json, images/, README.md} — a
// schema-valid starting point (placeholder domain/affiliateUrl the site
// owner must still fill in), not a copy of sites/_example (which exists as
// a documented reference for humans, not a template this reads from).
//
// Defaults to the "library" contentSource (content-library/ + data.json,
// no manual writing) rather than the older docx flow — this is the path
// README.md documents as recommended, so a fresh scaffold should be able
// to run `npm run generate` immediately rather than needing a template
// swap first. data.json is scaffolded alongside config.json (not left for
// the site owner to discover) because a "library" site's parse-docx stage
// requires the file to exist at all, and brandName specifically: it seeds
// content-library's {{BRAND_NAME}} placeholder (placeholders.ts), which
// most components reference, so its absence would silently disqualify
// nearly every entry rather than merely omitting one fact.
export function newSite(slug: string, sitesRoot: string): string {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid slug "${slug}" — use lowercase letters, digits, and hyphens only.`);
  }

  const siteDir = path.join(sitesRoot, slug);
  if (existsSync(siteDir)) {
    throw new Error(`${siteDir} already exists.`);
  }

  mkdirSync(path.join(siteDir, "images"), { recursive: true });

  const config = {
    slug,
    domains: [`${slug}.example.com`],
    affiliateUrl: "https://affiliate.example/track?id=CHANGE_ME",
    template: "casino-v1",
    locales: [{ code: "en-US", default: true, label: "English" }],
    contentSource: "library",
    theme: {
      primary: "#2563EB",
      secondary: "#0F2747",
    },
    navbar: {
      logo: `/images/${slug}/logo.png`,
      brandName: slug,
    },
    banner: {
      desktop: `/images/${slug}/banner.png`,
    },
    stickyBanner: { headline: "Welcome bonus" },
  };

  writeFileSync(path.join(siteDir, "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf-8");

  // Deliberately minimal: only brandName, which is load-bearing (see the
  // header comment above) — never a fabricated welcomeBonus/paymentMethods/
  // etc. Every other data.json field is optional, and content-library's
  // "never invent a fact" rule (site-data.ts) means a page whose content
  // needs a fact this doesn't supply is simply skipped rather than shown
  // with made-up numbers, so this is safe to generate against as-is.
  const data = { brandName: slug };
  writeFileSync(path.join(siteDir, "data.json"), `${JSON.stringify(data, null, 2)}\n`, "utf-8");

  const readme = [
    `# ${slug}`,
    "",
    "1. Edit data.json with this site's real facts — brandName is already set",
    "   to the slug as a placeholder; replace it, then add welcomeBonus,",
    "   paymentMethods, geo, etc. as you have them (see the repo root",
    "   README.md's data.json section for the full field list).",
    "2. Put raw images in images/ — a top-level logo.png (or .jpg/.jpeg/.webp) becomes",
    "   the source for an automatically generated favicon.",
    "3. Fill in the real domain(s) and affiliateUrl in config.json.",
    "4. From the repo root: npm run generate -- sites/" + slug,
    "",
    "Page copy composes automatically from content-library/ for whichever",
    "locales config.json's `locales` lists — each must be one the library",
    "covers: de-DE, en-US, fi-FI, nl-NL, sv-SE.",
    "",
    "To use a hand-written .docx brief instead, set contentSource to \"docx\"",
    "in config.json and add a docx: \"casino.<locale>.docx\" filename per locale.",
    "To fix content a docx's parser got wrong, add overrides.<locale>.json",
    "instead of hand-editing generated output (see packages/overrides/README.md) —",
    "generated content is fully disposable and gets overwritten on every run.",
    "",
  ].join("\n");
  writeFileSync(path.join(siteDir, "README.md"), readme, "utf-8");

  return siteDir;
}
