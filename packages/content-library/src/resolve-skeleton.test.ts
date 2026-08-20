import { test } from "node:test";
import assert from "node:assert/strict";
import type { PageType, Skeleton, SiteData } from "schema";
import { resolvePageType, resolveSkeleton } from "./resolve-skeleton.js";

const skeletons: Skeleton[] = [
  { id: "standard", sections: ["intro", "bonus", "games", "faq", "cta"] },
  { id: "bonus-focused", sections: ["intro", "bonus", "bonus-terms", "faq", "cta"] },
];

const pageTypes: PageType[] = [
  { id: "index", defaultSkeleton: "standard", allowedComponents: ["intro", "bonus", "bonus-terms", "games", "faq", "cta"] },
  { id: "review", defaultSkeleton: "standard", allowedComponents: ["intro", "bonus", "games", "faq", "cta"] },
  { id: "login", defaultSkeleton: "auth-minimal", allowedComponents: ["intro"] },
];

test("resolves a known page type's default skeleton", () => {
  const result = resolveSkeleton("review", pageTypes, skeletons, {});
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.skeleton.id, "standard");
});

test("resolves semantic page types through legacy slug aliases", () => {
  const result = resolvePageType("index", [{
    id: "home",
    topic: "home",
    aliases: ["index"],
    defaultSkeleton: "standard",
    allowedComponents: ["intro"],
  }]);
  assert.equal(result.recognized, true);
  assert.equal(result.pageType.id, "home");
  assert.equal(result.pageType.topic, "home");
});

test("an explicit siteData.skeleton override applies to the index page", () => {
  const result = resolveSkeleton("index", pageTypes, skeletons, { skeleton: "bonus-focused" });
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.skeleton.id, "bonus-focused");
});

test("an explicit siteData.skeleton override does NOT apply to a non-index page", () => {
  const result = resolveSkeleton("review", pageTypes, skeletons, { skeleton: "bonus-focused" });
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.skeleton.id, "standard");
});

test("an unrecognized page slug falls back to the generic single-section page type", () => {
  const result = resolveSkeleton("some-custom-page", pageTypes, skeletons, {});
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.pageType.id, "_generic");
    assert.deepEqual(result.skeleton.sections, ["intro"]);
  }
});

test("fails with an issue when the resolved skeleton id doesn't exist", () => {
  const result = resolveSkeleton("login", pageTypes, skeletons, {});
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.issue, /skeleton "auth-minimal" not found/);
});

test("fails with an issue when a skeleton includes a component the page type doesn't allow", () => {
  const strictPageTypes: PageType[] = [{ id: "review", defaultSkeleton: "standard", allowedComponents: ["intro", "faq"] }];
  const result = resolveSkeleton("review", strictPageTypes, skeletons, {});
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.issue, /not allowed for page type "review"/);
    assert.match(result.issue, /bonus/);
  }
});

test("fails when a resolved skeleton omits a required semantic section", () => {
  const result = resolveSkeleton(
    "login",
    [{ id: "login", defaultSkeleton: "minimal", allowedComponents: ["intro"], requiredSections: ["intro", "faq"] }],
    [{ id: "minimal", sections: ["intro"] }],
    {},
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.issue, /missing required section/);
});

test("the generic fallback's allowedComponents is never enforced against an explicit siteData.skeleton override", () => {
  // "index" isn't in pageTypes here, so it resolves through the generic
  // fallback — the override should still be honored rather than rejected
  // against the generic's restrictive (["intro"]-only) allow-list.
  const noIndexPageTypes: PageType[] = [{ id: "review", defaultSkeleton: "standard", allowedComponents: ["intro", "bonus", "games", "faq", "cta"] }];
  const siteData: SiteData = { skeleton: "bonus-focused" };
  const result = resolveSkeleton("index", noIndexPageTypes, skeletons, siteData);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.skeleton.id, "bonus-focused");
});
