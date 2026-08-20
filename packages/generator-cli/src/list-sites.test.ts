import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listSiteDirs, filterBySite } from "./list-sites.js";

async function writeSite(sitesRoot: string, dirName: string, config: unknown): Promise<void> {
  const siteDir = path.join(sitesRoot, dirName);
  await mkdir(siteDir, { recursive: true });
  await writeFile(path.join(siteDir, "config.json"), JSON.stringify(config), "utf-8");
}

test("returns an empty list when sitesRoot doesn't exist", () => {
  assert.deepEqual(listSiteDirs(path.join(tmpdir(), "does-not-exist-" + Date.now())), []);
});

test("discovers a site dir and reads its slug from config.json", async () => {
  const sitesRoot = await mkdtemp(path.join(tmpdir(), "list-sites-"));
  await writeSite(sitesRoot, "luckyspin", { slug: "luckyspin" });

  const sites = listSiteDirs(sitesRoot);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].slug, "luckyspin");
  assert.equal(sites[0].dirName, "luckyspin");

  await rm(sitesRoot, { recursive: true, force: true });
});

test("falls back to the directory name when config.json's slug can't be read", async () => {
  const sitesRoot = await mkdtemp(path.join(tmpdir(), "list-sites-"));
  const siteDir = path.join(sitesRoot, "brokensite");
  await mkdir(siteDir, { recursive: true });
  await writeFile(path.join(siteDir, "config.json"), "{ not valid json", "utf-8");

  const sites = listSiteDirs(sitesRoot);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].slug, "brokensite");

  await rm(sitesRoot, { recursive: true, force: true });
});

test("skips directories with no config.json", async () => {
  const sitesRoot = await mkdtemp(path.join(tmpdir(), "list-sites-"));
  await mkdir(path.join(sitesRoot, "not-a-site"), { recursive: true });
  await writeSite(sitesRoot, "realsite", { slug: "realsite" });

  const sites = listSiteDirs(sitesRoot);
  assert.deepEqual(sites.map((s) => s.slug), ["realsite"]);

  await rm(sitesRoot, { recursive: true, force: true });
});

test("skips directories starting with _ or .", async () => {
  const sitesRoot = await mkdtemp(path.join(tmpdir(), "list-sites-"));
  await writeSite(sitesRoot, "_example", { slug: "example-casino" });
  await writeSite(sitesRoot, ".hidden", { slug: "hidden" });
  await writeSite(sitesRoot, "realsite", { slug: "realsite" });

  const sites = listSiteDirs(sitesRoot);
  assert.deepEqual(sites.map((s) => s.slug), ["realsite"]);

  await rm(sitesRoot, { recursive: true, force: true });
});

test("sorts results by slug", async () => {
  const sitesRoot = await mkdtemp(path.join(tmpdir(), "list-sites-"));
  await writeSite(sitesRoot, "zsite", { slug: "zsite" });
  await writeSite(sitesRoot, "asite", { slug: "asite" });

  const sites = listSiteDirs(sitesRoot);
  assert.deepEqual(sites.map((s) => s.slug), ["asite", "zsite"]);

  await rm(sitesRoot, { recursive: true, force: true });
});

test("filterBySite matches by resolved slug or raw directory name", async () => {
  const sitesRoot = await mkdtemp(path.join(tmpdir(), "list-sites-"));
  await writeSite(sitesRoot, "dirname-a", { slug: "sluggy" });
  await writeSite(sitesRoot, "dirname-b", { slug: "other" });

  const sites = listSiteDirs(sitesRoot);
  assert.deepEqual(filterBySite(sites, "sluggy").map((s) => s.dirName), ["dirname-a"]);
  assert.deepEqual(filterBySite(sites, "dirname-b").map((s) => s.slug), ["other"]);
  assert.deepEqual(filterBySite(sites, undefined), sites);

  await rm(sitesRoot, { recursive: true, force: true });
});
