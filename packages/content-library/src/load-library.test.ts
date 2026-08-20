import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadContentLibrary } from "./load-library.js";

let rootDir: string;

before(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "load-library-test-"));

  await mkdir(path.join(rootDir, "en-US", "intro"), { recursive: true });
  await writeFile(
    path.join(rootDir, "en-US", "intro", "intro-001.md"),
    ["---", "id: intro-001", "---", "{{BRAND_NAME}} welcomes new players."].join("\n"),
  );

  await mkdir(path.join(rootDir, "skeletons"), { recursive: true });
  await writeFile(path.join(rootDir, "skeletons", "standard.json"), JSON.stringify({ id: "standard", sections: ["intro"] }));

  await writeFile(
    path.join(rootDir, "page-types.json"),
    JSON.stringify([{ id: "index", defaultSkeleton: "standard", allowedComponents: ["intro"] }]),
  );
});

after(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

test("combines discovery, skeletons, and page types from one root directory", async () => {
  const library = await loadContentLibrary(rootDir);
  assert.equal(library.entries.length, 1);
  assert.equal(library.entries[0].id, "intro-001");
  assert.equal(library.skeletons.length, 1);
  assert.equal(library.skeletons[0].id, "standard");
  assert.equal(library.pageTypes.length, 1);
  assert.equal(library.pageTypes[0].id, "index");
  assert.deepEqual(library.issues, []);
});

test("aggregates issues from all three sources without throwing", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "load-library-issues-"));
  // No skeletons/ dir, no page-types.json, no locale dirs at all.
  const library = await loadContentLibrary(dir);
  assert.deepEqual(library.entries, []);
  assert.deepEqual(library.skeletons, []);
  assert.deepEqual(library.pageTypes, []);
  assert.equal(library.issues.length, 2); // missing skeletons dir + missing page-types.json (empty root dir itself is not an issue)
  await rm(dir, { recursive: true, force: true });
});
