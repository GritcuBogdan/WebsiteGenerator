import { existsSync } from "node:fs";
import path from "node:path";
import { casinoSchema, type Casino } from "schema";

export type ValidationIssue = { path: string; message: string };

export class SiteValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(`Site failed validation:\n${issues.map((issue) => `  - [${issue.path}] ${issue.message}`).join("\n")}`);
    this.name = "SiteValidationError";
    this.issues = issues;
  }
}

function collectLocalImagePaths(casino: Casino): string[] {
  const paths: string[] = [];
  if (casino.favicon) paths.push(casino.favicon);
  if (casino.navbar.logo) paths.push(casino.navbar.logo);
  for (const logo of casino.footer.logos ?? []) paths.push(logo.src);

  for (const page of casino.pages) {
    if (page.seo.ogImage) paths.push(page.seo.ogImage);
    for (const section of page.sections) {
      if (section.type === "intro" && section.banner) {
        paths.push(section.banner.desktop);
        if (section.banner.mobile) paths.push(section.banner.mobile);
      }
    }
  }

  return paths.filter((imagePath) => imagePath.startsWith("/images/"));
}

export type ValidateSiteOptions = {
  // When provided, checks that every /images/... reference actually
  // exists under this directory. Skipped otherwise (e.g. in isolated unit
  // tests with no real site directory on disk).
  imagesDir?: string;
};

// The hard gate before anything is written or deployed: full schema
// validation plus invariants a Zod schema alone can't express (unique
// slugs, links that actually resolve to a page, images that exist on
// disk). Throws SiteValidationError with every issue found, not just the
// first, so a broken site produces one useful error report.
export function validateSite(casino: Casino, options: ValidateSiteOptions = {}): Casino {
  const issues: ValidationIssue[] = [];

  const schemaResult = casinoSchema.safeParse(casino);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      issues.push({ path: issue.path.join("."), message: issue.message });
    }
  }

  const slugCounts = new Map<string, number>();
  for (const page of casino.pages) {
    slugCounts.set(page.slug, (slugCounts.get(page.slug) ?? 0) + 1);
  }
  for (const [slug, count] of slugCounts) {
    if (count > 1) {
      issues.push({ path: "pages", message: `duplicate page slug "${slug}" (${count} occurrences)` });
    }
  }

  const knownPagePaths = new Set(casino.pages.map((page) => page.seo.canonical).filter(Boolean));
  const checkLink = (scope: string, label: string, href?: string) => {
    if (!href || href.startsWith("#") || href.startsWith("http")) return;
    if (!knownPagePaths.has(href)) {
      issues.push({ path: scope, message: `"${label}" links to "${href}", which has no matching page` });
    }
  };

  for (const item of casino.navbar.menu ?? []) {
    checkLink("navbar.menu", item.name, item.href);
    for (const dropdownItem of item.dropdown ?? []) {
      checkLink("navbar.menu", dropdownItem.name, dropdownItem.href);
    }
  }
  for (const link of casino.footer.links ?? []) {
    checkLink("footer.links", link.label ?? link.name ?? link.title ?? "(unlabeled)", link.href);
  }

  if (options.imagesDir) {
    for (const imagePath of collectLocalImagePaths(casino)) {
      const fullPath = path.join(options.imagesDir, imagePath.replace(/^\/images\//, ""));
      if (!existsSync(fullPath)) {
        issues.push({ path: "images", message: `referenced image "${imagePath}" does not exist (expected ${fullPath})` });
      }
    }
  }

  if (issues.length > 0) {
    throw new SiteValidationError(issues);
  }

  return casino;
}
