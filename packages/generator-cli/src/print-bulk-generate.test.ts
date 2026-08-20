import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBulkGenerateProgress, formatBulkGenerateSummary } from "./print-bulk-generate.js";
import type { BulkGenerateResult, BulkGenerateSiteOutcome } from "./bulk-generate.js";

function successOutcome(slug: string): BulkGenerateSiteOutcome {
  return {
    slug,
    siteDir: `/sites/${slug}`,
    status: "success",
    result: {
      slug,
      siteDir: `/sites/${slug}`,
      dryRun: true,
      locales: ["en-US"],
      pageCounts: { "en-US": 7 },
      imagesProcessed: 0,
      faviconGenerated: false,
      buildDurationMs: 123,
      distDir: "/sites/x/.generated/dist",
      warnings: [],
      domainsProvisioned: [],
      domainHandoff: [],
      redirectSet: false,
    },
  };
}

test("formats a numbered success line with page count and build time", () => {
  const line = formatBulkGenerateProgress(successOutcome("luckyspin"), 3, 100);
  assert.match(line, /\[003\/100\] luckyspin/);
  assert.match(line, /OK \(7 page\(s\), 123ms\)/);
});

test("formats a numbered failure line with the reason", () => {
  const outcome: BulkGenerateSiteOutcome = { slug: "broken", siteDir: "/sites/broken", status: "failed", reason: "missing config.json" };
  const line = formatBulkGenerateProgress(outcome, 4, 100);
  assert.match(line, /\[004\/100\] broken/);
  assert.match(line, /FAILED — missing config\.json/);
});

test("summary reports succeeded/failed counts and lists failures", () => {
  const result: BulkGenerateResult = {
    sites: [successOutcome("a"), { slug: "b", siteDir: "/sites/b", status: "failed", reason: "boom" }],
    succeeded: ["a"],
    failed: [{ slug: "b", reason: "boom" }],
  };
  const output = formatBulkGenerateSummary(result);
  assert.match(output, /2 site\(s\): 1 succeeded, 1 failed/);
  assert.match(output, /- b: boom/);
});

test("summary omits the failed section when nothing failed", () => {
  const result: BulkGenerateResult = { sites: [successOutcome("a")], succeeded: ["a"], failed: [] };
  const output = formatBulkGenerateSummary(result);
  assert.doesNotMatch(output, /failed:/);
});
