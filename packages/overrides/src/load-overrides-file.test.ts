import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadOverridesFile } from "./load-overrides-file.js";

let workDir: string;

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "overrides-test-"));
});

after(async () => {
  await rm(workDir, { recursive: true, force: true });
});

test("returns undefined when the file does not exist", async () => {
  const result = await loadOverridesFile(path.join(workDir, "missing.json"));
  assert.equal(result, undefined);
});

test("loads and validates a well-formed overrides file", async () => {
  const filePath = path.join(workDir, "valid.json");
  await writeFile(
    filePath,
    JSON.stringify({
      pages: { index: { title: "Corrected Title" } },
    }),
  );
  const result = await loadOverridesFile(filePath);
  assert.deepEqual(result, { pages: { index: { title: "Corrected Title" } } });
});

test("throws on a field name that doesn't exist in the schema (e.g. a typo)", async () => {
  const filePath = path.join(workDir, "typo.json");
  await writeFile(
    filePath,
    JSON.stringify({
      pages: { index: { paragraph: ["oops, should be 'paragraphs'"] } },
    }),
  );
  await assert.rejects(() => loadOverridesFile(filePath));
});

test("throws on invalid JSON", async () => {
  const filePath = path.join(workDir, "broken.json");
  await writeFile(filePath, "{ not valid json");
  await assert.rejects(() => loadOverridesFile(filePath));
});
