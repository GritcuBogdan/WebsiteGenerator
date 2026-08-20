import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { importSites } from "./import-sites.js";

let workDir: string;
let sitesRoot: string;

async function writeDataset(fileName: string, rows: unknown): Promise<string> {
  const filePath = path.join(workDir, fileName);
  await writeFile(filePath, JSON.stringify(rows), "utf-8");
  return filePath;
}

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "import-sites-test-"));
});
after(async () => {
  await rm(workDir, { recursive: true, force: true });
});

test("creates config.json + data.json for a new site, splitting identity fields from facts", async () => {
  sitesRoot = path.join(workDir, "sites-basic");
  const dataset = await writeDataset("casinos-basic.json", [
    {
      slug: "luckyspin",
      domain: "luckyspin.com",
      affiliateUrl: "https://affiliate.example/track?id=luckyspin",
      locale: "de-DE",
      brandName: "LuckySpin",
      gameCount: 2000,
    },
  ]);

  const result = importSites(dataset, sitesRoot);
  assert.deepEqual(
    { created: result.created, updated: result.updated, unchanged: result.unchanged, failed: result.failed },
    { created: ["luckyspin"], updated: [], unchanged: [], failed: [] },
  );

  const config = JSON.parse(await readFile(path.join(sitesRoot, "luckyspin", "config.json"), "utf-8"));
  assert.equal(config.slug, "luckyspin");
  assert.deepEqual(config.domains, ["luckyspin.com"]);
  assert.deepEqual(config.locales, [{ code: "de-DE", default: true }]);
  assert.equal(config.contentSource, "library");
  assert.ok(!("brandName" in config));

  const data = JSON.parse(await readFile(path.join(sitesRoot, "luckyspin", "data.json"), "utf-8"));
  assert.equal(data.brandName, "LuckySpin");
  assert.equal(data.gameCount, 2000);
  assert.ok(!("slug" in data));

  assert.ok(existsSync(path.join(sitesRoot, "luckyspin", "images")));
});

test("a row's theme lands in config.json (not data.json), leaving unset colors for the profile to fill in", async () => {
  const dir = path.join(workDir, "sites-theme");
  const dataset = await writeDataset("casinos-theme.json", [
    {
      slug: "chromacasino",
      domain: "chromacasino.example",
      affiliateUrl: "https://affiliate.example/track?id=chroma",
      locale: "en-US",
      brandName: "ChromaCasino",
      theme: { primary: "#123456", secondary: "#000000", accent: "#ABCDEF" },
    },
  ]);

  importSites(dataset, dir);

  const config = JSON.parse(await readFile(path.join(dir, "chromacasino", "config.json"), "utf-8"));
  assert.deepEqual(config.theme, { primary: "#123456", secondary: "#000000", accent: "#ABCDEF" });

  const data = JSON.parse(await readFile(path.join(dir, "chromacasino", "data.json"), "utf-8"));
  assert.ok(!("theme" in data));
});

test("honors an explicit contentSource on the row instead of defaulting to library", async () => {
  sitesRoot = path.join(workDir, "sites-explicit-source");
  const dataset = await writeDataset("casinos-explicit.json", [
    {
      slug: "docxsite",
      domain: "docxsite.example",
      affiliateUrl: "https://affiliate.example/track?id=docxsite",
      locale: "en",
      contentSource: "docx",
    },
  ]);

  importSites(dataset, sitesRoot);
  const config = JSON.parse(await readFile(path.join(sitesRoot, "docxsite", "config.json"), "utf-8"));
  assert.equal(config.contentSource, "docx");
});

test("writes the same profile id into both config.json and data.json", async () => {
  sitesRoot = path.join(workDir, "sites-profile");
  const dataset = await writeDataset("casinos-profile.json", [
    {
      slug: "goldrush",
      domain: "goldrush.example",
      affiliateUrl: "https://affiliate.example/track?id=goldrush",
      locale: "en",
      profile: "gold-luxury-casino",
    },
  ]);

  importSites(dataset, sitesRoot);
  const config = JSON.parse(await readFile(path.join(sitesRoot, "goldrush", "config.json"), "utf-8"));
  const data = JSON.parse(await readFile(path.join(sitesRoot, "goldrush", "data.json"), "utf-8"));
  assert.equal(config.profile, "gold-luxury-casino");
  assert.equal(data.profile, "gold-luxury-casino");
});

test("re-running without --force never clobbers a hand-edited field", async () => {
  sitesRoot = path.join(workDir, "sites-idempotent");
  const row = {
    slug: "starbet",
    domain: "starbet.example",
    affiliateUrl: "https://affiliate.example/track?id=starbet",
    locale: "en",
    brandName: "StarBet",
  };
  const dataset1 = await writeDataset("casinos-v1.json", [row]);
  importSites(dataset1, sitesRoot);

  // Hand-edit: someone adds a custom theme directly to config.json, and
  // changes the brandName in data.json.
  const configPath = path.join(sitesRoot, "starbet", "config.json");
  const dataPath = path.join(sitesRoot, "starbet", "data.json");
  const existingConfig = JSON.parse(await readFile(configPath, "utf-8"));
  await writeFile(configPath, JSON.stringify({ ...existingConfig, theme: { primary: "#custom" } }), "utf-8");
  const existingData = JSON.parse(await readFile(dataPath, "utf-8"));
  await writeFile(dataPath, JSON.stringify({ ...existingData, brandName: "StarBet Casino (hand-edited)" }), "utf-8");

  // Re-run with an updated dataset (brandName changed, a new fact added).
  const dataset2 = await writeDataset("casinos-v2.json", [{ ...row, brandName: "StarBet Updated", gameCount: 1500 }]);
  const result = importSites(dataset2, sitesRoot);
  assert.deepEqual(
    { created: result.created, updated: result.updated, unchanged: result.unchanged, failed: result.failed },
    { created: [], updated: ["starbet"], unchanged: [], failed: [] },
  );

  const config = JSON.parse(await readFile(configPath, "utf-8"));
  assert.equal(config.theme.primary, "#custom"); // hand-edit preserved

  const data = JSON.parse(await readFile(dataPath, "utf-8"));
  assert.equal(data.brandName, "StarBet Casino (hand-edited)"); // hand-edit preserved
  assert.equal(data.gameCount, 1500); // new fact from the dataset still gets filled in
});

test("--force discards existing customizations and rewrites purely from the dataset", async () => {
  sitesRoot = path.join(workDir, "sites-force");
  const row = {
    slug: "casino3",
    domain: "casino3.example",
    affiliateUrl: "https://affiliate.example/track?id=casino3",
    locale: "en",
    brandName: "Casino3",
  };
  const dataset1 = await writeDataset("casinos-force-v1.json", [row]);
  importSites(dataset1, sitesRoot);

  const configPath = path.join(sitesRoot, "casino3", "config.json");
  const existingConfig = JSON.parse(await readFile(configPath, "utf-8"));
  await writeFile(configPath, JSON.stringify({ ...existingConfig, theme: { primary: "#custom" } }), "utf-8");

  const dataset2 = await writeDataset("casinos-force-v2.json", [{ ...row, brandName: "Casino3 Updated" }]);
  importSites(dataset2, sitesRoot, { force: true });

  const config = JSON.parse(await readFile(configPath, "utf-8"));
  assert.ok(!("theme" in config)); // hand-edit discarded
  const data = JSON.parse(await readFile(path.join(sitesRoot, "casino3", "data.json"), "utf-8"));
  assert.equal(data.brandName, "Casino3 Updated");
});

test("a dataset correction to a field nobody hand-edited propagates on a plain re-import", async () => {
  sitesRoot = path.join(workDir, "sites-provenance-refresh");
  const row = {
    slug: "provenance",
    domain: "provenance.example",
    affiliateUrl: "https://affiliate.example/track?id=provenance",
    locale: "en",
    gameCount: 2000,
  };
  const dataset1 = await writeDataset("casinos-provenance-v1.json", [row]);
  importSites(dataset1, sitesRoot);

  // No hand-edit at all — just a dataset correction (a typo fix).
  const dataset2 = await writeDataset("casinos-provenance-v2.json", [{ ...row, gameCount: 2500 }]);
  const result = importSites(dataset2, sitesRoot);
  assert.deepEqual(result.updated, ["provenance"]);

  const data = JSON.parse(await readFile(path.join(sitesRoot, "provenance", "data.json"), "utf-8"));
  assert.equal(data.gameCount, 2500); // untouched field refreshed from the corrected dataset
});

test("once a field is hand-edited, later dataset changes to that same field still don't override it", async () => {
  sitesRoot = path.join(workDir, "sites-provenance-protect");
  const row = {
    slug: "protected",
    domain: "protected.example",
    affiliateUrl: "https://affiliate.example/track?id=protected",
    locale: "en",
    gameCount: 2000,
  };
  const dataset1 = await writeDataset("casinos-protect-v1.json", [row]);
  importSites(dataset1, sitesRoot);

  const dataPath = path.join(sitesRoot, "protected", "data.json");
  const existingData = JSON.parse(await readFile(dataPath, "utf-8"));
  await writeFile(dataPath, JSON.stringify({ ...existingData, gameCount: 9999 }), "utf-8"); // manual override

  const dataset2 = await writeDataset("casinos-protect-v2.json", [{ ...row, gameCount: 2500 }]);
  importSites(dataset2, sitesRoot);

  const data = JSON.parse(await readFile(dataPath, "utf-8"));
  assert.equal(data.gameCount, 9999); // hand-edit still wins, even though the dataset also changed
});

test("--force on an already-existing site is still classified as updated, not created", async () => {
  sitesRoot = path.join(workDir, "sites-force-classify");
  const row = {
    slug: "reclassify",
    domain: "reclassify.example",
    affiliateUrl: "https://affiliate.example/track?id=reclassify",
    locale: "en",
    brandName: "Reclassify",
  };
  const dataset1 = await writeDataset("casinos-reclassify-v1.json", [row]);
  const first = importSites(dataset1, sitesRoot);
  assert.deepEqual(first.created, ["reclassify"]);

  const dataset2 = await writeDataset("casinos-reclassify-v2.json", [{ ...row, brandName: "Reclassify Updated" }]);
  const second = importSites(dataset2, sitesRoot, { force: true });
  assert.deepEqual(second.created, []);
  assert.deepEqual(second.updated, ["reclassify"]);
  assert.deepEqual(second.unchanged, []);
});

test("a duplicate slug within the same dataset fails both rows, without stopping unrelated rows", async () => {
  sitesRoot = path.join(workDir, "sites-dup");
  const dataset = await writeDataset("casinos-dup.json", [
    { slug: "dupe", domain: "a.example", affiliateUrl: "https://affiliate.example/track?id=a", locale: "en" },
    { slug: "dupe", domain: "b.example", affiliateUrl: "https://affiliate.example/track?id=b", locale: "en" },
    { slug: "unique", domain: "c.example", affiliateUrl: "https://affiliate.example/track?id=c", locale: "en" },
  ]);

  const result = importSites(dataset, sitesRoot);
  assert.deepEqual(result.created, ["unique"]);
  assert.equal(result.failed.length, 2);
  assert.ok(result.failed.every((f) => f.slug === "dupe" && f.reason.includes("duplicate slug")));
  assert.ok(!existsSync(path.join(sitesRoot, "dupe")));
});

test("a schema-invalid row fails in isolation, without stopping the rest of the batch", async () => {
  sitesRoot = path.join(workDir, "sites-invalid");
  const dataset = await writeDataset("casinos-invalid.json", [
    { slug: "badurl", domain: "bad.example", affiliateUrl: "not-a-url", locale: "en" },
    { slug: "goodsite", domain: "good.example", affiliateUrl: "https://affiliate.example/track?id=good", locale: "en" },
  ]);

  const result = importSites(dataset, sitesRoot);
  assert.deepEqual(result.created, ["goodsite"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].slug, "badurl");
});

test("throws when the dataset file is not valid JSON", async () => {
  const badPath = path.join(workDir, "not-json.json");
  await writeFile(badPath, "{ not valid json", "utf-8");
  assert.throws(() => importSites(badPath, path.join(workDir, "sites-badjson")), /Cannot read dataset/);
});

test("throws when the dataset file is not a JSON array", async () => {
  const notArrayPath = path.join(workDir, "not-array.json");
  await writeFile(notArrayPath, JSON.stringify({ slug: "oops" }), "utf-8");
  assert.throws(() => importSites(notArrayPath, path.join(workDir, "sites-notarray")), /must be a JSON array/);
});

test("classifies a site as created on first import and unchanged when the same dataset is re-run", async () => {
  sitesRoot = path.join(workDir, "sites-created-updated");
  const row = { slug: "trackme", domain: "trackme.example", affiliateUrl: "https://affiliate.example/track?id=trackme", locale: "en" };
  const dataset = await writeDataset("casinos-track.json", [row]);

  const first = importSites(dataset, sitesRoot);
  assert.deepEqual(first.created, ["trackme"]);
  assert.deepEqual(first.unchanged, []);

  // Re-running the exact same dataset against its own untouched output is a
  // true no-op — nothing on disk actually differs, so this must not be
  // reported as "updated".
  const second = importSites(dataset, sitesRoot);
  assert.deepEqual(second.created, []);
  assert.deepEqual(second.updated, []);
  assert.deepEqual(second.unchanged, ["trackme"]);
  assert.deepEqual(second.failed, []);
});

test("a duplicate domain within the same dataset fails both rows, without stopping unrelated rows", async () => {
  sitesRoot = path.join(workDir, "sites-dup-domain");
  const dataset = await writeDataset("casinos-dup-domain.json", [
    { slug: "site-a", domain: "shared.example", affiliateUrl: "https://affiliate.example/track?id=a", locale: "en" },
    { slug: "site-b", domain: "shared.example", affiliateUrl: "https://affiliate.example/track?id=b", locale: "en" },
    { slug: "site-c", domain: "unique.example", affiliateUrl: "https://affiliate.example/track?id=c", locale: "en" },
  ]);

  const result = importSites(dataset, sitesRoot);
  assert.deepEqual(result.created, ["site-c"]);
  assert.equal(result.failed.length, 2);
  assert.ok(result.failed.every((f) => ["site-a", "site-b"].includes(f.slug) && f.reason.includes("duplicate domain")));
  assert.ok(!existsSync(path.join(sitesRoot, "site-a")));
});

test("rejects a row referencing a profile that doesn't exist on disk, when profilesDir is given", async () => {
  sitesRoot = path.join(workDir, "sites-bad-profile");
  const profilesDir = path.join(workDir, "profiles-empty");
  await mkdir(profilesDir, { recursive: true });
  const dataset = await writeDataset("casinos-bad-profile.json", [
    { slug: "noprofile", domain: "noprofile.example", affiliateUrl: "https://affiliate.example/track?id=np", locale: "en", profile: "does-not-exist" },
  ]);

  const result = importSites(dataset, sitesRoot, { profilesDir });
  assert.equal(result.created.length, 0);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].slug, "noprofile");
  assert.match(result.failed[0].reason, /invalid profile/);
  assert.ok(!existsSync(path.join(sitesRoot, "noprofile")));
});

test("accepts a row referencing a profile that does exist on disk", async () => {
  sitesRoot = path.join(workDir, "sites-good-profile");
  const profilesDir = path.join(workDir, "profiles-good");
  await mkdir(profilesDir, { recursive: true });
  await writeFile(path.join(profilesDir, "gold-luxury-casino.json"), JSON.stringify({ id: "gold-luxury-casino" }), "utf-8");
  const dataset = await writeDataset("casinos-good-profile.json", [
    { slug: "hasprofile", domain: "hasprofile.example", affiliateUrl: "https://affiliate.example/track?id=hp", locale: "en", profile: "gold-luxury-casino" },
  ]);

  const result = importSites(dataset, sitesRoot, { profilesDir });
  assert.deepEqual(result.created, ["hasprofile"]);
  assert.deepEqual(result.failed, []);
});

test("--dry-run reports what would happen without writing or creating anything", async () => {
  sitesRoot = path.join(workDir, "sites-dry-run");
  const row = { slug: "previewsite", domain: "previewsite.example", affiliateUrl: "https://affiliate.example/track?id=preview", locale: "en", brandName: "Preview" };
  const dataset = await writeDataset("casinos-dry-run.json", [row]);

  const result = importSites(dataset, sitesRoot, { dryRun: true });
  assert.deepEqual(result.created, ["previewsite"]);
  assert.ok(!existsSync(path.join(sitesRoot, "previewsite")));

  // Now actually import for real, hand-edit, then dry-run an update.
  importSites(dataset, sitesRoot);
  const dataPath = path.join(sitesRoot, "previewsite", "data.json");
  const existingData = JSON.parse(await readFile(dataPath, "utf-8"));
  await writeFile(dataPath, JSON.stringify({ ...existingData, brandName: "Preview (hand-edited)" }), "utf-8");

  const dataset2 = await writeDataset("casinos-dry-run-2.json", [{ ...row, gameCount: 999 }]);
  const dryResult = importSites(dataset2, sitesRoot, { dryRun: true });
  assert.deepEqual(dryResult.updated, ["previewsite"]);

  // Nothing was actually written by the dry run: gameCount still absent.
  const dataAfterDryRun = JSON.parse(await readFile(dataPath, "utf-8"));
  assert.ok(!("gameCount" in dataAfterDryRun));
  assert.equal(dataAfterDryRun.brandName, "Preview (hand-edited)");
});
