import { test } from "node:test";
import assert from "node:assert/strict";
import { formatValidateSites } from "./print-validate-sites.js";
import type { ValidateSitesResult } from "./validate-sites.js";

test("prints per-site level and only surfaces non-OK checks", () => {
  const result: ValidateSitesResult = {
    sites: [
      {
        slug: "goodsite",
        siteDir: "/sites/goodsite",
        level: "OK",
        checks: [{ name: "config", level: "OK", detail: "schema valid" }],
      },
      {
        slug: "badsite",
        siteDir: "/sites/badsite",
        level: "ERROR",
        checks: [
          { name: "config", level: "OK", detail: "schema valid" },
          { name: "data.json", level: "ERROR", detail: "missing" },
        ],
      },
    ],
    errorCount: 1,
    warningCount: 0,
    okCount: 1,
  };

  const output = formatValidateSites(result);
  assert.match(output, /\[OK\] goodsite/);
  assert.match(output, /all 1 check\(s\) OK/);
  assert.match(output, /\[ERROR\] badsite/);
  assert.match(output, /ERROR data\.json: missing/);
  assert.doesNotMatch(output, /OK config: schema valid.*badsite/s);
  assert.match(output, /2 site\(s\): 1 OK, 0 warning\(s\), 1 error\(s\)/);
  assert.match(output, /Fix the ERROR site/);
});

test("omits the fix-errors hint when there are no errors", () => {
  const result: ValidateSitesResult = {
    sites: [{ slug: "goodsite", siteDir: "/sites/goodsite", level: "OK", checks: [] }],
    errorCount: 0,
    warningCount: 0,
    okCount: 1,
  };
  const output = formatValidateSites(result);
  assert.doesNotMatch(output, /Fix the ERROR site/);
});
