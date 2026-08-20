import { readFile } from "node:fs/promises";
import { pageTypeSchema, type PageType } from "schema";

export type LoadedPageTypes = { pageTypes: PageType[]; issues: string[] };

// Built via pageTypeSchema's own `.array()` rather than a separate `import
// { z } from "zod"` here — this package has no direct zod dependency of
// its own, and wrapping an already-built schema from another package with
// a second, independently-resolved zod module instance is exactly the
// kind of thing that silently breaks (different instances of the same —
// or a different — zod major version don't compose). Deriving from the
// schema object itself guarantees the same instance that built it.
const pageTypesFileSchema = pageTypeSchema.array();

// Loads content-library/page-types.json (architecture doc §03) — a single
// array file, unlike skeletons/ (one file per skeleton): page types are
// few and tend to change together, so one file is easier to review as a
// whole than a directory of near-identical small files.
export async function loadPageTypes(filePath: string): Promise<LoadedPageTypes> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(filePath, "utf-8"));
  } catch (error) {
    return { pageTypes: [], issues: [`cannot read page types file "${filePath}": ${(error as Error).message}`] };
  }

  const result = pageTypesFileSchema.safeParse(raw);
  if (!result.success) {
    return { pageTypes: [], issues: [`${filePath}: ${result.error.message}`] };
  }

  const issues: string[] = [];
  const seenIds = new Set<string>();
  const pageTypes: PageType[] = [];
  for (const pageType of result.data) {
    if (seenIds.has(pageType.id)) {
      issues.push(`duplicate page type id "${pageType.id}"`);
      continue;
    }
    seenIds.add(pageType.id);
    pageTypes.push(pageType);
  }

  return { pageTypes, issues };
}
