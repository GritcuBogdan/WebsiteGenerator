import path from "node:path";
import sharp from "sharp";

// Same matrix as the old scripts/optimize-images.mjs. No mtime-based
// skip-if-newer caching here: unlike the old script (which optimized files
// in place inside a persistent public/ directory), this always writes into
// a disposable, freshly-generated output directory, so "is it already
// up to date" never applies.
export const RESPONSIVE_WIDTHS = [320, 640, 768, 960, 1280];
export const WEBP_QUALITY = 82;
export const WEBP_EFFORT = 5;

export type WriteWebpVariantsOptions = {
  // Skip the full-size "<name>.webp" output — used when the source file is
  // already .webp, so we don't write a redundant self-copy (matches the old
  // script's behavior).
  includeBase?: boolean;
};

export async function writeWebpVariants(
  sourcePath: string,
  outputDir: string,
  baseName: string,
  options: WriteWebpVariantsOptions = {},
): Promise<string[]> {
  const { includeBase = true } = options;
  const written: string[] = [];
  const source = sharp(sourcePath).rotate();

  if (includeBase) {
    const baseWebpPath = path.join(outputDir, `${baseName}.webp`);
    await source.clone().webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT }).toFile(baseWebpPath);
    written.push(baseWebpPath);
  }

  for (const width of RESPONSIVE_WIDTHS) {
    const target = path.join(outputDir, `${baseName}-${width}.webp`);
    await source
      .clone()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
      .toFile(target);
    written.push(target);
  }

  return written;
}
