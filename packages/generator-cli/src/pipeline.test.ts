import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "./pipeline.js";
import { PipelineError } from "./pipeline-error.js";

// The docx-parser package's own fixture (already exercised in isolation by
// packages/docx-parser/src/parse-docx.test.ts) — reused here to prove the
// "docx" contentSource still produces a real site end-to-end through this
// package's generate(), not just that the parser itself still works.
// resolvePythonPath (docx-parser) resolves its own .venv relative to that
// package's own location regardless of where this test file lives, so no
// extra setup is needed beyond what parse-docx.test.ts already requires.
const SAMPLE_DOCX_FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "docx-parser",
  "test",
  "fixtures",
  "sample.docx",
);

// Exercises the real generate() pipeline end-to-end for the "library"
// contentSource, through validate-site (stopping short of build/deploy —
// astro build and Cloudflare are out of scope for this unit test; the
// point here is proving the routing/convergence the architecture doc's
// §00 central decision depends on, not re-testing astro itself).
const STAGES_THROUGH_VALIDATION = [
  "load-config",
  "parse-docx",
  "apply-overrides",
  "process-images",
  "assemble-site",
  "validate-site",
] as const;

async function writeFileDeep(fullPath: string, content: string): Promise<void> {
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

async function scaffoldRepoRoot(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "pipeline-test-repo-"));

  await writeFileDeep(
    path.join(repoRoot, "content-library", "en-US", "intro", "intro-001.md"),
    ["---", "id: intro-001", "---", "{{BRAND_NAME}} welcomes you."].join("\n"),
  );
  await writeFileDeep(
    path.join(repoRoot, "content-library", "en-US", "faq", "faq-001.md"),
    ["---", "id: faq-001", "component: faq", "question: Is this safe?", "---", "Yes, always."].join("\n"),
  );
  await writeFileDeep(
    path.join(repoRoot, "content-library", "skeletons", "minimal.json"),
    JSON.stringify({ id: "minimal", sections: ["intro", "faq"] }),
  );
  await writeFileDeep(
    path.join(repoRoot, "content-library", "page-types.json"),
    JSON.stringify([
      { id: "index", defaultSkeleton: "minimal", allowedComponents: ["intro", "faq"] },
      { id: "review", defaultSkeleton: "minimal", allowedComponents: ["intro", "faq"] },
    ]),
  );

  return repoRoot;
}

function configJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    slug: "testcasino",
    domains: ["testcasino.example"],
    affiliateUrl: "https://affiliate.example/track?id=testcasino",
    template: "casino-v1",
    locales: [{ code: "en-US", default: true }],
    theme: { primary: "#111111", secondary: "#222222" },
    navbar: {},
    banner: { desktop: "/images/testcasino/banner.png" },
    contentSource: "library",
    ...overrides,
  });
}

test("composes a library site through validate-site with no docx at all", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson());
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({ brandName: "TestCasino" }));

  const result = await generate(siteDir, { repoRoot, skipDeploy: true, only: [...STAGES_THROUGH_VALIDATION] });

  assert.deepEqual(result.locales, ["en-US"]);
  // Every DEFAULT_PAGE_SLUGS page composes: brandName is the only fact
  // intro needs, and it's present. 11, not 7 — includes no-deposit-bonus/
  // free-spins/promo-code/registration, which this fixture's page-types.json
  // has no entries for, so they fall back to the generic single-"intro"
  // skeleton (still eligible, since intro needs only brandName).
  assert.equal(result.pageCounts["en-US"], 11);

  await rm(repoRoot, { recursive: true, force: true });
});

test("writes content-report.json describing what was composed", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson());
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({ brandName: "TestCasino" }));

  await generate(siteDir, { repoRoot, skipDeploy: true, only: [...STAGES_THROUGH_VALIDATION] });

  const report = JSON.parse(await readFile(path.join(siteDir, ".generated", "content-report.json"), "utf-8"));
  assert.equal(report.slug, "testcasino");
  assert.equal(report.contentVersion, "v1");
  assert.ok(report.locales["en-US"]);
  const indexPage = report.locales["en-US"].pages.find((p: { slug: string }) => p.slug === "index");
  assert.ok(indexPage);
  assert.ok(indexPage.wordCount > 0);
  assert.match(indexPage.contentHash, /^[0-9a-f]{64}$/);

  await rm(repoRoot, { recursive: true, force: true });
});

test("isolates per-page composition failures — pages with no eligible content are skipped, not fatal", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson());
  // No brandName at all: intro's {{BRAND_NAME}} placeholder can never
  // resolve. index/review still compose (their "minimal" skeleton also
  // has "faq", which needs no facts); every other default page only has
  // the generic single-"intro" fallback (no page type defined for them
  // in this fixture) and so drops entirely.
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({}));

  const result = await generate(siteDir, { repoRoot, skipDeploy: true, only: [...STAGES_THROUGH_VALIDATION] });

  assert.equal(result.pageCounts["en-US"], 2);
  assert.ok(result.warnings.some((w) => w.includes('page "bonus"')));
  assert.ok(result.warnings.some((w) => w.includes('page "withdrawal"')));

  await rm(repoRoot, { recursive: true, force: true });
});

test("a minimal config.json (no template/theme/navbar/banner) inherits branding from a profile, end to end", async () => {
  const repoRoot = await scaffoldRepoRoot();
  await writeFileDeep(
    path.join(repoRoot, "profiles", "dark-blue-casino.json"),
    JSON.stringify({
      id: "dark-blue-casino",
      template: "casino-v1",
      theme: { primary: "#2563EB", secondary: "#0F2747" },
      navbar: { showBrandName: true },
      banner: { desktop: "/images/_profiles/dark-blue-casino/banner.png" },
    }),
  );

  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(
    path.join(siteDir, "config.json"),
    JSON.stringify({
      slug: "testcasino",
      domains: ["testcasino.example"],
      affiliateUrl: "https://affiliate.example/track?id=testcasino",
      locales: [{ code: "en-US", default: true }],
      profile: "dark-blue-casino",
      contentSource: "library",
    }),
  );
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({ brandName: "TestCasino" }));

  const result = await generate(siteDir, { repoRoot, skipDeploy: true, only: [...STAGES_THROUGH_VALIDATION] });

  assert.equal(result.pageCounts["en-US"], 11); // see the "no docx at all" test above for why 11, not 7

  await rm(repoRoot, { recursive: true, force: true });
});

test("an explicit contentSource: docx with no docx filename set fails loudly at parse-docx", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson({ contentSource: "docx" }));

  await assert.rejects(
    generate(siteDir, { repoRoot, skipDeploy: true, only: [...STAGES_THROUGH_VALIDATION] }),
    (error: unknown) => {
      assert.ok(error instanceof PipelineError);
      assert.equal(error.stage, "parse-docx");
      assert.match(error.message, /no "docx" filename set/);
      return true;
    },
  );

  await rm(repoRoot, { recursive: true, force: true });
});

test("an unresolvable contentSource (neither docx nor data.json, no explicit field) fails loudly", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  const { contentSource: _drop, ...configWithoutContentSource } = JSON.parse(configJson());
  await writeFileDeep(path.join(siteDir, "config.json"), JSON.stringify(configWithoutContentSource));

  await assert.rejects(
    generate(siteDir, { repoRoot, skipDeploy: true, only: [...STAGES_THROUGH_VALIDATION] }),
    (error: unknown) => {
      assert.ok(error instanceof PipelineError);
      assert.equal(error.stage, "parse-docx");
      assert.match(error.message, /Cannot determine contentSource/);
      return true;
    },
  );

  await rm(repoRoot, { recursive: true, force: true });
});

// --- Phase 10 regression pass ------------------------------------------
// The tests above prove the "library" contentSource and its failure modes.
// These close the remaining gaps the phased plan's own checklist calls
// out: the pre-existing "docx" path still works unmodified after every
// content-library addition layered on top, multi-locale generation works
// end to end, missing *required* data fails the whole site (not just one
// page), and the pipeline is deterministic across repeated runs — not only
// at composeContent's own unit level (content-library/compose-content.test.ts
// already covers that directly), but through the full generate() call.

test("REGRESSION: an existing docx site still generates end to end, unaffected by the content-library path", async () => {
  const repoRoot = await scaffoldRepoRoot(); // content-library present but irrelevant to this test
  const siteDir = path.join(repoRoot, "sites", "docxcasino");
  await writeFileDeep(
    path.join(siteDir, "config.json"),
    configJson({ slug: "docxcasino", contentSource: "docx", locales: [{ code: "en", docx: "casino.en.docx", default: true }] }),
  );
  await mkdir(siteDir, { recursive: true });
  await copyFile(SAMPLE_DOCX_FIXTURE, path.join(siteDir, "casino.en.docx"));

  const result = await generate(siteDir, { repoRoot, skipDeploy: true, only: [...STAGES_THROUGH_VALIDATION] });

  // Same shape parse-docx.test.ts already proves the parser itself
  // produces — the point here is that assemble-site/validate-site (and
  // everything the content-library phases added around parse-docx) still
  // accept it unmodified.
  assert.equal(result.pageCounts.en, 2);
  assert.ok(!result.warnings.some((w) => w.includes("content library")));

  await rm(repoRoot, { recursive: true, force: true });
});

test("REGRESSION: multi-locale generation composes locale-appropriate content for every configured locale", async () => {
  const repoRoot = await scaffoldRepoRoot();
  // A second locale with its own distinct library entry — proves
  // composeContent is genuinely locale-scoped end to end, not just
  // reusing en-US content under a different label.
  await writeFileDeep(
    path.join(repoRoot, "content-library", "de-DE", "intro", "intro-001.md"),
    ["---", "id: intro-001", "---", "{{BRAND_NAME}} begrüßt Sie."].join("\n"),
  );
  await writeFileDeep(
    path.join(repoRoot, "content-library", "de-DE", "faq", "faq-001.md"),
    ["---", "id: faq-001", "component: faq", "question: Ist das sicher?", "---", "Ja, immer."].join("\n"),
  );

  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(
    path.join(siteDir, "config.json"),
    configJson({ locales: [{ code: "en-US", default: true }, { code: "de-DE" }] }),
  );
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({ brandName: "TestCasino" }));

  const result = await generate(siteDir, { repoRoot, skipDeploy: true, only: [...STAGES_THROUGH_VALIDATION] });

  assert.deepEqual(result.locales.sort(), ["de-DE", "en-US"]);
  assert.equal(result.pageCounts["en-US"], 11); // see the "no docx at all" test above for why 11, not 7
  assert.equal(result.pageCounts["de-DE"], 11);

  const report = JSON.parse(await readFile(path.join(siteDir, ".generated", "content-report.json"), "utf-8"));
  assert.ok(report.locales["en-US"]);
  assert.ok(report.locales["de-DE"]);

  await rm(repoRoot, { recursive: true, force: true });
});

test("REGRESSION: a site with no usable content at all fails the whole site, not just individual pages", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson());
  // An explicit empty page list — nothing to compose, nothing to fall
  // back to (contrast with the "isolates per-page composition failures"
  // test above, where *some* pages still succeed).
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({ pages: [] }));

  await assert.rejects(
    generate(siteDir, { repoRoot, skipDeploy: true, only: [...STAGES_THROUGH_VALIDATION] }),
    (error: unknown) => {
      assert.ok(error instanceof PipelineError);
      assert.equal(error.stage, "parse-docx");
      assert.match(error.message, /produced no pages/);
      return true;
    },
  );

  await rm(repoRoot, { recursive: true, force: true });
});

test("REGRESSION: generating the same site twice is deterministic end to end (same pages, same content report)", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson());
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({ brandName: "TestCasino" }));

  const first = await generate(siteDir, { repoRoot, skipDeploy: true, only: [...STAGES_THROUGH_VALIDATION] });
  const firstReport = await readFile(path.join(siteDir, ".generated", "content-report.json"), "utf-8");

  const second = await generate(siteDir, { repoRoot, skipDeploy: true, only: [...STAGES_THROUGH_VALIDATION] });
  const secondReport = await readFile(path.join(siteDir, ".generated", "content-report.json"), "utf-8");

  assert.deepEqual(first.pageCounts, second.pageCounts);
  assert.equal(firstReport, secondReport); // same skeleton/variant/FAQ picks, same seed each run

  await rm(repoRoot, { recursive: true, force: true });
});
