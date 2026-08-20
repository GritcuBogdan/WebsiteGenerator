import type { ContentEntry } from "./discover.js";
import { jaccardSimilarity, sha256Hash, shingles } from "./similarity.js";
import { blockTexts } from "./parse-blocks.js";

export type DuplicateFinding = {
  locale: string;
  component: string;
  entryA: string; // sourcePath
  entryB: string; // sourcePath
  kind: "exact" | "near";
  jaccard: number; // 1 for exact
};

export type DedupeOptions = {
  // Jaccard similarity at or above this threshold counts as "near"
  // (architecture doc §24's "10 good variants, not 1000 spun ones" is
  // exactly what this guards against). 0.8 is a deliberately
  // conservative starting point — high enough to avoid flagging two
  // genuinely different paragraphs that happen to share some phrasing.
  nearThreshold?: number;
};

const DEFAULT_NEAR_THRESHOLD = 0.8;

function entryText(entry: ContentEntry): string {
  const blockText = entry.blocks.flatMap(blockTexts);
  return entry.question !== undefined ? [entry.question, ...blockText].join(" ") : blockText.join(" ");
}

// Compares every pair of entries within the same locale+component (never
// across components — an "intro" and a "faq" being similar means
// nothing) and flags exact and near duplicates. O(n²) within each group,
// which is fine at library scale — this is a content:dedupe / library-
// maintenance tool, never on the per-site generation path.
export function findDuplicateContent(entries: ContentEntry[], options: DedupeOptions = {}): DuplicateFinding[] {
  const nearThreshold = options.nearThreshold ?? DEFAULT_NEAR_THRESHOLD;
  const findings: DuplicateFinding[] = [];

  const groups = new Map<string, ContentEntry[]>();
  for (const entry of entries) {
    const key = `${entry.locale}/${entry.component}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const prepared = group.map((entry) => {
      const text = entryText(entry);
      return { entry, hash: sha256Hash(text), shingleSet: shingles(text) };
    });

    for (let i = 0; i < prepared.length; i++) {
      for (let j = i + 1; j < prepared.length; j++) {
        const a = prepared[i];
        const b = prepared[j];
        const shared = { locale: a.entry.locale, component: a.entry.component, entryA: a.entry.sourcePath, entryB: b.entry.sourcePath };

        if (a.hash === b.hash) {
          findings.push({ ...shared, kind: "exact", jaccard: 1 });
          continue;
        }

        const jaccard = jaccardSimilarity(a.shingleSet, b.shingleSet);
        if (jaccard >= nearThreshold) {
          findings.push({ ...shared, kind: "near", jaccard });
        }
      }
    }
  }

  return findings;
}
