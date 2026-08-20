import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, FrontmatterError } from "./frontmatter.js";

test("parses a well-formed frontmatter block plus body", () => {
  const raw = ["---", "id: bonus-003", "component: bonus", "requires: [welcomeBonus, minimumDeposit]", "---", "", "Body text here."].join(
    "\n",
  );
  const { data, body } = parseFrontmatter(raw);
  assert.deepEqual(data, {
    id: "bonus-003",
    component: "bonus",
    requires: ["welcomeBonus", "minimumDeposit"],
  });
  assert.equal(body, "Body text here.");
});

test("a file with no leading '---' is treated as pure body, empty data", () => {
  const { data, body } = parseFrontmatter("Just some prose, no frontmatter at all.");
  assert.deepEqual(data, {});
  assert.equal(body, "Just some prose, no frontmatter at all.");
});

test("preserves multi-paragraph body content", () => {
  const raw = ["---", "id: intro-001", "---", "First paragraph.", "", "Second paragraph."].join("\n");
  const { body } = parseFrontmatter(raw);
  assert.equal(body, "First paragraph.\n\nSecond paragraph.");
});

test("an empty bracket value parses to an empty array", () => {
  const raw = ["---", "requires: []", "---", "Body."].join("\n");
  const { data } = parseFrontmatter(raw);
  assert.deepEqual(data.requires, []);
});

test("a single-item bracket value still parses to an array", () => {
  const raw = ["---", "requires: [minimumDeposit]", "---", "Body."].join("\n");
  const { data } = parseFrontmatter(raw);
  assert.deepEqual(data.requires, ["minimumDeposit"]);
});

test("throws FrontmatterError when the closing '---' is missing", () => {
  const raw = ["---", "id: bonus-003", "Body without a closing delimiter."].join("\n");
  assert.throws(() => parseFrontmatter(raw), FrontmatterError);
});

test("throws FrontmatterError on a line with no colon", () => {
  const raw = ["---", "id bonus-003", "---", "Body."].join("\n");
  assert.throws(() => parseFrontmatter(raw), FrontmatterError);
});

test("throws FrontmatterError on a line with an empty key", () => {
  const raw = ["---", ": bonus-003", "---", "Body."].join("\n");
  assert.throws(() => parseFrontmatter(raw), FrontmatterError);
});

test("normalizes CRLF line endings before parsing", () => {
  const raw = "---\r\nid: bonus-003\r\n---\r\nBody text.";
  const { data, body } = parseFrontmatter(raw);
  assert.equal(data.id, "bonus-003");
  assert.equal(body, "Body text.");
});
