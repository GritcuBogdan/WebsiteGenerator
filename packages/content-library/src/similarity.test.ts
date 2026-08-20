import { test } from "node:test";
import assert from "node:assert/strict";
import { jaccardSimilarity, normalizeText, sha256Hash, shingles } from "./similarity.js";

test("normalizeText lowercases, strips punctuation, and collapses whitespace", () => {
  assert.equal(normalizeText("Hello,   World!!"), "hello world");
});

test("normalizeText preserves non-ASCII letters", () => {
  assert.equal(normalizeText("Größte Auswahl!"), "größte auswahl");
});

test("shingles produces overlapping word n-grams of the given size", () => {
  const result = shingles("the quick brown fox jumps", 3);
  assert.deepEqual(
    [...result].sort(),
    ["brown fox jumps", "quick brown fox", "the quick brown"].sort(),
  );
});

test("shingles on text shorter than the window still returns one shingle", () => {
  const result = shingles("hello world", 3);
  assert.deepEqual([...result], ["hello world"]);
});

test("shingles on empty text returns an empty set", () => {
  assert.equal(shingles("").size, 0);
  assert.equal(shingles("   ").size, 0);
});

test("jaccardSimilarity of identical sets is 1", () => {
  const set = shingles("the quick brown fox jumps");
  assert.equal(jaccardSimilarity(set, set), 1);
});

test("jaccardSimilarity of completely disjoint sets is 0", () => {
  const a = new Set(["a b c"]);
  const b = new Set(["x y z"]);
  assert.equal(jaccardSimilarity(a, b), 0);
});

test("jaccardSimilarity of two empty sets is 1 (trivially identical)", () => {
  assert.equal(jaccardSimilarity(new Set(), new Set()), 1);
});

test("jaccardSimilarity reflects partial overlap correctly", () => {
  const a = new Set(["a", "b", "c", "d"]);
  const b = new Set(["c", "d", "e", "f"]);
  // intersection {c, d} = 2, union {a,b,c,d,e,f} = 6
  assert.equal(jaccardSimilarity(a, b), 2 / 6);
});

test("sha256Hash is stable for the same text", () => {
  assert.equal(sha256Hash("Hello, World!"), sha256Hash("Hello, World!"));
});

test("sha256Hash treats normalization-equivalent text as identical", () => {
  assert.equal(sha256Hash("Hello,   World!!"), sha256Hash("hello world"));
});

test("sha256Hash differs for genuinely different text", () => {
  assert.notEqual(sha256Hash("Hello, World!"), sha256Hash("Goodbye, World!"));
});
