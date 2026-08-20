import { test, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocx } from "./parse-docx.js";
import type { ParsedDocxContent } from "schema";

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "test",
  "fixtures",
  "sample.docx",
);

let result: ParsedDocxContent;

before(async () => {
  // No pythonPath passed: exercises the default resolution order, which
  // falls back to this package's own .venv (see python/requirements.txt)
  // when one exists — the same setup a fresh clone follows.
  result = await parseDocx(fixturePath, "en");
});

test("parses the locale through unchanged and finds both pages", () => {
  assert.equal(result.locale, "en");
  assert.deepEqual(
    result.pages.map((page) => page.slug),
    ["index", "bonus"],
  );
});

test("extracts explicit meta title/description/h1, pruning absent fields", () => {
  const home = result.pages[0];
  assert.deepEqual(home.meta, {
    title: "Sample Casino - Home",
    description: "A sample casino for testing.",
    h1: "Sample Casino",
  });
  assert.equal(home.title, "Sample Casino"); // from meta.h1
  assert.equal(home.navLabel, "Home");

  const bonus = result.pages[1];
  assert.equal(bonus.meta.title, "Sample Casino - Bonus");
  assert.equal("description" in bonus.meta, false); // no Meta Description line on this page -> pruned, not null
  assert.equal(bonus.title, "Bonus Page");
});

test("builds the home page's intro section with banner text and nav links", () => {
  const intro = result.pages[0].sections[0];
  assert.equal(intro.type, "intro");
  if (intro.type !== "intro") throw new Error("unreachable");

  assert.deepEqual(intro.paragraphs, ["Welcome to Sample Casino, the best place to play."]);
  assert.equal(intro.bannerText, "Get up to $500 bonus today!");
  assert.deepEqual(intro.navigation, [
    { title: "Bonus", href: "#bonus" },
    { title: "Slots", href: "#slots" },
  ]);
});

test("a second intro paragraph is demoted to an untitled section right after the hero, not left in it", () => {
  const [intro, overflow] = result.pages[0].sections;
  assert.equal(intro.type, "intro");

  assert.equal(overflow.type, "text");
  if (overflow.type !== "text") throw new Error("unreachable");
  assert.equal(overflow.title, "");
  assert.deepEqual(overflow.paragraphs, ["Extra trust copy that is too long to fit in the hero."]);
});

test("a plain heading with a single paragraph becomes a text section", () => {
  const aboutUs = result.pages[0].sections.find((section) => section.title === "About Us");
  assert.ok(aboutUs, "expected an 'About Us' section");
  assert.equal(aboutUs!.type, "text");
  if (aboutUs!.type !== "text") throw new Error("unreachable");
  assert.deepEqual(aboutUs!.paragraphs, ["We are a great casino with many games."]);
});

test("a heading named FAQ becomes a faq section with question/answer pairs", () => {
  const faq = result.pages[0].sections.find((section) => section.type === "faq");
  assert.ok(faq, "expected a faq section");
  if (faq!.type !== "faq") throw new Error("unreachable");
  assert.deepEqual(faq!.items, [
    { question: "Is this safe?", answer: "Yes, absolutely safe and secure." },
    { question: "How do I withdraw?", answer: "Go to the withdrawal page and follow the steps." },
  ]);
});

test("a label + list + table together become one content section with 3 blocks", () => {
  const details = result.pages[1].sections.find((section) => section.title === "Bonus Details");
  assert.ok(details, "expected a 'Bonus Details' section");
  assert.equal(details!.type, "content");
  if (details!.type !== "content") throw new Error("unreachable");

  assert.equal(details!.blocks.length, 3);
  assert.deepEqual(details!.blocks[0], { type: "text", paragraphs: ["Here are the details:"] });
  assert.deepEqual(details!.blocks[1], {
    type: "list",
    items: ["First deposit bonus", "Second deposit bonus"],
  });
  assert.deepEqual(details!.blocks[2], {
    type: "table",
    columns: ["Bonus Type", "Amount"],
    rows: [
      ["Welcome", "$500"],
      ["Reload", "$100"],
    ],
  });
});
