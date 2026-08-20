import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { previewSite } from "./preview-site.js";

async function writeFileDeep(fullPath: string, content: string): Promise<void> {
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

async function scaffoldRepoRoot(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "preview-site-repo-"));
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

test("previews a library site: resolved data/skeleton/components, no build or deploy artifacts", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson({ profile: "dark-blue-casino" }));
  await writeFileDeep(
    path.join(repoRoot, "profiles", "dark-blue-casino.json"),
    JSON.stringify({ id: "dark-blue-casino" }),
  );
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({ brandName: "TestCasino", pages: ["index"] }));

  const preview = await previewSite(siteDir, repoRoot);

  assert.equal(preview.profile, "dark-blue-casino");
  assert.equal(preview.generate.pageCounts["en-US"], 1);
  assert.ok(preview.contentReport);
  assert.equal(preview.contentReport?.locales["en-US"].pages[0].slug, "index");
  assert.equal(preview.contentReport?.locales["en-US"].pages[0].skeleton, "minimal");
  assert.ok(preview.contentReport!.locales["en-US"].pages[0].wordCount > 0);

  // Preview never builds or deploys: distDir wasn't actually populated,
  // no preview/production URL.
  assert.equal(preview.generate.buildDurationMs, 0);
  assert.equal(preview.generate.previewUrl, undefined);
  assert.equal(preview.generate.productionUrl, undefined);

  await rm(repoRoot, { recursive: true, force: true });
});

test("previews a site with no profile referenced", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson());
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({ brandName: "TestCasino", pages: ["index"] }));

  const preview = await previewSite(siteDir, repoRoot);
  assert.equal(preview.profile, undefined);

  await rm(repoRoot, { recursive: true, force: true });
});

test("propagates a real pipeline failure (e.g. no eligible content) instead of swallowing it", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson());
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({ pages: ["nonexistent-page-type"] }));

  await assert.rejects(previewSite(siteDir, repoRoot));

  await rm(repoRoot, { recursive: true, force: true });
});
