import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContentEntry } from "./discover.js";
import type { EntryBlock } from "./parse-blocks.js";
import { findDuplicateContent } from "./content-dedupe.js";

// Mirrors what discover.ts actually produces for a plain-prose file: one
// "paragraphs" block equal to `paragraphs`.
function entry(partial: Partial<ContentEntry> & Pick<ContentEntry, "id" | "component" | "locale">): ContentEntry {
  const paragraphs = partial.paragraphs ?? [];
  const defaultBlocks: EntryBlock[] = paragraphs.length > 0 ? [{ type: "paragraphs", paragraphs }] : [];
  return {
    requires: [],
    paragraphs,
    blocks: defaultBlocks,
    sourcePath: `${partial.locale}/${partial.component}/${partial.id}.md`,
    ...partial,
  };
}

test("flags an exact duplicate (identical after normalization) within the same locale+component", () => {
  const entries = [
    entry({ id: "intro-001", component: "intro", locale: "en-US", paragraphs: ["Welcome to the casino!"] }),
    entry({ id: "intro-002", component: "intro", locale: "en-US", paragraphs: ["welcome to the casino"] }),
  ];
  const findings = findDuplicateContent(entries);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "exact");
  assert.equal(findings[0].jaccard, 1);
});

test("flags a near-duplicate above the threshold", () => {
  const entries = [
    entry({
      id: "intro-001",
      component: "intro",
      locale: "en-US",
      paragraphs: ["Join our casino today and claim your welcome bonus right now."],
    }),
    entry({
      id: "intro-002",
      component: "intro",
      locale: "en-US",
      paragraphs: ["Join our casino today and claim your welcome bonus right away."],
    }),
  ];
  const findings = findDuplicateContent(entries);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "near");
  assert.ok(findings[0].jaccard >= 0.8 && findings[0].jaccard < 1);
});

test("does not flag genuinely different content", () => {
  const entries = [
    entry({ id: "intro-001", component: "intro", locale: "en-US", paragraphs: ["Welcome to LuckySpin casino."] }),
    entry({ id: "intro-002", component: "intro", locale: "en-US", paragraphs: ["Play hundreds of exciting slot games today."] }),
  ];
  assert.deepEqual(findDuplicateContent(entries), []);
});

test("never compares entries across different components", () => {
  const entries = [
    entry({ id: "a", component: "intro", locale: "en-US", paragraphs: ["Welcome to the casino!"] }),
    entry({ id: "b", component: "faq", locale: "en-US", question: "?", paragraphs: ["Welcome to the casino!"] }),
  ];
  assert.deepEqual(findDuplicateContent(entries), []);
});

test("never compares entries across different locales", () => {
  const entries = [
    entry({ id: "a", component: "intro", locale: "en-US", paragraphs: ["Welcome to the casino!"] }),
    entry({ id: "b", component: "intro", locale: "de-DE", paragraphs: ["Welcome to the casino!"] }),
  ];
  assert.deepEqual(findDuplicateContent(entries), []);
});

test("compares FAQ entries using both question and answer text", () => {
  const entries = [
    entry({ id: "faq-001", component: "faq", locale: "en-US", question: "Is this safe?", paragraphs: ["Yes, fully licensed."] }),
    entry({ id: "faq-002", component: "faq", locale: "en-US", question: "Is this safe?", paragraphs: ["Yes, fully licensed."] }),
  ];
  const findings = findDuplicateContent(entries);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "exact");
});

test("respects a custom nearThreshold", () => {
  const entries = [
    entry({ id: "a", component: "intro", locale: "en-US", paragraphs: ["one two three four five six"] }),
    entry({ id: "b", component: "intro", locale: "en-US", paragraphs: ["one two three four five seven"] }),
  ];
  const lenient = findDuplicateContent(entries, { nearThreshold: 0.5 });
  const strict = findDuplicateContent(entries, { nearThreshold: 0.99 });
  assert.equal(lenient.length, 1);
  assert.equal(strict.length, 0);
});

test("returns an empty array for a library with no duplicates at all", () => {
  const entries = [entry({ id: "a", component: "intro", locale: "en-US", paragraphs: ["Completely unique text here."] })];
  assert.deepEqual(findDuplicateContent(entries), []);
});
