import path from "node:path";
import { readdir, mkdir, copyFile } from "node:fs/promises";
import { slugifyRelativePath, dedupeName } from "./slugify.js";
import { writeWebpVariants } from "./optimize.js";

const SOURCE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export type ImageManifestEntry = {
  original: string; // path as provided, relative to inputDir
  finalPath: string; // renamed/optimized original's path, relative to outputDir, "/"-separated
  variants: string[]; // generated webp variant paths, relative to outputDir, "/"-separated
};

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

async function walk(dir: string, base: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full, base)));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(path.relative(base, full));
    }
  }

  return files;
}

// Reads every image under inputDir (recursively), slugifies+dedupes each
// filename (scoped per output directory, so "logo.png" in two different
// subfolders never collides), copies the renamed original, and generates
// the responsive webp matrix alongside it. Returns a manifest the codegen
// stage (Phase 5) uses to rewrite any docx/config image references to
// their final path.
export async function processImages(inputDir: string, outputDir: string): Promise<ImageManifestEntry[]> {
  const files = await walk(inputDir, inputDir);
  const usedNamesByDir = new Map<string, Set<string>>();
  const manifest: ImageManifestEntry[] = [];

  for (const relativePath of files) {
    const { dir, base, ext } = slugifyRelativePath(relativePath);

    let usedInDir = usedNamesByDir.get(dir);
    if (!usedInDir) {
      usedInDir = new Set<string>();
      usedNamesByDir.set(dir, usedInDir);
    }
    const finalBase = dedupeName(base, usedInDir);

    const outDir = dir ? path.join(outputDir, dir) : outputDir;
    await mkdir(outDir, { recursive: true });

    const sourceFullPath = path.join(inputDir, relativePath);
    const finalFullPath = path.join(outDir, `${finalBase}${ext}`);
    await copyFile(sourceFullPath, finalFullPath);

    const variantPaths = await writeWebpVariants(sourceFullPath, outDir, finalBase, {
      includeBase: ext !== ".webp",
    });

    manifest.push({
      original: toPosix(relativePath),
      finalPath: toPosix(path.relative(outputDir, finalFullPath)),
      variants: variantPaths.map((variantPath) => toPosix(path.relative(outputDir, variantPath))),
    });
  }

  return manifest;
}
