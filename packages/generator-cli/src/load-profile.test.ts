import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadProfile } from "./load-profile.js";

let dir: string;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "load-profile-test-"));
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "dark-blue-casino.json"),
    JSON.stringify({ id: "dark-blue-casino", theme: { primary: "#2563EB", secondary: "#0F2747" } }),
  );
  await writeFile(path.join(dir, "not-json.json"), "{ not valid json");
  await writeFile(path.join(dir, "invalid-shape.json"), JSON.stringify({ theme: { primary: "#111" } })); // missing required `id`
  await writeFile(path.join(dir, "mismatched-id.json"), JSON.stringify({ id: "something-else" }));
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("loads a well-formed profile", () => {
  const result = loadProfile(dir, "dark-blue-casino");
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.profile.id, "dark-blue-casino");
    assert.equal(result.profile.theme?.primary, "#2563EB");
  }
});

test("fails with an issue (not a throw) when the profile file doesn't exist", () => {
  const result = loadProfile(dir, "does-not-exist");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.issue, /not found/);
});

test("fails on invalid JSON", () => {
  const result = loadProfile(dir, "not-json");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.issue, /invalid JSON/);
});

test("fails on a schema-invalid profile (missing required id)", () => {
  const result = loadProfile(dir, "invalid-shape");
  assert.equal(result.ok, false);
});

test("fails when the file's own id doesn't match the id it was requested by", () => {
  const result = loadProfile(dir, "mismatched-id");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.issue, /expected "mismatched-id"/);
});
