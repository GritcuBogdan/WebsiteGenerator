import { test } from "node:test";
import assert from "node:assert/strict";
import { slugifyName, slugifyRelativePath, dedupeName } from "./slugify.js";

test("slugifyName lowercases and hyphenates", () => {
  assert.equal(slugifyName("My Logo"), "my-logo");
});

test("slugifyName strips punctuation and collapses separators", () => {
  assert.equal(slugifyName("Book of Ra Deluxe!.v2"), "book-of-ra-deluxe-v2");
  assert.equal(slugifyName("a   b--c"), "a-b-c");
});

test("slugifyName folds diacritics and drops remaining non-ascii", () => {
  assert.equal(slugifyName("Café Röyale"), "cafe-royale");
  assert.equal(slugifyName("北京"), "file"); // nothing ascii survives -> fallback
});

test("slugifyName trims leading/trailing hyphens", () => {
  assert.equal(slugifyName("--Logo--"), "logo");
});

test("slugifyName falls back when input is empty after slugifying", () => {
  assert.equal(slugifyName("", "fallback"), "fallback");
  assert.equal(slugifyName("!!!", "fallback"), "fallback");
});

test("slugifyRelativePath slugifies directory segments and basename independently", () => {
  const result = slugifyRelativePath("Slot Images/Book Of Ra!.JPG");
  assert.deepEqual(result, { dir: "slot-images", base: "book-of-ra", ext: ".jpg" });
});

test("slugifyRelativePath handles a file with no directory", () => {
  const result = slugifyRelativePath("Logo Final.PNG");
  assert.deepEqual(result, { dir: "", base: "logo-final", ext: ".png" });
});

test("dedupeName leaves the first occurrence untouched", () => {
  const used = new Set<string>();
  assert.equal(dedupeName("logo", used), "logo");
});

test("dedupeName appends -2, -3, ... on collision", () => {
  const used = new Set<string>();
  assert.equal(dedupeName("logo", used), "logo");
  assert.equal(dedupeName("logo", used), "logo-2");
  assert.equal(dedupeName("logo", used), "logo-3");
});

test("dedupeName scopes only by the Set passed in", () => {
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  assert.equal(dedupeName("logo", usedA), "logo");
  assert.equal(dedupeName("logo", usedB), "logo"); // different scope, no collision
});
