import { test } from "node:test";
import assert from "node:assert/strict";
import { deepMergeOverride } from "./deep-merge.js";

test("merges plain objects key by key", () => {
  const base = { a: 1, b: 2, c: 3 };
  const result = deepMergeOverride(base, { b: 20 });
  assert.deepEqual(result, { a: 1, b: 20, c: 3 });
});

test("recurses into nested objects", () => {
  const base = { meta: { title: "Old Title", description: "Old Desc" } };
  const result = deepMergeOverride(base, { meta: { title: "New Title" } });
  assert.deepEqual(result, { meta: { title: "New Title", description: "Old Desc" } });
});

test("replaces arrays wholesale rather than merging item by item", () => {
  const base = { paragraphs: ["one", "two", "three"] };
  const result = deepMergeOverride(base, { paragraphs: ["only one now"] });
  assert.deepEqual(result, { paragraphs: ["only one now"] });
});

test("an undefined override value leaves the base value untouched", () => {
  const base = { a: 1, b: 2 };
  const result = deepMergeOverride(base, { a: undefined, b: 20 });
  assert.deepEqual(result, { a: 1, b: 20 });
});

test("an override can introduce a key the base didn't have", () => {
  const base: { a: number; bannerText?: string } = { a: 1 };
  const result = deepMergeOverride(base, { bannerText: "New banner" });
  assert.deepEqual(result, { a: 1, bannerText: "New banner" });
});

test("a scalar override replaces the base value directly", () => {
  assert.equal(deepMergeOverride("old", "new"), "new");
  assert.equal(deepMergeOverride(1, 2), 2);
});

test("does not mutate the base object", () => {
  const base = { meta: { title: "Old" } };
  const snapshot = JSON.parse(JSON.stringify(base));
  deepMergeOverride(base, { meta: { title: "New" } });
  assert.deepEqual(base, snapshot);
});
