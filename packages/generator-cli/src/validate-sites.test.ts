import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateSites } from "./validate-sites.js";

async function writeFileDeep(fullPath: string, content: string): Promise<void> {
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

async function scaffoldRepoRoot(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "validate-sites-repo-"));
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

test("a fully valid library site with images/ reports OK on every check", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson());
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({ brandName: "TestCasino", pages: ["index"] }));
  await writeFileDeep(path.join(siteDir, "images", "logo.png"), "fake-image-bytes");

  const result = await validateSites({ sitesRoot: path.join(repoRoot, "sites"), repoRoot });
  assert.equal(result.sites.length, 1);
  assert.equal(result.sites[0].level, "OK");
  assert.equal(result.errorCount, 0);

  await rm(repoRoot, { recursive: true, force: true });
});

test("a site with unparsable config.json reports ERROR and is never silently dropped", async () => {
  const repoRoot = await scaffoldRepoRoot();
  await writeFileDeep(path.join(repoRoot, "sites", "broken", "config.json"), "{ not valid json");

  const result = await validateSites({ sitesRoot: path.join(repoRoot, "sites"), repoRoot });
  assert.equal(result.sites.length, 1);
  assert.equal(result.sites[0].level, "ERROR");
  assert.equal(result.errorCount, 1);
  assert.match(result.sites[0].checks[0].detail, /cannot read\/parse/);

  await rm(repoRoot, { recursive: true, force: true });
});

test("a site referencing a nonexistent profile reports ERROR", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson({ profile: "does-not-exist" }));
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({ brandName: "TestCasino" }));

  const result = await validateSites({ sitesRoot: path.join(repoRoot, "sites"), repoRoot });
  assert.equal(result.sites[0].level, "ERROR");
  assert.ok(result.sites[0].checks.some((c) => c.name === "profile" && c.level === "ERROR"));

  await rm(repoRoot, { recursive: true, force: true });
});

test("a library site missing data.json reports ERROR", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson());

  const result = await validateSites({ sitesRoot: path.join(repoRoot, "sites"), repoRoot });
  assert.equal(result.sites[0].level, "ERROR");
  assert.ok(result.sites[0].checks.some((c) => c.name === "data.json" && c.detail === "missing"));

  await rm(repoRoot, { recursive: true, force: true });
});

test("a library site with no eligible content for any page reports ERROR (content-eligibility)", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson());
  // No brandName -> intro's {{BRAND_NAME}} never resolves -> only "faq"
  // stays eligible, but the page-types fixture only defines "index" with
  // both intro+faq required by its skeleton, so index has an eligible faq
  // but not intro; composeContent still builds *a* page from whatever
  // sections land, so force true zero-eligibility by also removing pages.
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({ pages: ["nonexistent-page-type"] }));

  const result = await validateSites({ sitesRoot: path.join(repoRoot, "sites"), repoRoot });
  const contentCheck = result.sites[0].checks.find((c) => c.name === "content (en-US)");
  assert.ok(contentCheck);
  assert.equal(contentCheck?.level, "ERROR");
  assert.equal(result.sites[0].level, "ERROR");

  await rm(repoRoot, { recursive: true, force: true });
});

test("a library site where one requested page fails but others still compose reports WARNING, not ERROR", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson());
  // "index" composes fine (brandName present). "privacy-policy" is
  // requested explicitly but the fixture has no "legal" library entry for
  // it at all, so it fails in isolation (composeContent's per-page
  // isolation) without taking index down with it.
  await writeFileDeep(
    path.join(siteDir, "data.json"),
    JSON.stringify({ brandName: "TestCasino", pages: ["index", "privacy-policy"] }),
  );
  await writeFileDeep(path.join(siteDir, "images", "logo.png"), "fake-image-bytes"); // isolate: only the content check should vary

  const result = await validateSites({ sitesRoot: path.join(repoRoot, "sites"), repoRoot });
  const contentCheck = result.sites[0].checks.find((c) => c.name === "content (en-US)");
  assert.ok(contentCheck);
  assert.equal(contentCheck?.level, "WARNING");
  assert.match(contentCheck!.detail, /privacy-policy/);
  // A WARNING check shouldn't drag the whole site down to ERROR by itself.
  assert.equal(result.sites[0].level, "WARNING");

  await rm(repoRoot, { recursive: true, force: true });
});

test("a library site whose only requested page has no eligible content for one locale reports ERROR just for that locale", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(
    path.join(siteDir, "config.json"),
    configJson({ locales: [{ code: "en-US", default: true }, { code: "de-DE" }] }),
  );
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({ brandName: "TestCasino", pages: ["index"] }));

  const result = await validateSites({ sitesRoot: path.join(repoRoot, "sites"), repoRoot });
  const enCheck = result.sites[0].checks.find((c) => c.name === "content (en-US)");
  const deCheck = result.sites[0].checks.find((c) => c.name === "content (de-DE)");
  assert.equal(enCheck?.level, "OK");
  // de-DE has zero library entries at all -> zero eligible sections ->
  // index itself never composes -> ERROR for that locale specifically.
  assert.equal(deCheck?.level, "ERROR");

  await rm(repoRoot, { recursive: true, force: true });
});

test("a docx site with a missing docx file reports ERROR", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "docxsite");
  await writeFileDeep(
    path.join(siteDir, "config.json"),
    configJson({ slug: "docxsite", contentSource: "docx", locales: [{ code: "en-US", docx: "casino.en-US.docx", default: true }] }),
  );

  const result = await validateSites({ sitesRoot: path.join(repoRoot, "sites"), repoRoot });
  assert.equal(result.sites[0].level, "ERROR");
  assert.ok(result.sites[0].checks.some((c) => c.name === "docx (en-US)" && c.detail.includes("not found")));

  await rm(repoRoot, { recursive: true, force: true });
});

test("--site filters to just the named site", async () => {
  const repoRoot = await scaffoldRepoRoot();
  await writeFileDeep(path.join(repoRoot, "sites", "site-a", "config.json"), configJson({ slug: "site-a" }));
  await writeFileDeep(path.join(repoRoot, "sites", "site-a", "data.json"), JSON.stringify({ brandName: "A", pages: ["index"] }));
  await writeFileDeep(path.join(repoRoot, "sites", "site-b", "config.json"), configJson({ slug: "site-b" }));
  await writeFileDeep(path.join(repoRoot, "sites", "site-b", "data.json"), JSON.stringify({ brandName: "B", pages: ["index"] }));

  const result = await validateSites({ sitesRoot: path.join(repoRoot, "sites"), repoRoot, site: "site-a" });
  assert.deepEqual(result.sites.map((s) => s.slug), ["site-a"]);

  await rm(repoRoot, { recursive: true, force: true });
});

test("--locale filters out sites that don't declare that locale, but keeps unresolvable sites", async () => {
  const repoRoot = await scaffoldRepoRoot();
  await writeFileDeep(path.join(repoRoot, "sites", "en-site", "config.json"), configJson({ slug: "en-site" }));
  await writeFileDeep(path.join(repoRoot, "sites", "en-site", "data.json"), JSON.stringify({ brandName: "A", pages: ["index"] }));
  await writeFileDeep(path.join(repoRoot, "sites", "broken-site", "config.json"), "{ not valid json");

  const result = await validateSites({ sitesRoot: path.join(repoRoot, "sites"), repoRoot, locale: "de-DE" });
  // en-site declares only en-US -> excluded; broken-site's locales are
  // unknown -> kept (can't be conclusively excluded).
  assert.deepEqual(result.sites.map((s) => s.slug), ["broken-site"]);

  await rm(repoRoot, { recursive: true, force: true });
});

test("images check: OK when images/ has files, ERROR for casino-v1/v2 with none and no profile", async () => {
  const repoRoot = await scaffoldRepoRoot();
  const siteDir = path.join(repoRoot, "sites", "testcasino");
  await writeFileDeep(path.join(siteDir, "config.json"), configJson());
  await writeFileDeep(path.join(siteDir, "data.json"), JSON.stringify({ brandName: "TestCasino", pages: ["index"] }));

  const result = await validateSites({ sitesRoot: path.join(repoRoot, "sites"), repoRoot });
  const imagesCheck = result.sites[0].checks.find((c) => c.name === "images");
  assert.equal(imagesCheck?.level, "ERROR");

  await rm(repoRoot, { recursive: true, force: true });
});
