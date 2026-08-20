import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { encodeIco } from "./ico.js";

const ICO_SIZES = [16, 32, 48];
const STANDALONE_PNG_SIZES = [16, 32];
const APPLE_TOUCH_SIZE = 180;

async function squarePng(sourcePath: string, size: number): Promise<Buffer> {
  return sharp(sourcePath)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

export type FaviconResult = {
  files: string[]; // absolute paths written, for the caller's manifest/logging
};

// Generates favicon.ico (16/32/48 embedded), standalone favicon-*.png, and
// an apple-touch-icon.png, all from one source image (typically the site's
// logo mark). Non-square sources are letterboxed onto a transparent square
// rather than squashed.
export async function generateFavicon(sourcePath: string, outputDir: string): Promise<FaviconResult> {
  await mkdir(outputDir, { recursive: true });
  const files: string[] = [];

  const icoImages = await Promise.all(
    ICO_SIZES.map(async (size) => ({ size, png: await squarePng(sourcePath, size) })),
  );
  const icoPath = path.join(outputDir, "favicon.ico");
  await writeFile(icoPath, encodeIco(icoImages));
  files.push(icoPath);

  for (const size of STANDALONE_PNG_SIZES) {
    const pngPath = path.join(outputDir, `favicon-${size}x${size}.png`);
    await writeFile(pngPath, await squarePng(sourcePath, size));
    files.push(pngPath);
  }

  const applePath = path.join(outputDir, "apple-touch-icon.png");
  await writeFile(applePath, await squarePng(sourcePath, APPLE_TOUCH_SIZE));
  files.push(applePath);

  return { files };
}
