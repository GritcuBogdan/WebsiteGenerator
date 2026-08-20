import { test } from "node:test";
import assert from "node:assert/strict";
import type { ParsedDocxContent } from "schema";
import { applyOverrides, OverrideMismatchError } from "./apply-overrides.js";
import type { OverridesFile } from "./overrides-file.js";

function sampleContent(): ParsedDocxContent {
  return {
    locale: "en",
    pages: [
      {
        slug: "index",
        title: "Sample Casino",
        navLabel: "Home",
        meta: { title: "Sample Casino - Home", h1: "Sample Casino" },
        sections: [
          {
            type: "intro",
            id: "intro",
            title: "Sample Casino",
            paragraphs: ["Welcome!"],
            bannerText: "Old banner text",
          },
          {
            type: "faq",
            id: "faq-1",
            title: "FAQ",
            items: [{ question: "Is this safe?", answer: "Yes." }],
          },
        ],
      },
      {
        slug: "bonus",
        title: "Bonus Page",
        navLabel: "Bonus",
        meta: {},
        sections: [
          {
            type: "text",
            id: "details",
            title: "Bonus Details",
            paragraphs: ["Some details."],
          },
        ],
      },
    ],
  };
}

test("returns the content unchanged when there is no overrides file", () => {
  const content = sampleContent();
  assert.deepEqual(applyOverrides(content, undefined), content);
});

test("merges a matching page's top-level fields without touching other pages", () => {
  const overrides: OverridesFile = {
    pages: {
      index: { title: "Corrected Casino Name" },
    },
  };
  const result = applyOverrides(sampleContent(), overrides);
  assert.equal(result.pages[0].title, "Corrected Casino Name");
  assert.equal(result.pages[1].title, "Bonus Page"); // untouched
});

test("merges meta as an object (key by key), not a wholesale replace", () => {
  const overrides: OverridesFile = {
    pages: {
      index: { meta: { description: "New description" } },
    },
  };
  const result = applyOverrides(sampleContent(), overrides);
  assert.deepEqual(result.pages[0].meta, {
    title: "Sample Casino - Home", // preserved
    h1: "Sample Casino", // preserved
    description: "New description", // added
  });
});

test("merges a matching section's fields, leaving sibling sections alone", () => {
  const overrides: OverridesFile = {
    pages: {
      index: {
        sections: {
          intro: { bannerText: "Get $500 today!" },
        },
      },
    },
  };
  const result = applyOverrides(sampleContent(), overrides);
  const intro = result.pages[0].sections[0];
  assert.equal(intro.type, "intro");
  if (intro.type === "intro") {
    assert.equal(intro.bannerText, "Get $500 today!");
    assert.deepEqual(intro.paragraphs, ["Welcome!"]); // untouched
  }
  const faq = result.pages[0].sections[1];
  assert.deepEqual(faq, sampleContent().pages[0].sections[1]); // untouched
});

test("merges a page-level banner override (image/text/buttonText) - available on any page, unlike bannerText which needs an existing intro section", () => {
  const overrides: OverridesFile = {
    pages: {
      bonus: { banner: { image: "bonus-hero.jpg", text: "Get $500 today!", buttonText: "Claim Now" } },
    },
  };
  const result = applyOverrides(sampleContent(), overrides);
  assert.deepEqual(result.pages[1].banner, {
    image: "bonus-hero.jpg",
    text: "Get $500 today!",
    buttonText: "Claim Now",
  });
});

test("an array field in a section override replaces the array wholesale", () => {
  const overrides: OverridesFile = {
    pages: {
      index: {
        sections: {
          "faq-1": {
            items: [
              { question: "Is this safe?", answer: "Yes, fully licensed and secure." },
              { question: "New question?", answer: "New answer." },
            ],
          },
        },
      },
    },
  };
  const result = applyOverrides(sampleContent(), overrides);
  const faq = result.pages[0].sections[1];
  assert.equal(faq.type, "faq");
  if (faq.type === "faq") {
    assert.equal(faq.items.length, 2);
    assert.equal(faq.items[0].answer, "Yes, fully licensed and secure.");
  }
});

test("throws OverrideMismatchError for a page slug that doesn't exist", () => {
  const overrides: OverridesFile = {
    pages: { "no-such-page": { title: "x" } },
  };
  assert.throws(() => applyOverrides(sampleContent(), overrides), OverrideMismatchError);
});

test("throws OverrideMismatchError for a section id that doesn't exist on that page", () => {
  const overrides: OverridesFile = {
    pages: { index: { sections: { "no-such-section": { title: "x" } } } },
  };
  assert.throws(() => applyOverrides(sampleContent(), overrides), OverrideMismatchError);
});

test("collects every mismatch into one error instead of failing on the first", () => {
  const overrides: OverridesFile = {
    pages: {
      "bad-page": { title: "x" },
      index: { sections: { "bad-section": { title: "y" } } },
    },
  };
  try {
    applyOverrides(sampleContent(), overrides);
    assert.fail("expected OverrideMismatchError");
  } catch (error) {
    assert.ok(error instanceof OverrideMismatchError);
    assert.equal(error.issues.length, 2);
  }
});
