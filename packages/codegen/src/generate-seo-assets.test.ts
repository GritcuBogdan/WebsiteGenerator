import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assembleSite } from "./assemble-site.js";
import { buildSitemap, buildRobotsTxt, writeSeoAssets } from "./generate-seo-assets.js";
import { sampleConfig, sampleParsedContent } from "./test-fixtures.js";

test("sitemap includes an absolute-URL entry for every page", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  const xml = buildSitemap([casino], "sample-casino.example");

  assert.match(xml, /<loc>https:\/\/sample-casino\.example\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/sample-casino\.example\/bonus\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/sample-casino\.example\/login\/<\/loc>/);
});

test("sitemap gives the home page weekly/1.0 and other pages monthly/0.7", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  const xml = buildSitemap([casino], "sample-casino.example");
  const homeEntry = xml.split("</url>").find((chunk) => chunk.includes("sample-casino.example/</loc>"))!;
  assert.match(homeEntry, /<changefreq>weekly<\/changefreq>/);
  assert.match(homeEntry, /<priority>1\.0<\/priority>/);

  const bonusEntry = xml.split("</url>").find((chunk) => chunk.includes("/bonus/</loc>"))!;
  assert.match(bonusEntry, /<changefreq>monthly<\/changefreq>/);
  assert.match(bonusEntry, /<priority>0\.7<\/priority>/);
});

test("robots.txt disallows the affiliate redirect path and points at the sitemap", () => {
  const robots = buildRobotsTxt("sample-casino.example");
  assert.match(robots, /Disallow: \/go\//);
  assert.match(robots, /Sitemap: https:\/\/sample-casino\.example\/sitemap\.xml/);
});

let workDir: string;
before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "generate-seo-assets-test-"));
});
after(async () => {
  await rm(workDir, { recursive: true, force: true });
});

test("writeSeoAssets writes both files to the given directory", async () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  await writeSeoAssets([casino], "sample-casino.example", workDir);

  const sitemap = await readFile(path.join(workDir, "sitemap.xml"), "utf-8");
  const robots = await readFile(path.join(workDir, "robots.txt"), "utf-8");
  assert.match(sitemap, /<urlset/);
  assert.match(robots, /User-agent: \*/);
});
