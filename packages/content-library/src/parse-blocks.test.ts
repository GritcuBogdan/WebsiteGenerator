import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBody } from "./parse-blocks.js";

test("plain prose with no table/list syntax parses to one paragraphs block, same as the old plain splitter", () => {
  const blocks = parseBody("First paragraph.\n\nSecond   paragraph\nstill going.");
  assert.deepEqual(blocks, [{ type: "paragraphs", paragraphs: ["First paragraph.", "Second paragraph still going."] }]);
});

test("a body with only whitespace produces no blocks at all", () => {
  assert.deepEqual(parseBody("   \n\n  "), []);
});

test("parses a markdown table with a header, separator, and data rows", () => {
  const body = ["| Method | Fee |", "| --- | --- |", "| Visa | None |", "| Bank Transfer | 1% |"].join("\n");
  const blocks = parseBody(body);
  assert.deepEqual(blocks, [
    {
      type: "table",
      columns: ["Method", "Fee"],
      rows: [
        ["Visa", "None"],
        ["Bank Transfer", "1%"],
      ],
    },
  ]);
});

test("a table with no separator row still parses — everything after the header is a data row", () => {
  const body = ["| Method | Fee |", "| Visa | None |"].join("\n");
  const blocks = parseBody(body);
  assert.deepEqual(blocks, [{ type: "table", columns: ["Method", "Fee"], rows: [["Visa", "None"]] }]);
});

test("parses a bulleted list with no title", () => {
  const blocks = parseBody("- First item\n- Second item\n* Third item (asterisk form)");
  assert.deepEqual(blocks, [{ type: "list", title: undefined, items: ["First item", "Second item", "Third item (asterisk form)"] }]);
});

test("a colon-ending line immediately before a list becomes its title, not a separate paragraph", () => {
  const blocks = parseBody("Available payment methods:\n- Visa\n- Mastercard");
  assert.deepEqual(blocks, [{ type: "list", title: "Available payment methods", items: ["Visa", "Mastercard"] }]);
});

test("a non-colon line before a list stays its own paragraph, list has no title", () => {
  const blocks = parseBody("Here is some context.\n- Visa\n- Mastercard");
  assert.deepEqual(blocks, [
    { type: "paragraphs", paragraphs: ["Here is some context."] },
    { type: "list", title: undefined, items: ["Visa", "Mastercard"] },
  ]);
});

test("prose, a table, and a list can appear together in original order", () => {
  const body = [
    "An intro paragraph.",
    "",
    "| A | B |",
    "| --- | --- |",
    "| 1 | 2 |",
    "",
    "Some notes:",
    "- one",
    "- two",
    "",
    "A closing paragraph.",
  ].join("\n");
  const blocks = parseBody(body);
  assert.deepEqual(blocks, [
    { type: "paragraphs", paragraphs: ["An intro paragraph."] },
    { type: "table", columns: ["A", "B"], rows: [["1", "2"]] },
    { type: "list", title: "Some notes", items: ["one", "two"] },
    { type: "paragraphs", paragraphs: ["A closing paragraph."] },
  ]);
});

test("placeholders inside table cells and list items are preserved verbatim (resolution happens elsewhere)", () => {
  const body = ["| Fact | Value |", "| --- | --- |", "| Bonus | {{WELCOME_BONUS}} |"].join("\n");
  const blocks = parseBody(body);
  assert.deepEqual(blocks, [{ type: "table", columns: ["Fact", "Value"], rows: [["Bonus", "{{WELCOME_BONUS}}"]] }]);
});
