import { test } from "node:test";
import assert from "node:assert/strict";
import { skeletonSchema, pageTypeSchema } from "./skeleton.js";

test("accepts a well-formed skeleton", () => {
  const result = skeletonSchema.safeParse({
    id: "standard",
    sections: ["intro", "bonus", "games", "payments", "security", "faq", "cta"],
  });
  assert.equal(result.success, true);
});

test("rejects a skeleton with duplicate component ids", () => {
  const result = skeletonSchema.safeParse({ id: "broken", sections: ["intro", "faq", "faq"] });
  assert.equal(result.success, false);
});

test("rejects a skeleton with an empty sections array", () => {
  const result = skeletonSchema.safeParse({ id: "empty", sections: [] });
  assert.equal(result.success, false);
});

test("accepts a well-formed page type", () => {
  const result = pageTypeSchema.safeParse({
    id: "review",
    defaultSkeleton: "standard",
    allowedComponents: ["intro", "bonus", "games", "payments", "security", "faq", "cta"],
  });
  assert.equal(result.success, true);
});

test("rejects a page type with no allowedComponents", () => {
  const result = pageTypeSchema.safeParse({ id: "review", defaultSkeleton: "standard", allowedComponents: [] });
  assert.equal(result.success, false);
});
