import { test } from "node:test";
import assert from "node:assert/strict";
import { casinoDatasetRowSchema, casinoDatasetSchema } from "./casino-dataset.js";

function sampleRow(overrides: Record<string, unknown> = {}) {
  return {
    slug: "luckyspin",
    domain: "luckyspin.com",
    affiliateUrl: "https://affiliate.example/track?id=luckyspin",
    locale: "de-DE",
    ...overrides,
  };
}

test("accepts the minimal required row (no facts, no profile)", () => {
  const result = casinoDatasetRowSchema.safeParse(sampleRow());
  assert.equal(result.success, true);
});

test("rejects a row missing affiliateUrl", () => {
  const { affiliateUrl: _drop, ...row } = sampleRow();
  const result = casinoDatasetRowSchema.safeParse(row);
  assert.equal(result.success, false);
});

test("rejects an affiliateUrl that isn't a valid URL", () => {
  const result = casinoDatasetRowSchema.safeParse(sampleRow({ affiliateUrl: "not-a-url" }));
  assert.equal(result.success, false);
});

test("merges in SiteData facts fields directly on the row", () => {
  const result = casinoDatasetRowSchema.safeParse(
    sampleRow({
      brandName: "LuckySpin",
      welcomeBonus: { amount: 500, currency: "EUR", percentage: 100 },
      gameCount: 2000,
      paymentMethods: ["Visa", "Mastercard"],
    }),
  );
  assert.equal(result.success, true);
});

test("accepts an explicit profile and contentSource", () => {
  const result = casinoDatasetRowSchema.safeParse(
    sampleRow({ profile: "dark-blue-casino", contentSource: "library" }),
  );
  assert.equal(result.success, true);
});

test("rejects an unknown contentSource value", () => {
  const result = casinoDatasetRowSchema.safeParse(sampleRow({ contentSource: "cms" }));
  assert.equal(result.success, false);
});

test("casinoDatasetSchema validates a full dataset array, isolating which row is bad", () => {
  const dataset = [sampleRow({ slug: "luckyspin" }), sampleRow({ slug: "goldrush", affiliateUrl: "nope" })];
  const result = casinoDatasetSchema.safeParse(dataset);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((issue) => issue.path[0] === 1));
  }
});
