import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDotenv } from "./parse-dotenv.js";

test("parses simple KEY=VALUE lines", () => {
  assert.deepEqual(parseDotenv("FOO=bar\nBAZ=qux"), { FOO: "bar", BAZ: "qux" });
});

test("ignores blank lines and # comments", () => {
  const content = ["# a comment", "", "FOO=bar", "  ", "# another comment", "BAZ=qux"].join("\n");
  assert.deepEqual(parseDotenv(content), { FOO: "bar", BAZ: "qux" });
});

test("strips matching surrounding quotes", () => {
  assert.deepEqual(parseDotenv('FOO="bar baz"\nQUX=\'quux\''), { FOO: "bar baz", QUX: "quux" });
});

test("trims whitespace around keys and values", () => {
  assert.deepEqual(parseDotenv("  FOO   =   bar  "), { FOO: "bar" });
});

test("ignores lines with no '=' at all", () => {
  assert.deepEqual(parseDotenv("not a valid line\nFOO=bar"), { FOO: "bar" });
});

test("allows an empty value", () => {
  assert.deepEqual(parseDotenv("FOO="), { FOO: "" });
});

test("a value can itself contain '=' characters", () => {
  assert.deepEqual(parseDotenv("FOO=a=b=c"), { FOO: "a=b=c" });
});
