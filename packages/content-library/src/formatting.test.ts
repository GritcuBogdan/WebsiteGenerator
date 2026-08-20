import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCurrencyAmount, formatList, formatNumber } from "./formatting.js";

test("formatList joins with an English conjunction for en-US", () => {
  assert.equal(formatList(["Visa", "Mastercard", "Bitcoin"], "en-US"), "Visa, Mastercard, and Bitcoin");
});

test("formatList joins with a German conjunction for de-DE, not an English-style comma list", () => {
  assert.equal(formatList(["Visa", "Mastercard", "Bitcoin"], "de-DE"), "Visa, Mastercard und Bitcoin");
});

test("formatList handles a single item with no separator", () => {
  assert.equal(formatList(["Visa"], "en-US"), "Visa");
});

test("formatNumber groups thousands per locale (en-US uses commas)", () => {
  assert.equal(formatNumber(2000, "en-US"), "2,000");
});

test("formatNumber groups thousands per locale (de-DE uses periods)", () => {
  assert.equal(formatNumber(2000, "de-DE"), "2.000");
});

test("formatCurrencyAmount renders a whole amount with no decimals", () => {
  assert.equal(formatCurrencyAmount(500, "EUR", "en-US"), "€500");
});

test("formatCurrencyAmount renders a fractional amount with decimals", () => {
  assert.equal(formatCurrencyAmount(10.5, "EUR", "en-US"), "€10.50");
});

test("formatCurrencyAmount degrades to a plain number + code for an invalid currency, rather than throwing", () => {
  assert.equal(formatCurrencyAmount(500, "NOTREAL", "en-US"), "500 NOTREAL");
});
