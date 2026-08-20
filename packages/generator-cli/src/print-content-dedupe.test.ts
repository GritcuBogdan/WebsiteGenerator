import { test } from "node:test";
import assert from "node:assert/strict";
import { formatContentDedupe } from "./print-content-dedupe.js";

test("reports a clean bill of health when there are no findings", () => {
  assert.equal(formatContentDedupe([]), "No duplicate or near-duplicate content found.");
});

test("lists exact duplicates separately from near-duplicates, with a percentage for near", () => {
  const output = formatContentDedupe([
    { locale: "en-US", component: "intro", entryA: "en-US/intro/a.md", entryB: "en-US/intro/b.md", kind: "exact", jaccard: 1 },
    { locale: "en-US", component: "faq", entryA: "en-US/faq/c.md", entryB: "en-US/faq/d.md", kind: "near", jaccard: 0.85 },
  ]);
  assert.match(output, /1 exact duplicate\(s\):/);
  assert.match(output, /en-US\/intro\/a\.md == en-US\/intro\/b\.md/);
  assert.match(output, /1 near-duplicate\(s\):/);
  assert.match(output, /en-US\/faq\/c\.md ~ en-US\/faq\/d\.md \(85% similar\)/);
});

test("omits the exact-duplicate section entirely when there are none", () => {
  const output = formatContentDedupe([
    { locale: "en-US", component: "faq", entryA: "a.md", entryB: "b.md", kind: "near", jaccard: 0.9 },
  ]);
  assert.doesNotMatch(output, /exact duplicate/);
});
