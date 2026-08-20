import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Casino, LanguageOption } from "schema";
import { assembleSite, buildLanguageOptions, resolveDefaultLocale } from "./assemble-site.js";
import { writeSiteContent } from "./generate-content.js";
import { sampleConfig, sampleParsedContent } from "./test-fixtures.js";

let workDir: string;
before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "generate-content-test-"));
});
after(async () => {
  await rm(workDir, { recursive: true, force: true });
});

type Imported = { siteLocales: Casino[]; languageOptions: LanguageOption[]; defaultLocale: string };

test("writes a .ts module that round-trips back to the same data via a real import", async () => {
  const config = sampleConfig();
  const en = assembleSite(sampleParsedContent("en"), config);
  const el = assembleSite(sampleParsedContent("el"), config);
  const outputPath = path.join(workDir, "content", "site.ts");

  await writeSiteContent([en, el], buildLanguageOptions(config), resolveDefaultLocale(config), outputPath);

  const imported = (await import(pathToFileURL(outputPath).href)) as Imported;
  assert.equal(imported.siteLocales.length, 2);
  assert.deepEqual(imported.siteLocales[0], en);
  assert.deepEqual(imported.siteLocales[1], el);
  assert.equal(imported.defaultLocale, "en");
  assert.deepEqual(imported.languageOptions, [
    { code: "en", label: "EN" },
    { code: "el", label: "EL" },
  ]);
});

test("creates parent directories that don't exist yet", async () => {
  const config = sampleConfig();
  const casino = assembleSite(sampleParsedContent(), config);
  const outputPath = path.join(workDir, "deeply", "nested", "content", "site.ts");

  await writeSiteContent([casino], buildLanguageOptions(config), resolveDefaultLocale(config), outputPath);

  const imported = (await import(pathToFileURL(outputPath).href)) as Imported;
  assert.equal(imported.siteLocales.length, 1);
});
