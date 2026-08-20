import { test, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocx } from "./parse-docx.js";
import type { ParsedDocxContent } from "schema";

// sample-flat.docx has zero Heading 3 paragraphs anywhere - every
// subsection, including "Navigation" and "FAQ", is a plain paragraph. Real
// defect seen in a translated locale copy: without this fallback, the
// entire page collapses into the intro (or the unused parsed nav list) and
// no other sections are ever produced.
const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "test",
  "fixtures",
  "sample-flat.docx",
);

let result: ParsedDocxContent;

before(async () => {
  result = await parseDocx(fixturePath, "en");
});

test("a document with zero Heading 3 paragraphs still splits into separate sections", () => {
  const home = result.pages[0];
  const types = home.sections.map((section) => section.type);
  assert.deepEqual(types, ["intro", "text", "faq"]);
});

test("the 'Navigation' list's duplicate titles don't surface as empty sections, and a literal 'H2:' text prefix is stripped", () => {
  const home = result.pages[0];
  const aboutUsSections = home.sections.filter((section) => section.title === "About Us");
  assert.equal(aboutUsSections.length, 1);
});

test("an FAQ heading not in the hardcoded keyword list is still detected from its own Q/A shape", () => {
  const faq = result.pages[0].sections.find((section) => section.type === "faq");
  assert.ok(faq, "expected a faq section");
  assert.equal(faq!.title, "Questions People Ask");
});

test("a question and answer merged onto one paragraph still becomes a proper Q/A pair", () => {
  const faq = result.pages[0].sections.find((section) => section.type === "faq");
  assert.ok(faq, "expected a faq section");
  if (faq!.type !== "faq") throw new Error("unreachable");

  assert.deepEqual(faq!.items, [
    { question: "Is this safe?", answer: "Yes, absolutely safe and secure." },
    { question: "How do I withdraw?", answer: "Go to the withdrawal page and follow the steps." },
  ]);
});
