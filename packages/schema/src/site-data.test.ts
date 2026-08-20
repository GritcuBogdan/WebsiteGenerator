import { test } from "node:test";
import assert from "node:assert/strict";
import { siteDataSchema } from "./site-data.js";

test("an empty object is valid — every field is optional", () => {
  const result = siteDataSchema.safeParse({});
  assert.equal(result.success, true);
});

test("accepts a fully-populated site data object", () => {
  const result = siteDataSchema.safeParse({
    brandName: "LuckySpin",
    foundedYear: 2020,
    welcomeBonus: { amount: 500, currency: "EUR", percentage: 100 },
    minimumDeposit: 10,
    gameCount: 2000,
    paymentMethods: ["Visa", "Mastercard", "Bitcoin"],
    withdrawalMethods: ["Visa", "Bitcoin"],
    supportedCurrencies: ["EUR"],
    profile: "dark-blue-casino",
    contentVersion: "v1",
    skeleton: "bonus-focused",
    pages: ["index", "review", "bonus"],
    images: { hero: "hero.webp", logo: "logo.png", slots: ["slots-01.webp", "slots-02.webp"] },
    noDepositBonus: { amount: 20, currency: "EUR" },
    freeSpins: { count: 50 },
    promoCode: "WELCOME50",
  });
  assert.equal(result.success, true);
});

test("rejects a noDepositBonus missing its required amount/currency", () => {
  const result = siteDataSchema.safeParse({ noDepositBonus: { amount: 20 } });
  assert.equal(result.success, false);
});

test("rejects a non-positive freeSpins count", () => {
  const result = siteDataSchema.safeParse({ freeSpins: { count: 0 } });
  assert.equal(result.success, false);
});

test("rejects an empty promoCode string", () => {
  const result = siteDataSchema.safeParse({ promoCode: "" });
  assert.equal(result.success, false);
});

test("rejects a welcomeBonus missing its required amount/currency", () => {
  const result = siteDataSchema.safeParse({ welcomeBonus: { percentage: 100 } });
  assert.equal(result.success, false);
});

test("rejects a negative gameCount", () => {
  const result = siteDataSchema.safeParse({ gameCount: -5 });
  assert.equal(result.success, false);
});

test("allows minimumDeposit of exactly 0", () => {
  const result = siteDataSchema.safeParse({ minimumDeposit: 0 });
  assert.equal(result.success, true);
});

test("images accepts both single strings and arrays as role values", () => {
  const result = siteDataSchema.safeParse({
    images: { logo: "logo.png", slots: ["a.webp", "b.webp"] },
  });
  assert.equal(result.success, true);
});
