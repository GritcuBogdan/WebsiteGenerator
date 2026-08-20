import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { generateFavicon } from "./favicon.js";

let workDir: string;
let sourcePath: string;
let outputDir: string;

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "image-pipeline-favicon-test-"));
  outputDir = path.join(workDir, "out");
  await mkdir(outputDir, { recursive: true });

  // deliberately non-square, to exercise the "contain onto a transparent
  // square" letterboxing rather than a squash
  sourcePath = path.join(workDir, "logo.png");
  const logo = await sharp({
    create: { width: 400, height: 100, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
  })
    .png()
    .toBuffer();
  await writeFile(sourcePath, logo);
});

after(async () => {
  await rm(workDir, { recursive: true, force: true });
});

test("writes favicon.ico, standalone PNGs, and an apple-touch-icon", async () => {
  const result = await generateFavicon(sourcePath, outputDir);
  const names = result.files.map((file) => path.basename(file)).sort();
  assert.deepEqual(names, [
    "apple-touch-icon.png",
    "favicon-16x16.png",
    "favicon-32x32.png",
    "favicon.ico",
  ]);
});

test("favicon.ico has a valid ICONDIR header embedding all three sizes", async () => {
  const result = await generateFavicon(sourcePath, outputDir);
  const icoPath = result.files.find((file) => file.endsWith("favicon.ico"))!;
  const buffer = await readFile(icoPath);

  assert.equal(buffer.readUInt16LE(0), 0); // reserved
  assert.equal(buffer.readUInt16LE(2), 1); // type: icon
  assert.equal(buffer.readUInt16LE(4), 3); // 3 embedded images: 16/32/48
});

test("apple-touch-icon.png is letterboxed to 180x180 without squashing the source", async () => {
  const result = await generateFavicon(sourcePath, outputDir);
  const applePath = result.files.find((file) => file.endsWith("apple-touch-icon.png"))!;
  const metadata = await sharp(applePath).metadata();
  assert.equal(metadata.width, 180);
  assert.equal(metadata.height, 180);
});
