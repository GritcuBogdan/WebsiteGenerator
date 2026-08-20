import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSummary } from "./print-summary.js";
import type { GenerateResult } from "./pipeline.js";

function sampleResult(overrides: Partial<GenerateResult> = {}): GenerateResult {
  return {
    slug: "demo-casino",
    siteDir: "/repo/sites/demo-casino",
    dryRun: false,
    locales: ["en", "el"],
    pageCounts: { en: 3, el: 3 },
    imagesProcessed: 5,
    faviconGenerated: true,
    buildDurationMs: 1234,
    distDir: "/repo/sites/demo-casino/.generated/dist",
    warnings: [],
    domainsProvisioned: [],
    domainHandoff: [],
    redirectSet: false,
    ...overrides,
  };
}

test("includes the site slug, locales, and per-locale page counts", () => {
  const output = formatSummary(sampleResult());
  assert.match(output, /Site:\s+demo-casino/);
  assert.match(output, /Locales:\s+en, el/);
  assert.match(output, /en: 3 page\(s\)/);
  assert.match(output, /el: 3 page\(s\)/);
});

test("notes dry-run used Noop providers only when dryRun is true", () => {
  assert.doesNotMatch(formatSummary(sampleResult({ dryRun: false })), /Noop providers/);
  assert.match(formatSummary(sampleResult({ dryRun: true })), /Noop providers/);
});

test("lists warnings only when there are any", () => {
  assert.doesNotMatch(formatSummary(sampleResult({ warnings: [] })), /Warnings:/);
  const output = formatSummary(sampleResult({ warnings: ["no images/ directory found"] }));
  assert.match(output, /Warnings:/);
  assert.match(output, /no images\/ directory found/);
});

test("shows preview/production URLs and their verify results only when present", () => {
  const withoutDeploy = formatSummary(sampleResult());
  assert.doesNotMatch(withoutDeploy, /Preview:/);
  assert.doesNotMatch(withoutDeploy, /Production:/);

  const withDeploy = formatSummary(
    sampleResult({
      previewUrl: "https://preview.demo-casino.pages.dev",
      verifyPreview: { ok: true, status: 200 },
      productionUrl: "https://demo-casino.pages.dev",
      verifyProduction: { ok: false, error: "timeout" },
      domainsProvisioned: ["demo-casino.example"],
      redirectSet: true,
      verifyRedirect: { ok: true, status: 302 },
    }),
  );
  assert.match(withDeploy, /Preview:\s+https:\/\/preview\.demo-casino\.pages\.dev/);
  assert.match(withDeploy, /Verify preview:\s+OK \(200\)/);
  assert.match(withDeploy, /Domains attached:\s+demo-casino\.example/);
  assert.match(withDeploy, /Production:\s+https:\/\/demo-casino\.pages\.dev/);
  assert.match(withDeploy, /Verify production:\s+FAILED \(timeout\)/);
  assert.match(withDeploy, /Redirect set:\s+yes/);
  assert.match(withDeploy, /Verify redirect:\s+OK \(302\)/);
});

test("shows domain handoff outcomes only when present", () => {
  assert.doesNotMatch(formatSummary(sampleResult()), /Domain handoff:/);

  const output = formatSummary(
    sampleResult({
      domainHandoff: [
        { domain: "demo-casino.example", state: "CLOUDFLARE_AUTHORITY_CONFIRMED", cloudflareZoneId: "zone1" },
      ],
    }),
  );
  assert.match(output, /Domain handoff:/);
  assert.match(output, /demo-casino\.example: CLOUDFLARE_AUTHORITY_CONFIRMED \(zone zone1\)/);
});
