import path from "node:path";
import { discoverContentLibrary } from "./discover.js";
import { loadSkeletons } from "./load-skeletons.js";
import { loadPageTypes } from "./load-page-types.js";
import type { PageType, Skeleton } from "schema";
import type { ContentEntry } from "./discover.js";

export type LoadedContentLibrary = {
  entries: ContentEntry[];
  skeletons: Skeleton[];
  pageTypes: PageType[];
  issues: string[];
};

// One-shot loader for content-library/'s on-disk contract (architecture
// doc §03): <root>/<locale>/<component>/*.md entries, <root>/skeletons/*.json,
// and <root>/page-types.json. Combines discoverContentLibrary + loadSkeletons
// + loadPageTypes into the single call pipeline integration (and later
// bulk generation) actually needs — meant to be loaded once and reused
// across every site/locale in a run (§52/§53), not reloaded per site.
export async function loadContentLibrary(rootDir: string): Promise<LoadedContentLibrary> {
  const [library, skeletonResult, pageTypeResult] = await Promise.all([
    discoverContentLibrary(rootDir),
    loadSkeletons(path.join(rootDir, "skeletons")),
    loadPageTypes(path.join(rootDir, "page-types.json")),
  ]);

  return {
    entries: library.entries,
    skeletons: skeletonResult.skeletons,
    pageTypes: pageTypeResult.pageTypes,
    issues: [...library.issues, ...skeletonResult.issues, ...pageTypeResult.issues],
  };
}
