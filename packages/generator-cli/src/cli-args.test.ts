import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGenerateArgs, parseImportSitesArgs, parseValidateSitesArgs } from "./cli-args.js";

test("parses a bare site dir with no flags", () => {
  const result = parseGenerateArgs(["sites/golisimo"]);
  assert.equal(result.siteDir, "sites/golisimo");
  assert.equal(result.dryRun, false);
  assert.equal(result.verbose, false);
});

test("parses boolean flags", () => {
  const result = parseGenerateArgs(["sites/golisimo", "--dry-run", "--preview-only", "--skip-deploy", "--verbose"]);
  assert.equal(result.dryRun, true);
  assert.equal(result.previewOnly, true);
  assert.equal(result.skipDeploy, true);
  assert.equal(result.verbose, true);
});

test("parses --only= as a comma-separated stage list", () => {
  const result = parseGenerateArgs(["sites/golisimo", "--only=parse-docx,build"]);
  assert.deepEqual(result.only, ["parse-docx", "build"]);
});

test("leaves only undefined when --only isn't passed", () => {
  const result = parseGenerateArgs(["sites/golisimo"]);
  assert.equal(result.only, undefined);
});

test("works regardless of flag/positional order", () => {
  const result = parseGenerateArgs(["--dry-run", "sites/golisimo", "--verbose"]);
  assert.equal(result.siteDir, "sites/golisimo");
  assert.equal(result.dryRun, true);
  assert.equal(result.verbose, true);
});

test("throws on an unrecognized flag", () => {
  assert.throws(() => parseGenerateArgs(["sites/golisimo", "--not-a-real-flag"]), /Unknown flag/);
});

test("leaves siteDir undefined when no positional arg is given", () => {
  const result = parseGenerateArgs(["--dry-run"]);
  assert.equal(result.siteDir, undefined);
});

test("parses --all, --preview, --site=, --locale=, and --limit=", () => {
  const result = parseGenerateArgs(["--all", "--preview", "--site=luckyspin", "--locale=de-DE", "--limit=10"]);
  assert.equal(result.all, true);
  assert.equal(result.preview, true);
  assert.equal(result.site, "luckyspin");
  assert.equal(result.locale, "de-DE");
  assert.equal(result.limit, 10);
});

test("all/preview default to false and site/locale/limit default to undefined", () => {
  const result = parseGenerateArgs(["sites/golisimo"]);
  assert.equal(result.all, false);
  assert.equal(result.preview, false);
  assert.equal(result.site, undefined);
  assert.equal(result.locale, undefined);
  assert.equal(result.limit, undefined);
});

test("throws on a non-integer --limit", () => {
  assert.throws(() => parseGenerateArgs(["--all", "--limit=abc"]), /--limit must be a non-negative integer/);
});

test("throws on a negative --limit", () => {
  assert.throws(() => parseGenerateArgs(["--all", "--limit=-1"]), /--limit must be a non-negative integer/);
});

test("parseValidateSitesArgs parses --all, --site=, and --locale=", () => {
  const result = parseValidateSitesArgs(["--all", "--site=luckyspin", "--locale=de-DE"]);
  assert.equal(result.all, true);
  assert.equal(result.site, "luckyspin");
  assert.equal(result.locale, "de-DE");
});

test("parseValidateSitesArgs defaults all to false with no flags", () => {
  const result = parseValidateSitesArgs([]);
  assert.equal(result.all, false);
  assert.equal(result.site, undefined);
});

test("parseValidateSitesArgs throws on an unrecognized flag", () => {
  assert.throws(() => parseValidateSitesArgs(["--not-a-real-flag"]), /Unknown flag/);
});

test("parseImportSitesArgs parses a bare dataset path with no flags", () => {
  const result = parseImportSitesArgs(["data/casinos.json"]);
  assert.equal(result.datasetPath, "data/casinos.json");
  assert.equal(result.force, false);
  assert.equal(result.dryRun, false);
});

test("parseImportSitesArgs parses --force", () => {
  const result = parseImportSitesArgs(["data/casinos.json", "--force"]);
  assert.equal(result.force, true);
});

test("parseImportSitesArgs parses --dry-run", () => {
  const result = parseImportSitesArgs(["data/casinos.json", "--dry-run"]);
  assert.equal(result.dryRun, true);
  assert.equal(result.force, false);
});

test("parseImportSitesArgs parses --force and --dry-run together", () => {
  const result = parseImportSitesArgs(["data/casinos.json", "--force", "--dry-run"]);
  assert.equal(result.force, true);
  assert.equal(result.dryRun, true);
});

test("parseImportSitesArgs leaves datasetPath undefined when no positional arg is given", () => {
  const result = parseImportSitesArgs(["--force"]);
  assert.equal(result.datasetPath, undefined);
  assert.equal(result.force, true);
});

test("parseImportSitesArgs throws on an unrecognized flag", () => {
  assert.throws(() => parseImportSitesArgs(["--not-a-real-flag"]), /Unknown flag/);
});
