import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { newSite } from "./new-site.js";
import { siteConfigSchema } from "schema";

let workDir: string;
before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "new-site-test-"));
});
after(async () => {
  await rm(workDir, { recursive: true, force: true });
});

test("scaffolds config.json, README.md, and an images/ directory", () => {
  const siteDir = newSite("demo-casino", workDir);
  assert.equal(siteDir, path.join(workDir, "demo-casino"));
  assert.ok(existsSync(path.join(siteDir, "config.json")));
  assert.ok(existsSync(path.join(siteDir, "README.md")));
  assert.ok(existsSync(path.join(siteDir, "images")));
});

test("the scaffolded config.json is already schema-valid", async () => {
  const siteDir = newSite("valid-casino", workDir);
  const config = JSON.parse(await readFile(path.join(siteDir, "config.json"), "utf-8"));
  const result = siteConfigSchema.safeParse(config);
  assert.equal(result.success, true);
});

test("rejects a slug with invalid characters", () => {
  assert.throws(() => newSite("Not A Valid Slug!", workDir), /Invalid slug/);
});

test("refuses to overwrite an existing site directory", () => {
  newSite("collision-casino", workDir);
  assert.throws(() => newSite("collision-casino", workDir), /already exists/);
});
