import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { processImages, type ImageManifestEntry } from "./process-images.js";

let workDir: string;
let inputDir: string;
let outputDir: string;
let manifest: ImageManifestEntry[];

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "image-pipeline-test-"));
  inputDir = path.join(workDir, "input");
  outputDir = path.join(workDir, "output");
  await mkdir(inputDir, { recursive: true });
  await mkdir(path.join(inputDir, "Slots"), { recursive: true });
  await mkdir(path.join(inputDir, "Flags"), { recursive: true });

  const redPng = await sharp({
    create: { width: 12, height: 8, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();

  const greenWebp = await sharp({
    create: { width: 12, height: 8, channels: 3, background: { r: 0, g: 255, b: 0 } },
  })
    .webp()
    .toBuffer();

  // same basename in two different subdirs -> must NOT dedupe against each other
  await writeFile(path.join(inputDir, "Slots", "Logo.png"), redPng);
  await writeFile(path.join(inputDir, "Flags", "Logo.png"), redPng);

  // two files that slugify to the same name in the SAME directory -> must dedupe
  await writeFile(path.join(inputDir, "Bonus!.png"), redPng);
  await writeFile(path.join(inputDir, "Bonus.png"), redPng);

  // already-webp source: base ".webp" should be skipped, responsive widths still generated
  await writeFile(path.join(inputDir, "banner.webp"), greenWebp);

  manifest = await processImages(inputDir, outputDir);
});

after(async () => {
  await rm(workDir, { recursive: true, force: true });
});

test("preserves directory structure and does not cross-dedupe across directories", () => {
  const slotsLogo = manifest.find((entry) => entry.original === "Slots/Logo.png");
  const flagsLogo = manifest.find((entry) => entry.original === "Flags/Logo.png");
  assert.ok(slotsLogo, "expected an entry for Slots/Logo.png");
  assert.ok(flagsLogo, "expected an entry for Flags/Logo.png");
  assert.equal(slotsLogo!.finalPath, "slots/logo.png");
  assert.equal(flagsLogo!.finalPath, "flags/logo.png");
});

test("dedupes colliding names within the same directory", () => {
  const bonusEntries = manifest.filter(
    (entry) => entry.original === "Bonus!.png" || entry.original === "Bonus.png",
  );
  assert.equal(bonusEntries.length, 2);
  const finalPaths = bonusEntries.map((entry) => entry.finalPath).sort();
  assert.deepEqual(finalPaths, ["bonus-2.png", "bonus.png"]);
});

test("generates the responsive webp matrix, skipping the redundant base webp for webp sources", () => {
  const pngEntry = manifest.find((entry) => entry.original === "Bonus.png")!;
  const webpEntry = manifest.find((entry) => entry.original === "banner.webp")!;

  assert.equal(pngEntry.variants.length, 6); // base .webp + 5 responsive widths
  assert.equal(webpEntry.variants.length, 5); // no redundant base for an already-webp source
});

test("actually writes every file listed in the manifest", async () => {
  for (const entry of manifest) {
    await access(path.join(outputDir, entry.finalPath));
    for (const variant of entry.variants) {
      await access(path.join(outputDir, variant));
    }
  }
});
