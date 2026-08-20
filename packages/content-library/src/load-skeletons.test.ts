import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadSkeletons } from "./load-skeletons.js";

let dir: string;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "load-skeletons-test-"));
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "standard.json"),
    JSON.stringify({ id: "standard", sections: ["intro", "bonus", "games", "faq", "cta"] }),
  );
  await writeFile(
    path.join(dir, "bonus-focused.json"),
    JSON.stringify({ id: "bonus-focused", sections: ["intro", "bonus", "bonus-terms", "faq", "cta"] }),
  );
  await writeFile(path.join(dir, "not-json.json"), "{ not valid json");
  await writeFile(path.join(dir, "invalid-shape.json"), JSON.stringify({ id: "broken" })); // missing `sections`
  await writeFile(path.join(dir, "duplicate.json"), JSON.stringify({ id: "standard", sections: ["intro"] }));
  await writeFile(path.join(dir, "readme.md"), "not a json file, should be ignored");
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("loads every well-formed skeleton file", async () => {
  const { skeletons } = await loadSkeletons(dir);
  const ids = skeletons.map((s) => s.id).sort();
  assert.deepEqual(ids, ["bonus-focused", "standard"]);
});

test("ignores non-.json files", async () => {
  const { skeletons } = await loadSkeletons(dir);
  assert.ok(!skeletons.some((s) => (s as unknown as { id: string }).id === "readme"));
});

test("reports invalid JSON as an issue, not a throw", async () => {
  const { issues } = await loadSkeletons(dir);
  assert.ok(issues.some((issue) => issue.includes("not-json.json")));
});

test("reports a schema-invalid file as an issue", async () => {
  const { issues } = await loadSkeletons(dir);
  assert.ok(issues.some((issue) => issue.includes("invalid-shape.json")));
});

test("reports a duplicate skeleton id as an issue and keeps only the first", async () => {
  const { skeletons, issues } = await loadSkeletons(dir);
  assert.equal(skeletons.filter((s) => s.id === "standard").length, 1);
  assert.ok(issues.some((issue) => issue.includes('duplicate skeleton id "standard"')));
});

test("returns an issue (not a throw) when the directory doesn't exist", async () => {
  const result = await loadSkeletons(path.join(dir, "does-not-exist"));
  assert.deepEqual(result.skeletons, []);
  assert.equal(result.issues.length, 1);
});
