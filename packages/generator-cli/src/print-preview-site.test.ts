import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPreviewSite } from "./print-preview-site.js";
import type { PreviewSiteResult } from "./preview-site.js";
import type { DomainHandoffResult } from "domain-provisioning";

function baseGenerateResult() {
  return {
    slug: "luckyspin",
    siteDir: "/sites/luckyspin",
    dryRun: false,
    locales: ["en-US"],
    pageCounts: { "en-US": 1 },
    imagesProcessed: 0,
    faviconGenerated: false,
    buildDurationMs: 0,
    distDir: "/sites/luckyspin/.generated/dist",
    warnings: [] as string[],
    domainsProvisioned: [] as string[],
    domainHandoff: [] as DomainHandoffResult[],
    redirectSet: false,
  };
}

test("shows resolved profile, skeleton, components, and word counts from the content report", () => {
  const preview: PreviewSiteResult = {
    generate: baseGenerateResult(),
    profile: "dark-blue-casino",
    contentReport: {
      slug: "luckyspin",
      contentVersion: "v1",
      locales: {
        "en-US": {
          pages: [{ slug: "index", skeleton: "minimal", components: { intro: ["intro-001"], faq: ["faq-001", "faq-002"] }, wordCount: 42, contentHash: "abc" }],
          issues: [],
        },
      },
    },
  };

  const output = formatPreviewSite(preview);
  assert.match(output, /Profile:\s+dark-blue-casino/);
  assert.match(output, /Content version:\s+v1/);
  assert.match(output, /index: skeleton "minimal", 42 word\(s\)/);
  assert.match(output, /intro=intro-001/);
  assert.match(output, /faq=faq-001\+faq-002/);
  assert.match(output, /preview only — no build, no deploy/);
});

test("falls back to page counts when there's no content report (docx site)", () => {
  const preview: PreviewSiteResult = { generate: baseGenerateResult() };
  const output = formatPreviewSite(preview);
  assert.match(output, /Profile:\s+\(none\)/);
  assert.match(output, /Locales:\s+en-US/);
  assert.match(output, /en-US: 1 page\(s\)/);
});

test("surfaces generate's own warnings", () => {
  const result = baseGenerateResult();
  result.warnings.push("No images/ directory — skipping image processing.");
  const output = formatPreviewSite({ generate: result });
  assert.match(output, /Warnings:/);
  assert.match(output, /No images\/ directory/);
});
