import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bulkGenerate } from "./bulk-generate.js";

// Same reasoning as pipeline.test.ts: stop before "build"/deploy so these
// tests don't need a real apps/templates/casino-v1 project or Cloudflare
// credentials — bulkGenerate forwards `only` straight to each generate()
// call for exactly this purpose.
const ONLY_THROUGH_VALIDATION = [
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
  const repoRoot = await mkdtemp(path.join(tmpdir(), "bulk-generate-repo-"));
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
    JSON.stringify([{ id: "index", defaultSkeleton: "minimal", allowedComponents: ["intro", "faq"] }]),
  );
  return repoRoot;
}

function configJson(slug: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    slug,
    domains: [`${slug}.example`],
    affiliateUrl: `https://affiliate.example/track?id=${slug}`,
    template: "casino-v1",
    locales: [{ code: "en-US", default: true }],
    theme: { primary: "#111111", secondary: "#222222" },
    navbar: {},
    banner: { desktop: `/images/${slug}/banner.png` },
    contentSource: "library",
    ...overrides,
  });
}

async function writeSite(
  repoRoot: string,
  slug: string,
  data: unknown = { brandName: slug, pages: ["index"] },
  overrides: Record<string, unknown> = {},
) {
  const siteDir = path.join(repoRoot, "sites", slug);
  await writeFileDeep(path.join(siteDir, "config.json"), configJson(slug, overrides));
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify(data));
}

test("REGRESSION: skipDeploy is threaded through to generate() — no credentials needed without --dry-run", async () => {
  // Without skipDeploy reaching generate(), the deploy block builds real
  // Cloudflare providers (which loads .env and throws MissingEnvError with
  // no credentials configured) even when `only` excludes every deploy
  // stage — dryRun:true masked this in every other test here, since Noop
  // providers need no credentials either way. This test deliberately sets
  // neither dryRun nor a repo-root .env, so only a correctly-threaded
  // skipDeploy can make it succeed.
  const repoRoot = await scaffoldRepoRoot();
  await writeSite(repoRoot, "site-a");

  const result = await bulkGenerate({
    sitesRoot: path.join(repoRoot, "sites"),
    repoRoot,
    skipDeploy: true,
    only: [...ONLY_THROUGH_VALIDATION],
  });
  assert.deepEqual(result.succeeded, ["site-a"]);
  assert.deepEqual(result.failed, []);

  await rm(repoRoot, { recursive: true, force: true });
});

test("generates every site under sitesRoot and reports success", async () => {
  const repoRoot = await scaffoldRepoRoot();
  await writeSite(repoRoot, "site-a");
  await writeSite(repoRoot, "site-b");

  const result = await bulkGenerate({
    sitesRoot: path.join(repoRoot, "sites"),
    repoRoot,
    dryRun: true,
    only: [...ONLY_THROUGH_VALIDATION],
  });
  assert.deepEqual(result.succeeded.sort(), ["site-a", "site-b"]);
  assert.deepEqual(result.failed, []);

  await rm(repoRoot, { recursive: true, force: true });
});

test("one site's failure doesn't stop or corrupt the rest of the batch", async () => {
  const repoRoot = await scaffoldRepoRoot();
  await writeSite(repoRoot, "good-site");
  // No data.json at all -> load-config succeeds but parse-docx throws.
  await writeFileDeep(path.join(repoRoot, "sites", "bad-site", "config.json"), configJson("bad-site"));

  const result = await bulkGenerate({
    sitesRoot: path.join(repoRoot, "sites"),
    repoRoot,
    dryRun: true,
    only: [...ONLY_THROUGH_VALIDATION],
  });
  assert.deepEqual(result.succeeded, ["good-site"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].slug, "bad-site");

  await rm(repoRoot, { recursive: true, force: true });
});

test("--site restricts the batch to one site", async () => {
  const repoRoot = await scaffoldRepoRoot();
  await writeSite(repoRoot, "site-a");
  await writeSite(repoRoot, "site-b");

  const result = await bulkGenerate({
    sitesRoot: path.join(repoRoot, "sites"),
    repoRoot,
    dryRun: true,
    only: [...ONLY_THROUGH_VALIDATION],
    site: "site-a",
  });
  assert.deepEqual(result.succeeded, ["site-a"]);

  await rm(repoRoot, { recursive: true, force: true });
});

test("--limit caps how many sites run", async () => {
  const repoRoot = await scaffoldRepoRoot();
  await writeSite(repoRoot, "site-a");
  await writeSite(repoRoot, "site-b");
  await writeSite(repoRoot, "site-c");

  const result = await bulkGenerate({
    sitesRoot: path.join(repoRoot, "sites"),
    repoRoot,
    dryRun: true,
    only: [...ONLY_THROUGH_VALIDATION],
    limit: 2,
  });
  assert.equal(result.sites.length, 2);

  await rm(repoRoot, { recursive: true, force: true });
});

test("--locale only includes sites that declare that locale", async () => {
  const repoRoot = await scaffoldRepoRoot();
  await writeSite(repoRoot, "en-site");
  await writeSite(repoRoot, "de-site", { brandName: "de-site", pages: ["index"] }, { locales: [{ code: "de-DE", default: true }] });

  const result = await bulkGenerate({
    sitesRoot: path.join(repoRoot, "sites"),
    repoRoot,
    dryRun: true,
    only: [...ONLY_THROUGH_VALIDATION],
    locale: "de-DE",
  });
  assert.deepEqual(result.sites.map((s) => s.slug), ["de-site"]);

  await rm(repoRoot, { recursive: true, force: true });
});

test("onSiteComplete fires once per site with a running completed count", async () => {
  const repoRoot = await scaffoldRepoRoot();
  await writeSite(repoRoot, "site-a");
  await writeSite(repoRoot, "site-b");
  await writeSite(repoRoot, "site-c");

  const seen: number[] = [];
  await bulkGenerate({
    sitesRoot: path.join(repoRoot, "sites"),
    repoRoot,
    dryRun: true,
    only: [...ONLY_THROUGH_VALIDATION],
    onSiteComplete: (_outcome, completed, total) => {
      seen.push(completed);
      assert.equal(total, 3);
    },
  });
  assert.deepEqual(seen.sort((a, b) => a - b), [1, 2, 3]);

  await rm(repoRoot, { recursive: true, force: true });
});

test("concurrency cap of 1 processes sites sequentially without dropping any", async () => {
  const repoRoot = await scaffoldRepoRoot();
  await writeSite(repoRoot, "site-a");
  await writeSite(repoRoot, "site-b");
  await writeSite(repoRoot, "site-c");

  const result = await bulkGenerate({
    sitesRoot: path.join(repoRoot, "sites"),
    repoRoot,
    dryRun: true,
    only: [...ONLY_THROUGH_VALIDATION],
    concurrency: 1,
  });
  assert.deepEqual(result.succeeded.sort(), ["site-a", "site-b", "site-c"]);

  await rm(repoRoot, { recursive: true, force: true });
});

test("an empty sites directory returns an empty, non-throwing result", async () => {
  const repoRoot = await scaffoldRepoRoot();
  await mkdir(path.join(repoRoot, "sites"), { recursive: true });

  const result = await bulkGenerate({
    sitesRoot: path.join(repoRoot, "sites"),
    repoRoot,
    dryRun: true,
    only: [...ONLY_THROUGH_VALIDATION],
  });
  assert.deepEqual(result, { sites: [], succeeded: [], failed: [] });

  await rm(repoRoot, { recursive: true, force: true });
});
