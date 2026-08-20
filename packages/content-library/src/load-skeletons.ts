import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { skeletonSchema, type Skeleton } from "schema";

export type LoadedSkeletons = { skeletons: Skeleton[]; issues: string[] };

// Loads content-library/skeletons/*.json (architecture doc §03) — one
// skeleton per file, validated against skeletonSchema. A malformed file
// is reported as an issue and skipped, not thrown — one bad skeleton
// shouldn't block loading the others, the same failure-isolation posture
// as discoverContentLibrary.
export async function loadSkeletons(dir: string): Promise<LoadedSkeletons> {
  const skeletons: Skeleton[] = [];
  const issues: string[] = [];
  const seenIds = new Map<string, string>();

  let fileNames: string[];
  try {
    fileNames = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    issues.push(`cannot read skeletons directory "${dir}": ${(error as Error).message}`);
    return { skeletons, issues };
  }

  for (const fileName of fileNames) {
    const filePath = path.join(dir, fileName);
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(filePath, "utf-8"));
    } catch (error) {
      issues.push(`${fileName}: ${(error as Error).message}`);
      continue;
    }

    const result = skeletonSchema.safeParse(raw);
    if (!result.success) {
      issues.push(`${fileName}: ${result.error.message}`);
      continue;
    }

    const existing = seenIds.get(result.data.id);
    if (existing) {
      issues.push(`duplicate skeleton id "${result.data.id}": ${existing} and ${fileName}`);
      continue;
    }
    seenIds.set(result.data.id, fileName);
    skeletons.push(result.data);
  }

  return { skeletons, issues };
}
