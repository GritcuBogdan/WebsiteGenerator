import { test } from "node:test";
import assert from "node:assert/strict";
import { formatContentStats } from "./print-content-stats.js";

test("formats locales and components in sorted order", () => {
  const output = formatContentStats({
    "en-US": { intro: 2, faq: 1 },
    "de-DE": { intro: 1 },
  });
  const lines = output.split("\n");
  assert.deepEqual(lines, ["de-DE", "  intro: 1", "en-US", "  faq: 1", "  intro: 2"]);
});

test("reports an empty library distinctly", () => {
  assert.equal(formatContentStats({}), "Content library is empty.");
});
