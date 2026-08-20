import { test } from "node:test";
import assert from "node:assert/strict";
import { translate } from "./casino-v1-translations.js";

test("resolves a bare language-subtag locale directly", () => {
  assert.equal(translate("de", "intro.ctaText"), "Bonus sichern");
});

test("REGRESSION: a region-qualified locale (de-DE) resolves the same dictionary as its bare subtag (de), not English", () => {
  assert.equal(translate("de-DE", "intro.ctaText"), "Bonus sichern");
  assert.equal(translate("nl-NL", "intro.ctaText"), "Bonus claimen");
});

test("an exact region-qualified match wins over the bare-subtag dictionary, if one is ever added", () => {
  // en-US has no dedicated dictionary today, so this exercises the subtag
  // fallback path down to "en" rather than a real override — still proves
  // dictionaries[locale] is tried before dictionaries[languageSubtag].
  assert.equal(translate("en-US", "intro.ctaText"), "Claim Bonus");
});

test("fi-FI and sv-SE now have real dictionaries (region-qualified resolves via the bare subtag)", () => {
  assert.equal(translate("fi-FI", "intro.ctaText"), "Lunasta bonus");
  assert.equal(translate("sv-SE", "intro.ctaText"), "Hämta bonus");
});

test("a locale with genuinely no dictionary (bare or region-qualified) still falls back to English", () => {
  assert.equal(translate("pt-BR", "intro.ctaText"), "Claim Bonus");
});

test("the new promoBanner keys resolve per locale", () => {
  assert.equal(translate("en", "promoBanner.heading"), "Ready to Get Started?");
  assert.equal(translate("de-DE", "promoBanner.overlayText"), "Ihr Willkommensbonus wartet auf Sie");
});

test("throws on a genuinely unknown key rather than returning undefined", () => {
  assert.throws(() => translate("en", "not.a.real.key"), /Unknown casino-v1 translation key/);
});
