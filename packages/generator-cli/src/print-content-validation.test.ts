import { test } from "node:test";
import assert from "node:assert/strict";
import { formatContentValidation } from "./print-content-validation.js";

test("reports counts and a clean bill of health when there are no issues", () => {
  const output = formatContentValidation({ issues: [], entryCount: 42, skeletonCount: 4, pageTypeCount: 6 });
  assert.match(output, /42 entries, 4 skeleton\(s\), 6 page type\(s\)/);
  assert.match(output, /No issues found\./);
});

test("uses singular 'entry' for exactly one entry", () => {
  const output = formatContentValidation({ issues: [], entryCount: 1, skeletonCount: 1, pageTypeCount: 1 });
  assert.match(output, /1 entry,/);
});

test("lists every issue with a count when there are any", () => {
  const output = formatContentValidation({
    issues: ['en-US/intro/intro-002.md: unknown placeholder {{REGULATOR}}', 'duplicate FAQ question in en-US: "Is this safe?"'],
    entryCount: 10,
    skeletonCount: 2,
    pageTypeCount: 3,
  });
  assert.match(output, /2 issue\(s\):/);
  assert.match(output, /unknown placeholder \{\{REGULATOR\}\}/);
  assert.match(output, /duplicate FAQ question/);
  assert.doesNotMatch(output, /No issues found\./);
});
