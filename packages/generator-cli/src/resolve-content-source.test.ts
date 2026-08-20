import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SiteConfig } from "schema";
import { resolveContentSource } from "./resolve-content-source.js";

let siteDir: string;

function baseConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    slug: "luckyspin",
    domains: ["luckyspin.example"],
    affiliateUrl: "https://affiliate.example/track?id=luckyspin",
    template: "casino-v1",
    locales: [{ code: "en", docx: "casino.en.docx", default: true }],
    theme: { primary: "#111", secondary: "#222" },
    navbar: {},
    banner: { desktop: "/images/luckyspin/banner.png" },
    ...overrides,
  };
}

before(async () => {
  siteDir = await mkdtemp(path.join(tmpdir(), "resolve-content-source-test-"));
});
after(async () => {
  await rm(siteDir, { recursive: true, force: true });
});

test("an explicit contentSource always wins, regardless of what's on disk", () => {
  const result = resolveContentSource(baseConfig({ contentSource: "library" }), siteDir);
  assert.deepEqual(result, { ok: true, contentSource: "library" });
});

test("infers 'docx' when a docx file exists and data.json doesn't", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rcs-docx-"));
  await writeFile(path.join(dir, "casino.en.docx"), "fake docx bytes");
  const result = resolveContentSource(baseConfig(), dir);
  assert.deepEqual(result, { ok: true, contentSource: "docx" });
  await rm(dir, { recursive: true, force: true });
});

test("infers 'library' when data.json exists and no locale's docx exists", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rcs-library-"));
  await writeFile(path.join(dir, "data.json"), "{}");
  const result = resolveContentSource(baseConfig(), dir);
  assert.deepEqual(result, { ok: true, contentSource: "library" });
  await rm(dir, { recursive: true, force: true });
});

test("fails loudly when both a docx and data.json exist", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rcs-both-"));
  await writeFile(path.join(dir, "casino.en.docx"), "fake docx bytes");
  await writeFile(path.join(dir, "data.json"), "{}");
  const result = resolveContentSource(baseConfig(), dir);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.issue, /both a docx file and data\.json exist/);
  await rm(dir, { recursive: true, force: true });
});

test("fails loudly when neither a docx nor data.json exists", () => {
  const result = resolveContentSource(baseConfig(), siteDir);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.issue, /neither a docx file nor data\.json exists/);
});

test("a locale with no docx field set is treated the same as a missing file for inference", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rcs-no-docx-field-"));
  await writeFile(path.join(dir, "data.json"), "{}");
  const config = baseConfig({ locales: [{ code: "en", default: true }] });
  const result = resolveContentSource(config, dir);
  assert.deepEqual(result, { ok: true, contentSource: "library" });
  await rm(dir, { recursive: true, force: true });
});

test("the failure message names the site slug", () => {
  const result = resolveContentSource(baseConfig({ slug: "starbet" }), siteDir);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.issue, /"starbet"/);
});
