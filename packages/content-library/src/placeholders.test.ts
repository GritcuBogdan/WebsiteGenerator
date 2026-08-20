import { test } from "node:test";
import assert from "node:assert/strict";
import type { SiteData } from "schema";
import {
  extractPlaceholders,
  isKnownPlaceholder,
  knownPlaceholders,
  resolvePlaceholders,
  validatePlaceholderTokens,
} from "./placeholders.js";

test("extractPlaceholders finds every unique {{TOKEN}}, in order of first appearance", () => {
  const tokens = extractPlaceholders("{{BRAND_NAME}} offers {{GAME_COUNT}} games. {{BRAND_NAME}} is great.");
  assert.deepEqual(tokens, ["BRAND_NAME", "GAME_COUNT"]);
});

test("extractPlaceholders returns an empty array when there are none", () => {
  assert.deepEqual(extractPlaceholders("Plain prose, no placeholders."), []);
});

test("isKnownPlaceholder / knownPlaceholders agree with each other", () => {
  for (const key of knownPlaceholders()) {
    assert.equal(isKnownPlaceholder(key), true);
  }
  assert.equal(isKnownPlaceholder("NOT_A_REAL_TOKEN"), false);
});

test("validatePlaceholderTokens flags an unsupported token", () => {
  const { unknown } = validatePlaceholderTokens("{{BRAND_NAME}} is licensed by {{REGULATOR}}.");
  assert.deepEqual(unknown, ["REGULATOR"]);
});

test("validatePlaceholderTokens reports no unknown tokens for valid text", () => {
  const { unknown } = validatePlaceholderTokens("{{BRAND_NAME}} has {{GAME_COUNT}} games.");
  assert.deepEqual(unknown, []);
});

test("resolvePlaceholders substitutes every token when all backing facts are present", () => {
  const data: SiteData = { brandName: "LuckySpin", gameCount: 2000 };
  const result = resolvePlaceholders("{{BRAND_NAME}} has {{GAME_COUNT}} games.", data, "en-US");
  assert.deepEqual(result, { ok: true, text: "LuckySpin has 2,000 games." });
});

test("resolvePlaceholders fails closed on an unknown token, without touching known ones", () => {
  const data: SiteData = { brandName: "LuckySpin" };
  const result = resolvePlaceholders("{{BRAND_NAME}} is {{AWARD_WINNING}}.", data, "en-US");
  assert.deepEqual(result, { ok: false, unknown: ["AWARD_WINNING"], missing: [] });
});

test("resolvePlaceholders fails closed when a known token's backing fact is missing", () => {
  const data: SiteData = { brandName: "LuckySpin" };
  const result = resolvePlaceholders("{{BRAND_NAME}} has {{GAME_COUNT}} games.", data, "en-US");
  assert.deepEqual(result, { ok: false, unknown: [], missing: ["GAME_COUNT"] });
});

test("resolvePlaceholders never fabricates a value for missing data — text is never returned alongside a failure", () => {
  const data: SiteData = {};
  const result = resolvePlaceholders("Deposit at least {{MINIMUM_DEPOSIT}}.", data, "en-US");
  assert.equal(result.ok, false);
  assert.ok(!("text" in result));
});

test("WELCOME_BONUS resolves from the nested welcomeBonus fact", () => {
  const data: SiteData = { welcomeBonus: { amount: 500, currency: "EUR", percentage: 100 } };
  const result = resolvePlaceholders("Get {{WELCOME_BONUS}} on your first deposit.", data, "en-US");
  assert.deepEqual(result, { ok: true, text: "Get €500 on your first deposit." });
});

test("MINIMUM_DEPOSIT formats with the welcome bonus's currency when present", () => {
  const data: SiteData = { minimumDeposit: 10, welcomeBonus: { amount: 500, currency: "EUR" } };
  const result = resolvePlaceholders("Minimum deposit: {{MINIMUM_DEPOSIT}}.", data, "en-US");
  assert.deepEqual(result, { ok: true, text: "Minimum deposit: €10." });
});

test("MINIMUM_DEPOSIT falls back to a plain number when no currency is available anywhere", () => {
  const data: SiteData = { minimumDeposit: 10 };
  const result = resolvePlaceholders("Minimum deposit: {{MINIMUM_DEPOSIT}}.", data, "en-US");
  assert.deepEqual(result, { ok: true, text: "Minimum deposit: 10." });
});

test("CURRENCY resolves from supportedCurrencies when there is no welcome bonus", () => {
  const data: SiteData = { supportedCurrencies: ["EUR", "USD"] };
  const result = resolvePlaceholders("We support {{CURRENCY}}.", data, "en-US");
  assert.deepEqual(result, { ok: true, text: "We support EUR." });
});

test("PAYMENT_METHODS / WITHDRAWAL_METHODS format as locale-aware lists", () => {
  const data: SiteData = { paymentMethods: ["Visa", "Mastercard"], withdrawalMethods: ["Bitcoin"] };
  const result = resolvePlaceholders("Deposit via {{PAYMENT_METHODS}}; withdraw via {{WITHDRAWAL_METHODS}}.", data, "en-US");
  assert.deepEqual(result, { ok: true, text: "Deposit via Visa and Mastercard; withdraw via Bitcoin." });
});

test("an empty paymentMethods array is treated the same as missing — resolution still fails closed", () => {
  const data: SiteData = { paymentMethods: [] };
  const result = resolvePlaceholders("Deposit via {{PAYMENT_METHODS}}.", data, "en-US");
  assert.deepEqual(result, { ok: false, unknown: [], missing: ["PAYMENT_METHODS"] });
});

test("NO_DEPOSIT_BONUS resolves from the nested noDepositBonus fact", () => {
  const data: SiteData = { noDepositBonus: { amount: 20, currency: "EUR" } };
  const result = resolvePlaceholders("Claim {{NO_DEPOSIT_BONUS}} with no deposit.", data, "en-US");
  assert.deepEqual(result, { ok: true, text: "Claim €20 with no deposit." });
});

test("NO_DEPOSIT_BONUS fails closed when absent, independently of welcomeBonus", () => {
  const data: SiteData = { welcomeBonus: { amount: 500, currency: "EUR" } };
  const result = resolvePlaceholders("Claim {{NO_DEPOSIT_BONUS}}.", data, "en-US");
  assert.deepEqual(result, { ok: false, unknown: [], missing: ["NO_DEPOSIT_BONUS"] });
});

test("FREE_SPINS_COUNT resolves from the nested freeSpins fact, locale-formatted", () => {
  const data: SiteData = { freeSpins: { count: 50 } };
  const result = resolvePlaceholders("Get {{FREE_SPINS_COUNT}} free spins.", data, "en-US");
  assert.deepEqual(result, { ok: true, text: "Get 50 free spins." });
});

test("PROMO_CODE resolves as a plain string", () => {
  const data: SiteData = { promoCode: "WELCOME50" };
  const result = resolvePlaceholders("Enter code {{PROMO_CODE}} at signup.", data, "en-US");
  assert.deepEqual(result, { ok: true, text: "Enter code WELCOME50 at signup." });
});
