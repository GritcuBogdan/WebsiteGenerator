import type { ContentEntry } from "./discover.js";

// locale -> component -> entry count (architecture doc §48) — helps spot
// which parts of the library are thin (e.g. "de-DE has 40 intros but only
// 3 FAQs") without generating anything.
export type ContentLibraryStats = Record<string, Record<string, number>>;

export function computeContentLibraryStats(entries: ContentEntry[]): ContentLibraryStats {
  const stats: ContentLibraryStats = {};
  for (const entry of entries) {
    const byComponent = (stats[entry.locale] ??= {});
    byComponent[entry.component] = (byComponent[entry.component] ?? 0) + 1;
  }
  return stats;
}
