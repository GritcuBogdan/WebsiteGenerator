import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SLUG_PATTERN = /^[a-z0-9-]+$/;

// Scaffolds sites/<slug>/{config.json, images/, README.md} — a schema-valid
// starting point (placeholder domain/affiliateUrl the site owner must
// still fill in), not a copy of sites/_example (which exists as a
// documented reference for humans, not a template this reads from).
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
    locales: [{ code: "en", docx: "casino.en.docx", default: true }],
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
  };

  writeFileSync(path.join(siteDir, "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf-8");

  const readme = [
    `# ${slug}`,
    "",
    "1. Put casino.<locale>.docx here for each locale listed in config.json's `locales`.",
    "2. Put raw images in images/ — a top-level logo.png (or .jpg/.jpeg/.webp) becomes",
    "   the source for an automatically generated favicon.",
    "3. Fill in the real domain(s) and affiliateUrl in config.json.",
    "4. From the repo root: npm run generate -- sites/" + slug,
    "",
    "To fix content the docx parser got wrong, add overrides.<locale>.json",
    "instead of hand-editing generated output (see packages/overrides/README.md) —",
    "generated content is fully disposable and gets overwritten on every run.",
    "",
  ].join("\n");
  writeFileSync(path.join(siteDir, "README.md"), readme, "utf-8");

  return siteDir;
}
