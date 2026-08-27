import { test } from "node:test";
import assert from "node:assert/strict";
import type { SiteData } from "schema";
import {
  buildPagesSeo,
  buildPageSeoStrings,
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  type SeoContext,
  type SeoPage,
} from "./build-page-seo.js";
import { countryName, countryForTitle, localizedPlace } from "./seo-geo-names.js";
import { fitFragments } from "./seo-fit.js";

// Every page slug the generator can produce: the standard set, the six
// legal slugs (the formula applies to those too - they are not exempt),
// and a free-text docx slug.
const PAGE_SLUGS = [
  "index",
  "review",
  "bonus",
  "withdrawal",
  "slots",
  "login",
  "application",
  "registration",
  "no-deposit-bonus",
  "free-spins",
  "promo-code",
  "privacy-policy",
  "cookies-policy",
  "terms-conditions",
  "betting-rules",
  "responsible-gaming",
  "contacts",
  "casino-app-on-your-smartphone",
];

// Locale (the language) paired with geo (the market). de-DE/CH and the
// en-US + et-EE pair are the deliberately divergent cases: a German-language
// site licensed for Switzerland, and one Estonian market addressed in two
// languages.
const LOCALES: Array<{ locale: string; geo: string }> = [
  { locale: "en-US", geo: "CA" },
  { locale: "en-US", geo: "NL" },
  { locale: "de-DE", geo: "CH" },
  { locale: "de-DE", geo: "DE" },
  { locale: "nl-NL", geo: "NL" },
  { locale: "fi-FI", geo: "FI" },
  { locale: "sv-SE", geo: "SE" },
  { locale: "el-GR", geo: "GR" },
  { locale: "no", geo: "NO" },
  { locale: "et-EE", geo: "EE" },
  { locale: "en-US", geo: "EE" },
  { locale: "hu-HU", geo: "HU" },
  // A market with no entry in Finnish's case table - must degrade to the
  // plain construction, not to a guessed inflection.
  { locale: "fi-FI", geo: "MX" },
  // An unknown locale must fall back to English, never fail the build.
  { locale: "pt-BR", geo: "BR" },
];

type HostileCase = {
  name: string;
  brandName: string;
  siteData: SiteData;
  pageTitle?: (slug: string) => string;
  // False where the input is pathological enough that the contract is
  // mathematically unsatisfiable (a brand alone longer than the whole
  // title budget). The length ceilings still hold there - they are the
  // part that must never break.
  fullContract: boolean;
};

const PAYMENTS = ["Visa", "Mastercard", "Skrill", "Neteller", "Trustly"];

const HOSTILE_CASES: HostileCase[] = [
  {
    name: "ordinary site",
    brandName: "BetWest",
    siteData: { welcomeBonus: { amount: 500, currency: "CAD" }, freeSpins: { count: 50 }, paymentMethods: PAYMENTS },
    fullContract: true,
  },
  {
    name: "four-letter brand",
    brandName: "Nutz",
    siteData: { welcomeBonus: { amount: 100, currency: "EUR" }, paymentMethods: ["Visa"] },
    fullContract: true,
  },
  {
    name: "no facts at all (nothing may be invented)",
    brandName: "Barebones Casino",
    siteData: {},
    fullContract: true,
  },
  {
    name: "long brand",
    brandName: "Grand Imperial Palace Casino",
    siteData: { welcomeBonus: { amount: 1500, currency: "EUR" }, freeSpins: { count: 250 }, paymentMethods: PAYMENTS },
    fullContract: true,
  },
  {
    name: "huge bonus and spin counts",
    brandName: "BetWest",
    siteData: {
      welcomeBonus: { amount: 999_999_999, currency: "EUR" },
      freeSpins: { count: 99_999 },
      paymentMethods: PAYMENTS,
    },
    fullContract: true,
  },
  {
    name: "long free-text page titles",
    brandName: "BetWest",
    siteData: { welcomeBonus: { amount: 500, currency: "CAD" }, paymentMethods: PAYMENTS },
    pageTitle: (slug) =>
      `${slug.replace(/-/g, " ")} - everything you need to know about playing at BetWest in 2026 - full guide`,
    fullContract: true,
  },
  {
    name: "brand longer than the entire title budget",
    brandName: "B".repeat(300),
    siteData: { welcomeBonus: { amount: 500, currency: "CAD" }, paymentMethods: PAYMENTS },
    fullContract: false,
  },
];

function humanize(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function pagesFor(hostile: HostileCase): SeoPage[] {
  return PAGE_SLUGS.map((slug) => ({ slug, title: hostile.pageTitle ? hostile.pageTitle(slug) : humanize(slug) }));
}

// The geo is "named" by any of the forms the two strings legitimately use:
// the nominative (titles), the inflected locative (descriptions), or the
// bare code (the last-resort title variant).
function namesGeo(text: string, locale: string, geo: string): boolean {
  const nominative = countryName(locale, geo);
  const place = localizedPlace(locale, geo);
  return (
    (nominative !== undefined && text.includes(nominative)) ||
    (place !== undefined && text.includes(place.text)) ||
    text.includes(geo)
  );
}

test("every page slug x every locale x hostile inputs stays inside the 70/170 budget", () => {
  for (const hostile of HOSTILE_CASES) {
    for (const { locale, geo } of LOCALES) {
      const ctx: SeoContext = { brandName: hostile.brandName, locale, geo, siteData: hostile.siteData };
      const built = buildPagesSeo(pagesFor(hostile), ctx);

      for (const [slug, strings] of built) {
        const where = `${hostile.name} / ${locale} / ${geo} / ${slug}`;
        assert.ok(
          strings.title.length > 0 && strings.title.length <= TITLE_MAX_LENGTH,
          `title length ${strings.title.length} for ${where}: ${strings.title}`,
        );
        assert.ok(
          strings.description.length > 0 && strings.description.length <= DESCRIPTION_MAX_LENGTH,
          `description length ${strings.description.length} for ${where}: ${strings.description}`,
        );
      }
    }
  }
});

test("every title and description names the brand and the geo", () => {
  for (const hostile of HOSTILE_CASES.filter((entry) => entry.fullContract)) {
    for (const { locale, geo } of LOCALES) {
      const ctx: SeoContext = { brandName: hostile.brandName, locale, geo, siteData: hostile.siteData };
      const built = buildPagesSeo(pagesFor(hostile), ctx);

      for (const [slug, strings] of built) {
        const where = `${hostile.name} / ${locale} / ${geo} / ${slug}`;
        assert.ok(strings.title.includes(hostile.brandName), `title misses brand for ${where}: ${strings.title}`);
        assert.ok(
          strings.description.includes(hostile.brandName),
          `description misses brand for ${where}: ${strings.description}`,
        );
        assert.ok(namesGeo(strings.title, locale, geo), `title misses geo for ${where}: ${strings.title}`);
        assert.ok(
          namesGeo(strings.description, locale, geo),
          `description misses geo for ${where}: ${strings.description}`,
        );
      }
    }
  }
});

test("no two pages of a site share a title", () => {
  for (const hostile of HOSTILE_CASES) {
    for (const { locale, geo } of LOCALES) {
      const ctx: SeoContext = { brandName: hostile.brandName, locale, geo, siteData: hostile.siteData };
      const titles = [...buildPagesSeo(pagesFor(hostile), ctx).values()].map((strings) => strings.title);
      assert.equal(
        new Set(titles).size,
        titles.length,
        `duplicate title for ${hostile.name} / ${locale} / ${geo}: ${titles.filter((title, index) => titles.indexOf(title) !== index).join(", ")}`,
      );
    }
  }
});

test("matches the contract's worked example", () => {
  const ctx: SeoContext = {
    brandName: "BetWest",
    locale: "en-US",
    geo: "CA",
    siteData: { welcomeBonus: { amount: 500, currency: "CAD" }, paymentMethods: ["Visa", "Mastercard", "Skrill"] },
  };
  const home = buildPageSeoStrings({ slug: "index", title: "BetWest" }, ctx);
  assert.equal(home.title, "BetWest™ — Official Site | Online Casino for Canada | Up to CAD 500");
  assert.ok(home.description.startsWith("BetWest: slots, live casino and fast payouts in CAD for players in Canada."));
});

test("no bonus data means no bonus fragment, never a fabricated offer", () => {
  const ctx: SeoContext = { brandName: "BetWest", locale: "en-US", geo: "CA", siteData: {} };
  const { title } = buildPageSeoStrings({ slug: "bonus", title: "Bonus" }, ctx);
  assert.equal(title, "Bonus — BetWest | Online Casino for Canada");
  assert.doesNotMatch(title, /\d/);
});

test("crypto is named in every description, with or without payment methods on file", () => {
  const withMethods = buildPageSeoStrings(
    { slug: "index", title: "Home" },
    { brandName: "BetWest", locale: "en-US", geo: "CA", siteData: { paymentMethods: ["Visa", "Skrill"] } },
  );
  assert.match(withMethods.description, /Pay by Visa, Skrill or crypto\./);

  const withoutMethods = buildPageSeoStrings(
    { slug: "index", title: "Home" },
    { brandName: "BetWest", locale: "en-US", geo: "CA", siteData: {} },
  );
  assert.match(withoutMethods.description, /crypto/i);
});

test("optional fragments shrink back to front: advice goes before payment method names are downgraded", () => {
  const ctx: SeoContext = {
    brandName: "Grand Imperial Palace Casino",
    locale: "en-US",
    geo: "NL",
    siteData: {
      welcomeBonus: { amount: 1500, currency: "EUR" },
      paymentMethods: ["Mastercard", "Bank Transfer", "Interac e-Transfer"],
    },
  };
  const { description } = buildPageSeoStrings({ slug: "index", title: "Home" }, ctx);
  assert.match(description, /Mastercard/);
  assert.doesNotMatch(description, /before you join/);
});

test("required fragments shrink front to back: a long page label never crowds the country out", () => {
  const ctx: SeoContext = {
    brandName: "Grand Imperial Palace Casino",
    locale: "de-DE",
    geo: "CH",
    siteData: { welcomeBonus: { amount: 500, currency: "EUR" } },
  };
  const { title } = buildPageSeoStrings({ slug: "terms-conditions", title: "Allgemeine Geschäftsbedingungen" }, ctx);
  assert.ok(title.length <= TITLE_MAX_LENGTH);
  assert.match(title, /Schweiz/);
  assert.match(title, /Grand Imperial Palace Casino/);
});

test("legal pages get the same formula as every other page", () => {
  const ctx: SeoContext = {
    brandName: "BetWest",
    locale: "de-DE",
    geo: "CH",
    siteData: { welcomeBonus: { amount: 500, currency: "EUR" } },
  };
  const { title, description } = buildPageSeoStrings(
    { slug: "privacy-policy", title: "Datenschutzerklärung" },
    ctx,
  );
  assert.match(title, /Datenschutz/);
  assert.match(title, /Online Casino Schweiz/);
  assert.match(description, /BetWest/);
  assert.match(description, /in der Schweiz/);
});

test("page names come from the localized labels, not from humanizing an English slug", () => {
  const de = buildPageSeoStrings(
    { slug: "free-spins", title: "Free Spins" },
    { brandName: "BetWest", locale: "de-DE", geo: "DE", siteData: {} },
  );
  assert.match(de.title, /^Freispiele/);

  const fi = buildPageSeoStrings(
    { slug: "withdrawal", title: "Withdrawal" },
    { brandName: "BetWest", locale: "fi-FI", geo: "FI", siteData: {} },
  );
  assert.match(fi.title, /^Kotiutus/);
});

test("a free-text docx slug keeps its own title rather than a humanized slug, and doesn't repeat the brand", () => {
  const { title } = buildPageSeoStrings(
    { slug: "casino-app-on-your-smartphone", title: "Casino App On Your Smartphone - BetWest" },
    { brandName: "BetWest", locale: "en-US", geo: "CA", siteData: {} },
  );
  assert.match(title, /Casino App/);
  assert.equal(title.match(/BetWest/g)?.length, 1);
});

test("Intl gives the nominative for titles; descriptions get the inflected or article form", () => {
  assert.equal(countryForTitle("de-DE", "CH"), "Schweiz");
  assert.equal(countryForTitle("en-US", "CA"), "for Canada");
  assert.equal(countryForTitle("en-US", "NL"), "for the Netherlands");
  assert.equal(countryForTitle("fi-FI", "FI"), "Suomi");

  assert.deepEqual(localizedPlace("de-DE", "CH"), { text: "in der Schweiz", inflected: true });
  assert.deepEqual(localizedPlace("fi-FI", "FI"), { text: "Suomessa", inflected: true });
  assert.deepEqual(localizedPlace("et-EE", "EE"), { text: "Eestis", inflected: true });
  assert.deepEqual(localizedPlace("hu-HU", "HU"), { text: "Magyarországon", inflected: true });
  assert.deepEqual(localizedPlace("el-GR", "CH"), { text: "στην Ελβετία", inflected: true });
});

test("a market missing from a case table falls back to plain wording, not a guessed inflection", () => {
  const place = localizedPlace("fi-FI", "MX");
  assert.deepEqual(place, { text: "Meksiko", inflected: false });

  const { description } = buildPageSeoStrings(
    { slug: "index", title: "Etusivu" },
    { brandName: "BetWest", locale: "fi-FI", geo: "MX", siteData: {} },
  );
  assert.match(description, /Kohdemaa: Meksiko\./);
  assert.doesNotMatch(description, /Meksikossa/);
});

test("CLDR placeholder regions are never rendered as a country", () => {
  assert.equal(countryName("en-US", "ZZ"), undefined);
  assert.equal(countryName("en-US", "XA"), undefined);
  assert.equal(countryName("en-US", "ch"), undefined); // lowercase never reaches Intl
});

test("an unknown locale falls back to English instead of failing", () => {
  const { title, description } = buildPageSeoStrings(
    { slug: "bonus", title: "Bonus" },
    { brandName: "BetWest", locale: "pt-BR", geo: "BR", siteData: { welcomeBonus: { amount: 500, currency: "BRL" } } },
  );
  assert.match(title, /Online Casino/);
  assert.match(description, /slots/);
  // The country name itself still comes from Intl in the site's own
  // language, even when the phrase dictionary had to fall back.
  assert.match(title, /Brasil/);
});

test("fitFragments drops the last optional fragment entirely before touching the one before it", () => {
  const fitted = fitFragments(
    [
      { id: "a", required: true, variants: ["AAAA"] },
      { id: "b", required: false, variants: ["BBBBBBBBBB", "BBBB"] },
      { id: "c", required: false, variants: ["CCCCCCCCCC", "CCCC"] },
    ],
    20,
    " | ",
  );
  // "AAAA | BBBBBBBBBB" - c walked its variants and was dropped; b was
  // never touched.
  assert.equal(fitted, "AAAA | BBBBBBBBBB");
});

test("fitFragments word-truncates only as a last resort", () => {
  const fitted = fitFragments([{ id: "only", required: true, variants: ["one two three four five"] }], 12, " | ");
  assert.equal(fitted, "one two");
});
