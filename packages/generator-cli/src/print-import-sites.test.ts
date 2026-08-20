import { test } from "node:test";
import assert from "node:assert/strict";
import { formatImportSites, formatImportSitesProgress, formatImportSitesDryRun } from "./print-import-sites.js";
import type { ImportSitesResult } from "./import-sites.js";

test("summarizes counts and lists slugs for each category", () => {
  const output = formatImportSites({
    rows: [],
    created: ["luckyspin", "goldrush"],
    updated: ["starbet"],
    unchanged: [],
    failed: [{ slug: "badsite", reason: "affiliateUrl: Invalid url" }],
  });
  assert.match(output, /Created: 2, Updated: 1, Unchanged: 0, Failed: 1/);
  assert.match(output, /created: luckyspin, goldrush/);
  assert.match(output, /updated: starbet/);
  assert.match(output, /badsite: affiliateUrl: Invalid url/);
});

test("omits empty sections", () => {
  const output = formatImportSites({ rows: [], created: ["luckyspin"], updated: [], unchanged: [], failed: [] });
  assert.doesNotMatch(output, /updated:/);
  assert.doesNotMatch(output, /unchanged:/);
  assert.doesNotMatch(output, /failed:/);
});

test("includes an unchanged section when there are unchanged sites", () => {
  const output = formatImportSites({ rows: [], created: [], updated: [], unchanged: ["steady"], failed: [] });
  assert.match(output, /Unchanged: 1/);
  assert.match(output, /unchanged: steady/);
});

const sampleResult: ImportSitesResult = {
  rows: [
    { slug: "luckyspin", outcome: "created", files: { config: "created", data: "created" } },
    { slug: "goldrush", outcome: "updated", files: { config: "unchanged", data: "updated" } },
    { slug: "steady", outcome: "unchanged", files: { config: "unchanged", data: "unchanged" } },
    { slug: "badsite", outcome: "failed", reason: "affiliateUrl: Invalid url" },
  ],
  created: ["luckyspin"],
  updated: ["goldrush"],
  unchanged: ["steady"],
  failed: [{ slug: "badsite", reason: "affiliateUrl: Invalid url" }],
};

test("formatImportSitesProgress numbers each row against the batch total, in dataset order", () => {
  const output = formatImportSitesProgress(sampleResult);
  assert.match(output, /\[1\/4\] luckyspin .* CREATE/);
  assert.match(output, /\[2\/4\] goldrush .* UPDATE/);
  assert.match(output, /\[3\/4\] steady .* UNCHANGED/);
  assert.match(output, /\[4\/4\] badsite .* ERROR — affiliateUrl: Invalid url/);
});

test("formatImportSitesProgress appends the summary after the numbered rows", () => {
  const output = formatImportSitesProgress(sampleResult);
  assert.match(output, /Created: 1, Updated: 1, Unchanged: 1, Failed: 1/);
});

test("formatImportSitesDryRun groups by would-create/would-update/would-reject", () => {
  const output = formatImportSitesDryRun(sampleResult);
  assert.match(output, /Would create:\n\s+luckyspin\//);
  assert.match(output, /Would update:\n\s+goldrush\/data\.json/);
  assert.doesNotMatch(output, /goldrush\/config\.json/); // config didn't change on this row
  assert.match(output, /Would reject:\n\s+badsite\n\s+- affiliateUrl: Invalid url/);
  assert.doesNotMatch(output, /steady/); // unchanged sites aren't listed in a dry-run report
});

test("formatImportSitesDryRun reports nothing-to-do when every row is unchanged", () => {
  const output = formatImportSitesDryRun({
    rows: [{ slug: "steady", outcome: "unchanged", files: { config: "unchanged", data: "unchanged" } }],
    created: [],
    updated: [],
    unchanged: ["steady"],
    failed: [],
  });
  assert.match(output, /Nothing to do/);
});
