import { test } from "node:test";
import assert from "node:assert/strict";
import type { Casino, ParsedDocxContent } from "schema";
import type { ImageManifestEntry } from "image-pipeline";
import { assembleSite } from "./assemble-site.js";
import { applyCasinoV1Rules } from "./casino-v1-rules.js";
import { translate } from "./casino-v1-translations.js";
import { sampleConfig, sampleParsedContent } from "./test-fixtures.js";

function manifestEntry(original: string, finalPath = original): ImageManifestEntry {
  return { original, finalPath, variants: [] };
}

// sampleParsedContent() has: index (already an intro), bonus, login,
// privacy-policy. No application/withdrawal/review/slots pages, which lets
// the "omitted when missing" behavior get exercised too.

test("builds the fixed navbar order, omitting items whose page doesn't exist", () => {
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), []);
  assert.deepEqual(casino.navbar.menu, [
    { name: "Login", href: "/login/" },
    { name: "Application", href: "/" },
    { name: "Bonus", href: "/bonus/", dropdown: [] },
  ]);
});

test("clicking \"Bonus\" itself goes to the bonus page when one exists", () => {
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), []);
  const bonusItem = casino.navbar.menu.find((item) => item.name === "Bonus")!;
  assert.equal(bonusItem.href, "/bonus/");
});

test("\"Bonus\" stays dropdown-only (no href) when there's no bonus page, just bonus-adjacent sub-pages", () => {
  const content = sampleParsedContent();
  content.pages = content.pages.filter((page) => page.slug !== "bonus");
  content.pages.push({
    slug: "free-spins",
    title: "Free Spins",
    navLabel: "Free Spins",
    meta: {},
    sections: [{ type: "text", id: "fs", title: "Free Spins", paragraphs: ["Details."] }],
  });
  const casino = applyCasinoV1Rules(assembleSite(content, sampleConfig()), sampleConfig(), []);
  const bonusItem = casino.navbar.menu.find((item) => item.name === "Bonus")!;
  assert.equal(bonusItem.href, undefined);
  assert.deepEqual(bonusItem.dropdown, [{ name: "Free Spins", href: "/free-spins/" }]);
});

test("login/signup button text mirrors the translated nav labels", () => {
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), []);
  assert.equal(casino.navbar.loginButton?.text, "Login");
  assert.equal(casino.navbar.signupButton, undefined); // no "application" page in the fixture
});

test("footer links only the fixed slugs that actually exist, translated", () => {
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), []);
  assert.deepEqual(casino.footer.links, [{ label: "Privacy Policy", href: "/privacy-policy/" }]);
});

test("footer link labels are actually translated for a non-English locale, not left in English", () => {
  const config = { ...sampleConfig(), locales: [{ code: "de", docx: "casino.de.docx", default: true }] };
  const content = sampleParsedContent();
  content.locale = "de";
  const casino = applyCasinoV1Rules(assembleSite(content, config), config, []);
  assert.deepEqual(casino.footer.links, [{ label: "Datenschutzerklärung", href: "/privacy-policy/" }]);
});

test("footer logos come from footer-logo-1/2 in the manifest when both exist", () => {
  const manifest = [manifestEntry("footer-logo-1.png"), manifestEntry("footer-logo-2.png")];
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), manifest);
  assert.deepEqual(casino.footer.logos, [
    { src: "/images/sample-casino/footer-logo-1.png", alt: "Sample Casino Footer Logo 1" },
    { src: "/images/sample-casino/footer-logo-2.png", alt: "Sample Casino Footer Logo 2" },
  ]);
});

test("footer logos are left alone when only one of the two files exists", () => {
  const manifest = [manifestEntry("footer-logo-1.png")];
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), manifest);
  assert.deepEqual(casino.footer.logos, []);
});

test("folds a page's first text section into a synthesized intro, dropping the original", () => {
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), []);
  const bonus = casino.pages.find((p) => p.slug === "bonus")!;
  assert.equal(bonus.sections[0].type, "intro");
  if (bonus.sections[0].type !== "intro") throw new Error("unreachable");
  assert.equal(bonus.sections[0].title, "Bonus");
  assert.deepEqual(bonus.sections[0].paragraphs, ["Details here."]);
  assert.equal(bonus.sections[0].banner?.text, "Bonus");
  assert.equal(
    bonus.sections.find((section) => section.type === "text" && section.title === "Bonus Details"),
    undefined,
  );
});

test("leaves an already-intro first section untouched", () => {
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), []);
  const home = casino.pages.find((p) => p.slug === "index")!;
  assert.equal(home.sections[0].type, "intro");
  if (home.sections[0].type !== "intro") throw new Error("unreachable");
  assert.equal(home.sections[0].id, "intro");
  assert.deepEqual(home.sections[0].paragraphs, ["Welcome to Sample Casino."]);
  // docx already supplied bannerText for this page - must not be overwritten
  assert.equal(home.sections[0].banner?.text, "Get $500 today!");
});

test("an already-intro hero's buttonText defaults to the locale-translated CTA, not a hardcoded English string", () => {
  const config = { ...sampleConfig(), locales: [{ code: "de", docx: "casino.de.docx", default: true }] };
  const content = sampleParsedContent();
  content.locale = "de";
  const casino = applyCasinoV1Rules(assembleSite(content, config), config, []);
  const home = casino.pages.find((p) => p.slug === "index")!;
  assert.equal(home.sections[0].type, "intro");
  if (home.sections[0].type !== "intro") throw new Error("unreachable");
  assert.equal(home.sections[0].banner?.buttonText, "Bonus sichern");
});

test("falls back to the page title for banner overlay text when the docx didn't supply one", () => {
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), []);
  const login = casino.pages.find((p) => p.slug === "login")!;
  assert.equal(login.sections[0].type, "intro");
  if (login.sections[0].type !== "intro") throw new Error("unreachable");
  assert.equal(login.sections[0].banner?.text, "Login");
});

test("config.banner.text wins over the page-title fallback for a synthesized (non-home) intro", () => {
  const config = { ...sampleConfig(), banner: { ...sampleConfig().banner, text: "Site-wide default headline" } };
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), config), config, []);
  const login = casino.pages.find((p) => p.slug === "login")!;
  if (login.sections[0].type !== "intro") throw new Error("unreachable");
  assert.equal(login.sections[0].banner?.text, "Site-wide default headline");
});

test("config.banner.byLocale[locale].text wins over the locale-agnostic config.banner.text", () => {
  const config = {
    ...sampleConfig(),
    banner: {
      ...sampleConfig().banner,
      text: "English default",
      byLocale: { el: { text: "Greek default" } },
    },
  };
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent("el"), config), config, []);
  const login = casino.pages.find((p) => p.slug === "login")!;
  if (login.sections[0].type !== "intro") throw new Error("unreachable");
  assert.equal(login.sections[0].banner?.text, "Greek default");
});

test("config.stickyBanner.byLocale[locale] wins over the locale-agnostic base fields and the translated default", () => {
  const config = {
    ...sampleConfig(),
    stickyBanner: {
      bullets: ["Up to $500 Bonus"],
      headline: "English Headline",
      byLocale: { el: { bullets: ["Greek bullet"], headline: "Greek Headline" } },
    },
  };
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent("el"), config), config, []);
  assert.equal(casino.stickyBanner?.headline, "Greek Headline");
  assert.deepEqual(casino.stickyBanner?.bullets, ["Greek bullet"]);
  // buttonText/disclaimer have no locale override here - still fall through
  // to the translated default (with {age} substituted for sampleConfig()'s
  // default 18, since it has no "nl" locale), unaffected by the other
  // fields' overrides.
  assert.equal(casino.stickyBanner?.disclaimer, translate("el", "stickyBanner.disclaimer").replace("{age}", "18"));
});

test("an overrides.<locale>.json banner entry wins over the page-title fallback and auto-matched image, for a synthesized (non-home) intro", () => {
  const content = sampleParsedContent();
  const login = content.pages.find((p) => p.slug === "login")!;
  login.banner = { text: "Sign in for a $50 bonus", buttonText: "Claim Now", image: "login-hero.jpg" };
  const manifest = [
    manifestEntry("login.png", "login.png"), // would auto-match by slug if no override
    manifestEntry("login-hero.jpg", "login-hero.abc123.jpg"),
  ];

  const casino = applyCasinoV1Rules(assembleSite(content, sampleConfig()), sampleConfig(), manifest, content.pages);
  const loginPage = casino.pages.find((p) => p.slug === "login")!;
  assert.equal(loginPage.sections[0].type, "intro");
  if (loginPage.sections[0].type !== "intro") throw new Error("unreachable");
  assert.equal(loginPage.sections[0].banner?.text, "Sign in for a $50 bonus");
  assert.equal(loginPage.sections[0].banner?.buttonText, "Claim Now");
  assert.equal(loginPage.sections[0].banner?.desktop, "/images/sample-casino/login-hero.abc123.jpg");
});

test("an overrides.<locale>.json banner entry wins over the docx-supplied banner on the home page too", () => {
  const content = sampleParsedContent();
  const home = content.pages.find((p) => p.slug === "index")!;
  home.banner = { text: "Overridden headline" };

  const casino = applyCasinoV1Rules(assembleSite(content, sampleConfig()), sampleConfig(), [], content.pages);
  const homePage = casino.pages.find((p) => p.slug === "index")!;
  assert.equal(homePage.sections[0].type, "intro");
  if (homePage.sections[0].type !== "intro") throw new Error("unreachable");
  assert.equal(homePage.sections[0].banner?.text, "Overridden headline");
});

test("does not consume a first section it can't fully fold into intro paragraphs", () => {
  const casino: Casino = {
    slug: "sample-casino",
    locale: "en",
    name: "Sample Casino",
    theme: { primary: "#111111", secondary: "#222222" },
    navbar: {},
    footer: {},
    pages: [
      {
        slug: "withdrawal",
        title: "Withdrawal",
        seo: { title: "Withdrawal", description: "d" },
        sections: [
          {
            type: "content",
            id: "table-first",
            title: "Limits",
            blocks: [{ type: "table", columns: ["A"], rows: [["1"]] }],
          },
        ],
      },
    ],
  };
  const result = applyCasinoV1Rules(casino, sampleConfig(), []);
  const withdrawal = result.pages[0];
  assert.equal(withdrawal.sections[0].type, "intro");
  if (withdrawal.sections[0].type !== "intro") throw new Error("unreachable");
  assert.deepEqual(withdrawal.sections[0].paragraphs, []);
  assert.equal(withdrawal.sections[1].type, "content");
  assert.equal(withdrawal.sections[1].id, "table-first");
});

test("folds the prose blocks of a mixed text+table first section into intro paragraphs, leaving the table behind under a distinct id", () => {
  const casino: Casino = {
    slug: "sample-casino",
    locale: "en",
    name: "Sample Casino",
    theme: { primary: "#111111", secondary: "#222222" },
    navbar: {},
    footer: {},
    pages: [
      {
        slug: "review",
        title: "Review",
        seo: { title: "Review", description: "d" },
        sections: [
          {
            type: "content",
            id: "intro",
            title: "Intro",
            blocks: [
              { type: "text", paragraphs: ["Opening paragraph."] },
              { type: "table", columns: ["A"], rows: [["1"]] },
              { type: "text", paragraphs: ["Closing paragraph."] },
            ],
          },
        ],
      },
    ],
  };
  const result = applyCasinoV1Rules(casino, sampleConfig(), []);
  const review = result.pages[0];
  assert.equal(review.sections[0].type, "intro");
  if (review.sections[0].type !== "intro") throw new Error("unreachable");
  assert.deepEqual(review.sections[0].paragraphs, ["Opening paragraph.", "Closing paragraph."]);
  assert.equal(review.sections[1].type, "content");
  if (review.sections[1].type !== "content") throw new Error("unreachable");
  assert.notEqual(review.sections[1].id, "intro");
  assert.deepEqual(review.sections[1].blocks, [{ type: "table", columns: ["A"], rows: [["1"]] }]);
});

test("injects a translated signinForm right after the intro, keeping remaining docx content", () => {
  const content = sampleParsedContent();
  const login = content.pages.find((p) => p.slug === "login")!;
  login.sections.push({ type: "text", id: "recovery", title: "Password Recovery", paragraphs: ["Steps."] });

  const casino = applyCasinoV1Rules(assembleSite(content, sampleConfig()), sampleConfig(), []);
  const loginPage = casino.pages.find((p) => p.slug === "login")!;

  assert.equal(loginPage.sections[0].type, "intro");
  assert.equal(loginPage.sections[1].type, "signinForm");
  if (loginPage.sections[1].type !== "signinForm") throw new Error("unreachable");
  assert.deepEqual(loginPage.sections[1].fields, [
    { label: "Email / Username", name: "email", type: "email" },
    { label: "Password", name: "password", type: "password" },
  ]);
  assert.equal(loginPage.sections[1].buttonText, "Login");
  assert.equal(loginPage.sections[2].title, "Password Recovery");
});

test("a page with no name-matching image falls back to an unused image, not the shared site default", () => {
  const content = sampleParsedContent();
  // Isolated to just the page(s) under test — "index" is deliberately
  // dropped rather than kept-but-unused: it's now itself a pool-fallback
  // candidate (see the "already-intro" auto-matching tests above), so
  // leaving it in would let it compete for these tests' deliberately
  // scarce images and make the assertions about *these* pages flaky.
  content.pages = [];
  content.pages.push({
    slug: "promo-code",
    title: "Promo Code",
    navLabel: "Promo Code",
    meta: {},
    sections: [{ type: "text", id: "intro-text", title: "Promo Code", paragraphs: ["Grab it."] }],
  });
  const manifest = [manifestEntry("some-random-photo.jpg")];
  const casino = applyCasinoV1Rules(assembleSite(content, sampleConfig()), sampleConfig(), manifest);
  const promoCode = casino.pages.find((p) => p.slug === "promo-code")!;
  assert.equal(promoCode.sections[0].type, "intro");
  if (promoCode.sections[0].type !== "intro") throw new Error("unreachable");
  assert.equal(promoCode.sections[0].banner?.desktop, "/images/sample-casino/some-random-photo.jpg");
});

test("two pages with no name-matching image each get a different unused image, not duplicates of each other", () => {
  const content = sampleParsedContent();
  // Isolated to just the page(s) under test — "index" is deliberately
  // dropped rather than kept-but-unused: it's now itself a pool-fallback
  // candidate (see the "already-intro" auto-matching tests above), so
  // leaving it in would let it compete for these tests' deliberately
  // scarce images and make the assertions about *these* pages flaky.
  content.pages = [];
  content.pages.push(
    {
      slug: "promo-code",
      title: "Promo Code",
      navLabel: "Promo Code",
      meta: {},
      sections: [{ type: "text", id: "a", title: "Promo Code", paragraphs: ["x"] }],
    },
    {
      slug: "review",
      title: "Review",
      navLabel: "Review",
      meta: {},
      sections: [{ type: "text", id: "b", title: "Review", paragraphs: ["y"] }],
    },
  );
  const manifest = [manifestEntry("photo-one.jpg"), manifestEntry("photo-two.jpg")];
  const casino = applyCasinoV1Rules(assembleSite(content, sampleConfig()), sampleConfig(), manifest);
  const promoCode = casino.pages.find((p) => p.slug === "promo-code")!;
  const review = casino.pages.find((p) => p.slug === "review")!;
  if (promoCode.sections[0].type !== "intro" || review.sections[0].type !== "intro") throw new Error("unreachable");
  assert.notEqual(promoCode.sections[0].banner?.desktop, review.sections[0].banner?.desktop);
});

test("the fallback pool skips slots/* images, footer logos, and images config.json already points at directly", () => {
  const content = sampleParsedContent();
  // Isolated to just the page(s) under test — "index" is deliberately
  // dropped rather than kept-but-unused: it's now itself a pool-fallback
  // candidate (see the "already-intro" auto-matching tests above), so
  // leaving it in would let it compete for these tests' deliberately
  // scarce images and make the assertions about *these* pages flaky.
  content.pages = [];
  content.pages.push({
    slug: "promo-code",
    title: "Promo Code",
    navLabel: "Promo Code",
    meta: {},
    sections: [{ type: "text", id: "a", title: "Promo Code", paragraphs: ["x"] }],
  });
  const config = sampleConfig();
  const manifest = [
    manifestEntry("slots/mega-joker.jpg"),
    manifestEntry("footer-logo-1.png"),
    manifestEntry("footer-logo-2.png"),
    manifestEntry(config.navbar.logo!.split("/").pop()!), // navbar logo, already spoken for
  ];
  const casino = applyCasinoV1Rules(assembleSite(content, config), config, manifest);
  const promoCode = casino.pages.find((p) => p.slug === "promo-code")!;
  if (promoCode.sections[0].type !== "intro") throw new Error("unreachable");
  // Nothing left in the pool once reserved images are excluded, so it falls
  // all the way back to config.banner.desktop like before this feature.
  assert.equal(promoCode.sections[0].banner?.desktop, config.banner.desktop);
});

test("a page whose first section already arrives as type \"intro\" (e.g. a docx home page, or any page of a content-library-composed site) still gets its own per-page auto-matched image", () => {
  const content = sampleParsedContent(); // "index" already has type: "intro" as its first section
  const manifest = [manifestEntry("index.jpg")];
  const casino = applyCasinoV1Rules(assembleSite(content, sampleConfig()), sampleConfig(), manifest);
  const index = casino.pages.find((p) => p.slug === "index")!;
  assert.equal(index.sections[0].type, "intro");
  if (index.sections[0].type !== "intro") throw new Error("unreachable");
  assert.equal(index.sections[0].banner?.desktop, "/images/sample-casino/index.jpg");
});

test("an already-\"intro\" page with no matching image falls back to config.banner.desktop, unchanged", () => {
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), []);
  const index = casino.pages.find((p) => p.slug === "index")!;
  if (index.sections[0].type !== "intro") throw new Error("unreachable");
  assert.equal(index.sections[0].banner?.desktop, sampleConfig().banner.desktop);
});

test("an explicit overrides.<locale>.json image still wins over an already-\"intro\" page's auto-matched image", () => {
  const content = sampleParsedContent();
  content.pages[0].banner = { image: "override-photo.jpg" };
  const manifest = [manifestEntry("index.jpg"), manifestEntry("override-photo.jpg")];
  const casino = applyCasinoV1Rules(assembleSite(content, sampleConfig()), sampleConfig(), manifest, content.pages);
  const index = casino.pages.find((p) => p.slug === "index")!;
  if (index.sections[0].type !== "intro") throw new Error("unreachable");
  assert.equal(index.sections[0].banner?.desktop, "/images/sample-casino/override-photo.jpg");
});

test("seo.ogImage uses a page's own auto-matched image instead of the site-wide default", () => {
  const content = sampleParsedContent();
  const manifest = [manifestEntry("index.jpg"), manifestEntry("bonus.jpg")];
  const casino = applyCasinoV1Rules(assembleSite(content, sampleConfig()), sampleConfig(), manifest);
  const index = casino.pages.find((p) => p.slug === "index")!;
  const bonus = casino.pages.find((p) => p.slug === "bonus")!;
  assert.equal(index.seo.ogImage, "/images/sample-casino/index.jpg");
  assert.equal(bonus.seo.ogImage, "/images/sample-casino/bonus.jpg");
});

test("seo.ogImage falls back to config.banner.desktop (assembleSite's own default) when no page image matches", () => {
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), []);
  const index = casino.pages.find((p) => p.slug === "index")!;
  assert.equal(index.seo.ogImage, sampleConfig().banner.desktop);
});

test("legal pages get no hero/intro section of their own, but still get a real ogImage when one matches", () => {
  const manifest = [manifestEntry("privacy-policy.jpg")];
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), manifest);
  const privacy = casino.pages.find((p) => p.slug === "privacy-policy")!;
  // config.banner.desktop is only ever a real file when a site happens to
  // have one at that path - unlike every other page, a legal page had no
  // fallback to its own per-page image, so it could reference a
  // nonexistent file the moment a site's images/ directory was populated.
  assert.equal(privacy.seo.ogImage, "/images/sample-casino/privacy-policy.jpg");
  assert.equal(privacy.sections[0]?.type, "text");
});

test("a legal page with no matching image keeps assembleSite's config.banner.desktop default", () => {
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), []);
  const privacy = casino.pages.find((p) => p.slug === "privacy-policy")!;
  assert.equal(privacy.seo.ogImage, sampleConfig().banner.desktop);
});

test("minimum age and footer age badge default to 18+ for a locale with no special rule", () => {
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), []);
  assert.equal(casino.minimumAge, 18);
  assert.equal(casino.footer.ageBadge?.text, "18+");
});

test("Netherlands sites get a 24+ minimum age, footer badge, and sticky banner disclaimer", () => {
  const config = {
    ...sampleConfig(),
    locales: [{ code: "nl", docx: "casino.nl.docx", default: true }],
    stickyBanner: { logo: "/images/sample-casino/logo.png", bullets: ["Up to $500 Bonus"] },
  };
  const content = sampleParsedContent("nl");
  const casino = applyCasinoV1Rules(assembleSite(content, config), config, []);

  assert.equal(casino.minimumAge, 24);
  assert.equal(casino.footer.ageBadge?.text, "24+");
  assert.equal(casino.stickyBanner?.disclaimer, "Algemene voorwaarden van toepassing. 24+");
});

// The 24+ requirement is a property of which market a site targets (does it
// serve an "nl" locale at all), not of whichever language a given page
// happens to render in - an English page on an NL-targeted site is still
// shown to/ordered for NL players and must carry the same 24+ requirement.
test("a site with both en and nl locales gets 24+ on its English pages too, not just its Dutch ones", () => {
  const config = {
    ...sampleConfig(),
    locales: [
      { code: "en", docx: "casino.en.docx", default: true },
      { code: "nl", docx: "casino.nl.docx" },
    ],
  };
  const enCasino = applyCasinoV1Rules(assembleSite(sampleParsedContent("en"), config), config, []);
  assert.equal(enCasino.minimumAge, 24);
  assert.equal(enCasino.footer.ageBadge?.text, "24+");
  assert.equal(enCasino.stickyBanner, undefined); // sampleConfig() has no stickyBanner
  assert.equal(enCasino.ageGate?.confirmText, "Yes, I'm 24+");
  assert.match(enCasino.ageGate?.body ?? "", /at least 24 years old/);

  const nlCasino = applyCasinoV1Rules(assembleSite(sampleParsedContent("nl"), config), config, []);
  assert.equal(nlCasino.minimumAge, 24);
  assert.equal(nlCasino.ageGate?.confirmText, "Ja, ik ben 24+");
});

test("an explicit footer.ageBadge (e.g. from an override) wins over the locale-derived default", () => {
  const casino: Casino = {
    slug: "sample-casino",
    locale: "en",
    name: "Sample Casino",
    theme: { primary: "#111111", secondary: "#222222" },
    navbar: {},
    footer: { ageBadge: { text: "21+" } },
    pages: [],
  };
  const result = applyCasinoV1Rules(casino, sampleConfig(), []);
  assert.equal(result.footer.ageBadge?.text, "21+");
});

test("builds a slots section from images/slots/* manifest entries", () => {
  const content = sampleParsedContent();
  content.pages.push({
    slug: "slots",
    title: "Slots",
    navLabel: "Slots",
    meta: {},
    sections: [{ type: "text", id: "intro-text", title: "Slots", paragraphs: ["Play now."] }],
  });
  const manifest = [
    manifestEntry("slots/sugar_rush_1000.jpg", "slots/sugar-rush-1000.jpg"),
    manifestEntry("slots/book_of_gold.png", "slots/book-of-gold.png"),
  ];
  const casino = applyCasinoV1Rules(assembleSite(content, sampleConfig()), sampleConfig(), manifest);
  const slots = casino.pages.find((p) => p.slug === "slots")!;

  assert.equal(slots.sections[1].type, "slots");
  if (slots.sections[1].type !== "slots") throw new Error("unreachable");
  assert.deepEqual(slots.sections[1].slots, [
    { title: "Sugar Rush 1000", image: "/images/sample-casino/slots/sugar-rush-1000.jpg", alt: "Sugar Rush 1000" },
    { title: "Book Of Gold", image: "/images/sample-casino/slots/book-of-gold.png", alt: "Book Of Gold" },
  ]);
});

test("stickyBanner stays absent when config didn't supply one", () => {
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), sampleConfig()), sampleConfig(), []);
  assert.equal(casino.stickyBanner, undefined);
});

test("stickyBanner gets translated headline/buttonText/disclaimer defaults when not set explicitly", () => {
  const config = { ...sampleConfig(), stickyBanner: { bullets: ["Up to $500 Bonus"] } };
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), config), config, []);
  assert.deepEqual(casino.stickyBanner, {
    logo: "/images/sample-casino/logo.png",
    casinoName: "Sample Casino",
    headline: "Welcome Bonus",
    bullets: ["Up to $500 Bonus"],
    disclaimer: "T&Cs apply. 18+",
    buttonText: "Claim Bonus",
    buttonLink: "/go/sample-casino",
  });
});

test("stickyBanner keeps explicit wording instead of the translated default", () => {
  const config = {
    ...sampleConfig(),
    stickyBanner: { bullets: ["Up to $500 Bonus"], headline: "Custom Headline", buttonText: "Go" },
  };
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), config), config, []);
  assert.equal(casino.stickyBanner?.headline, "Custom Headline");
  assert.equal(casino.stickyBanner?.buttonText, "Go");
  assert.equal(casino.stickyBanner?.disclaimer, "T&Cs apply. 18+"); // still defaulted
});

test("translate() falls back to English for a locale with no dictionary entry", () => {
  assert.equal(translate("fr", "nav.login"), "Login");
  assert.equal(translate("no", "nav.login"), "Logg inn"); // locale we do have, sanity check
});

test("translate() has a Dutch dictionary", () => {
  assert.equal(translate("nl", "nav.login"), "Inloggen");
  // {age} is a literal placeholder applyCasinoV1Rules substitutes with the
  // site's resolved minimumAge (see resolveMinimumAge) - translate() itself
  // returns the raw template, not a fixed "18+"/"24+".
  assert.equal(translate("nl", "stickyBanner.disclaimer"), "Algemene voorwaarden van toepassing. {age}+");
});

// --- cta removal + promo banners (casino-v2 only) ------------------------

function contentWithManySections(): ParsedDocxContent {
  const content = sampleParsedContent();
  const index = content.pages.find((p) => p.slug === "index")!;
  index.sections = [
    index.sections[0], // the existing intro
    { type: "text", id: "bonus", title: "Bonus", paragraphs: ["Bonus copy."] },
    { type: "text", id: "games", title: "Games", paragraphs: ["Games copy."] },
    { type: "text", id: "payments", title: "Payments", paragraphs: ["Payments copy."] },
    { type: "text", id: "security", title: "Security", paragraphs: ["Security copy."] },
    { type: "text", id: "support", title: "Support", paragraphs: ["Support copy."] },
    { type: "text", id: "conclusion", title: "Conclusion", paragraphs: ["Conclusion copy."] },
    { type: "faq", id: "faq", title: "FAQ", items: [{ question: "Is this safe?", answer: "Yes." }] },
    { type: "text", id: "cta", title: "Cta", paragraphs: ["Join now!"] },
  ];
  return content;
}

test("casino-v1 sites are completely unaffected: cta stays, no promo banners", () => {
  const content = contentWithManySections();
  const casino = applyCasinoV1Rules(assembleSite(content, sampleConfig()), sampleConfig(), []);
  const index = casino.pages.find((p) => p.slug === "index")!;
  assert.ok(index.sections.some((s) => s.id === "cta"));
  assert.ok(!index.sections.some((s) => s.type === "banner"));
});

test("casino-v2: the cta section is dropped from the rendered page entirely", () => {
  const config = { ...sampleConfig(), template: "casino-v2" };
  const content = contentWithManySections();
  const casino = applyCasinoV1Rules(assembleSite(content, config), config, []);
  const index = casino.pages.find((p) => p.slug === "index")!;
  assert.ok(!index.sections.some((s) => s.id === "cta"));
});

test("casino-v2: promo banner sections get inserted, spaced through the page, capped at 4", () => {
  const config = { ...sampleConfig(), template: "casino-v2" };
  const content = contentWithManySections();
  const casino = applyCasinoV1Rules(assembleSite(content, config), config, []);
  const index = casino.pages.find((p) => p.slug === "index")!;

  const banners = index.sections.filter((s) => s.type === "banner");
  assert.ok(banners.length >= 3 && banners.length <= 4, `expected 3-4 banners, got ${banners.length}`);
  // Never the very first section (that's still the hero/intro) or the very
  // last one (nothing should trail past the page's real final section).
  assert.notEqual(index.sections[0].type, "banner");
  assert.notEqual(index.sections[index.sections.length - 1].type, "banner");
});

test("casino-v2: an injected banner reuses the site's own banner image and translated copy", () => {
  const config = { ...sampleConfig(), template: "casino-v2" };
  const content = contentWithManySections();
  const casino = applyCasinoV1Rules(assembleSite(content, config), config, []);
  const index = casino.pages.find((p) => p.slug === "index")!;
  const banner = index.sections.find((s) => s.type === "banner")!;
  if (banner.type !== "banner") throw new Error("unreachable");

  assert.equal(banner.banner?.desktop, sampleConfig().banner.desktop);
  assert.equal(banner.title, "Ready to Get Started?");
  assert.equal(banner.bannerText, "Your Welcome Bonus Is Waiting");
  assert.equal(banner.ctaText, "Claim Bonus");
});

test("casino-v2: an injected banner prefers a real per-page alt image over the shared site banner", () => {
  const config = { ...sampleConfig(), template: "casino-v2" };
  const content = contentWithManySections();
  const manifest = [manifestEntry("index-alt-1.jpg"), manifestEntry("index-alt-2.jpg")];
  const casino = applyCasinoV1Rules(assembleSite(content, config), config, manifest);
  const index = casino.pages.find((p) => p.slug === "index")!;
  const banners = index.sections.filter((s) => s.type === "banner");

  const first = banners[0];
  if (first.type !== "banner") throw new Error("unreachable");
  assert.equal(first.banner?.desktop, `/images/${config.slug}/index-alt-1.jpg`);

  const second = banners[1];
  if (second.type !== "banner") throw new Error("unreachable");
  assert.equal(second.banner?.desktop, `/images/${config.slug}/index-alt-2.jpg`);
});

test("casino-v2: promo banner copy is translated per locale", () => {
  const config = { ...sampleConfig(), template: "casino-v2", locales: [{ code: "de", docx: "casino.de.docx", default: true }] };
  const content = contentWithManySections();
  content.locale = "de";
  const casino = applyCasinoV1Rules(assembleSite(content, config), config, []);
  const index = casino.pages.find((p) => p.slug === "index")!;
  const banner = index.sections.find((s) => s.type === "banner")!;
  if (banner.type !== "banner") throw new Error("unreachable");

  assert.equal(banner.title, "Bereit loszulegen?");
  assert.equal(banner.ctaText, "Bonus sichern");
});

test("casino-v2: a short page (hero + one section) still gets topped up to the 2-banner minimum, appended after its content rather than wedged between fields", () => {
  const config = { ...sampleConfig(), template: "casino-v2" };
  const casino = applyCasinoV1Rules(assembleSite(sampleParsedContent(), config), config, []);
  const login = casino.pages.find((p) => p.slug === "login")!;
  const banners = login.sections.filter((s) => s.type === "banner");
  assert.equal(banners.length, 2);
  // Both banners trail the form section - nothing gets sandwiched into the
  // middle of a 2-section (hero + form) page.
  const formIndex = login.sections.findIndex((s) => s.type === "signinForm");
  assert.ok(formIndex >= 0);
  assert.ok(login.sections.slice(formIndex + 1).every((s) => s.type === "banner"));
});

test("casino-v2: legal pages are untouched — no cta removal, no promo banners", () => {
  const config = { ...sampleConfig(), template: "casino-v2" };
  const content = contentWithManySections();
  content.pages.find((p) => p.slug === "privacy-policy")!.sections.push({
    type: "text",
    id: "cta",
    title: "Cta",
    paragraphs: ["Join now!"],
  });
  const casino = applyCasinoV1Rules(assembleSite(content, config), config, []);
  const privacy = casino.pages.find((p) => p.slug === "privacy-policy")!;
  assert.ok(privacy.sections.some((s) => s.id === "cta")); // left alone, matching every other legal-page rule
  assert.ok(!privacy.sections.some((s) => s.type === "banner"));
});
