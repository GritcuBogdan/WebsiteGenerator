import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleSite } from "./assemble-site.js";
import { sampleConfig, sampleParsedContent } from "./test-fixtures.js";

test("carries theme through unchanged from config", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  assert.deepEqual(casino.theme, { primary: "#111111", secondary: "#222222" });
});

test("builds a flat nav menu from every non-index page, in the default locale", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  assert.deepEqual(
    casino.navbar.menu,
    [
      { name: "Bonus", href: "/bonus/" },
      { name: "Login", href: "/login/" },
      { name: "Privacy Policy", href: "/privacy-policy/" },
    ],
  );
});

test("showBrandName defaults to whether brandName is set, but an explicit config value wins either way", () => {
  const withName = assembleSite(sampleParsedContent(), sampleConfig());
  assert.equal(withName.navbar.showBrandName, true); // sampleConfig() sets brandName

  const hidden = assembleSite(sampleParsedContent(), {
    ...sampleConfig(),
    navbar: { ...sampleConfig().navbar, showBrandName: false },
  });
  assert.equal(hidden.navbar.brandName, "Sample Casino"); // still feeds SEO/footer/alt text
  assert.equal(hidden.navbar.showBrandName, false); // just hidden from the navbar itself

  const noBrandName = assembleSite(sampleParsedContent(), {
    ...sampleConfig(),
    navbar: { logo: sampleConfig().navbar.logo },
  });
  assert.equal(noBrandName.navbar.showBrandName, false); // old default behavior preserved
});

test("prefixes paths with /<locale>/ for a non-default locale", () => {
  const casino = assembleSite(sampleParsedContent("el"), sampleConfig());
  assert.equal(casino.navbar.homeHref, "/el/");
  assert.equal(casino.pages.find((page) => page.slug === "bonus")!.seo.canonical, "/el/bonus/");
});

test("adds a login button only when a login page exists, and none for signup here", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  assert.ok(casino.navbar.loginButton);
  assert.equal(casino.navbar.loginButton!.href, "/login/");
  assert.equal(casino.navbar.signupButton, undefined); // no "application" page in the fixture
});

test("stickyBanner is absent by default (config doesn't have one)", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  assert.equal(casino.stickyBanner, undefined);
});

test("stickyBanner fills in branding (logo/casinoName/buttonLink) from config when set, leaving wording to casino-v1-rules", () => {
  const casino = assembleSite(sampleParsedContent(), {
    ...sampleConfig(),
    stickyBanner: { bullets: ["Up to $500 Bonus", "+50 Free Spins"] },
  });
  assert.deepEqual(casino.stickyBanner, {
    logo: "/images/sample-casino/logo.png", // fell back to navbar.logo
    casinoName: "Sample Casino",
    bullets: ["Up to $500 Bonus", "+50 Free Spins"],
    buttonLink: "/go/sample-casino",
  });
});

test("footer only links legal pages that actually exist in the parsed content", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  assert.deepEqual(casino.footer.links, [{ label: "Privacy Policy", href: "/privacy-policy/" }]);
});

test("footer.legalPageSlugs in config overrides the default set", () => {
  const config = sampleConfig();
  config.footer = { legalPageSlugs: ["bonus"] };
  const casino = assembleSite(sampleParsedContent(), config);
  assert.deepEqual(casino.footer.links, [{ label: "bonus", href: "/bonus/" }]);
});

test("builds a real banner on intro sections, wiring buttonLink to the redirect path", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  const intro = casino.pages[0].sections[0];
  assert.equal(intro.type, "intro");
  if (intro.type !== "intro") throw new Error("unreachable");

  // buttonText is left undefined here (no hardcoded English default) -
  // casino-v1-rules.ts's applyBannerOverride/buildIntroSection fill it in
  // with the locale-translated "intro.ctaText" default, downstream of
  // assembleSite. JSON.stringify (assembleSite's own final round-trip)
  // drops undefined-valued keys, so it's simply absent here.
  assert.deepEqual(intro.banner, {
    desktop: "/images/sample-casino/banner.png",
    alt: "Sample Casino",
    text: "Get $500 today!",
    buttonLink: "/go/sample-casino",
    textColor: "#FFFFFF",
    buttonColor: "#111111", // falls back to theme.primary
    buttonTextColor: "#FFFFFF",
  });
});

test("page seo falls back to generated title/description when meta doesn't supply them", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  const bonus = casino.pages.find((page) => page.slug === "bonus")!;
  assert.equal(bonus.seo.title, "Bonus - Sample Casino");
  assert.match(bonus.seo.description, /bonus/i);
  assert.deepEqual(bonus.seo.keywords, ["sample-casino", "online casino", "casino bonus", "casino games"]);
});

test("page seo uses explicit meta when the docx supplied it", () => {
  const content = sampleParsedContent();
  content.pages[0].meta = { title: "Explicit Title", description: "Explicit description." };
  const casino = assembleSite(content, sampleConfig());
  assert.equal(casino.pages[0].seo.title, "Explicit Title");
  assert.equal(casino.pages[0].seo.description, "Explicit description.");
});

test("throws when the content's locale isn't configured for the site", () => {
  assert.throws(() => assembleSite(sampleParsedContent("de"), sampleConfig()), /No locale "de"/);
});

test("passes text/content/faq sections through with their fields intact", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  const faq = casino.pages[0].sections[1];
  assert.deepEqual(faq, {
    type: "faq",
    id: "faq-1",
    title: "FAQ",
    items: [{ question: "Is this safe?", answer: "Yes." }],
  });
});
