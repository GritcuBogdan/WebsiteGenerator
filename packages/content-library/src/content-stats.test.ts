import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContentEntry } from "./discover.js";
import { computeContentLibraryStats } from "./content-stats.js";

function entry(locale: string, component: string, id: string): ContentEntry {
  return { id, component, locale, requires: [], paragraphs: [], blocks: [], sourcePath: `${locale}/${component}/${id}.md` };
}

test("counts entries per locale per component", () => {
  const stats = computeContentLibraryStats([
    entry("en-US", "intro", "intro-001"),
    entry("en-US", "intro", "intro-002"),
    entry("en-US", "faq", "faq-001"),
    entry("de-DE", "intro", "intro-001"),
  ]);
  assert.deepEqual(stats, {
    "en-US": { intro: 2, faq: 1 },
    "de-DE": { intro: 1 },
  });
});

test("an empty library produces an empty stats object", () => {
  assert.deepEqual(computeContentLibraryStats([]), {});
});
