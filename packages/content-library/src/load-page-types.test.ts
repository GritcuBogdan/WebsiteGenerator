import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadPageTypes } from "./load-page-types.js";

let dir: string;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "load-page-types-test-"));
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("loads a well-formed page-types.json", async () => {
  const filePath = path.join(dir, "page-types.json");
  await writeFile(
    filePath,
    JSON.stringify([
      { id: "review", defaultSkeleton: "standard", allowedComponents: ["intro", "bonus", "games", "faq", "cta"] },
      { id: "bonus", defaultSkeleton: "bonus-focused", allowedComponents: ["intro", "bonus", "bonus-terms", "faq", "cta"] },
    ]),
  );
  const { pageTypes, issues } = await loadPageTypes(filePath);
  assert.deepEqual(issues, []);
  assert.deepEqual(pageTypes.map((p) => p.id).sort(), ["bonus", "review"]);
});

test("reports invalid JSON as an issue, not a throw", async () => {
  const filePath = path.join(dir, "broken.json");
  await writeFile(filePath, "{ not valid json");
  const { pageTypes, issues } = await loadPageTypes(filePath);
  assert.deepEqual(pageTypes, []);
  assert.equal(issues.length, 1);
});

test("reports a schema-invalid array as an issue", async () => {
  const filePath = path.join(dir, "bad-shape.json");
  await writeFile(filePath, JSON.stringify([{ id: "review" }])); // missing defaultSkeleton/allowedComponents
  const { pageTypes, issues } = await loadPageTypes(filePath);
  assert.deepEqual(pageTypes, []);
  assert.equal(issues.length, 1);
});

test("reports a duplicate page type id as an issue and keeps only the first", async () => {
  const filePath = path.join(dir, "dup.json");
  await writeFile(
    filePath,
    JSON.stringify([
      { id: "review", defaultSkeleton: "standard", allowedComponents: ["intro"] },
      { id: "review", defaultSkeleton: "other", allowedComponents: ["intro"] },
    ]),
  );
  const { pageTypes, issues } = await loadPageTypes(filePath);
  assert.equal(pageTypes.length, 1);
  assert.equal(pageTypes[0].defaultSkeleton, "standard");
  assert.ok(issues.some((issue) => issue.includes('duplicate page type id "review"')));
});

test("returns an issue (not a throw) when the file doesn't exist", async () => {
  const result = await loadPageTypes(path.join(dir, "does-not-exist.json"));
  assert.deepEqual(result.pageTypes, []);
  assert.equal(result.issues.length, 1);
});
