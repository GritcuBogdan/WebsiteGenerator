import type { ImageManifestEntry } from "image-pipeline";
import type {
  Casino,
  CasinoPage,
  CasinoSection,
  NavItem,
  ParsedPage,
  ParsedPageBannerOverride,
  SiteConfig,
} from "schema";
import { getRedirectHref, pagePath, resolveDefaultLocale } from "./assemble-site.js";
import { translate, translateStickyBannerBullets } from "./casino-v1-translations.js";

// Mandatory, casino-v1-specific layout rules: fixed navbar/footer,
// per-page Intro synthesis, and forced login/registration/slots sections.
// Deliberately kept out of assembleSite() (packages/codegen/src/assemble-site.ts),
// which stays generic for future templates — this only runs when
// config.template === "casino-v1" (see packages/generator-cli/src/pipeline.ts).

function basenameNoExt(posixPath: string): string {
  const base = posixPath.split("/").pop() ?? posixPath;
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).toLowerCase();
}

function findManifestEntry(manifest: ImageManifestEntry[], name: string): ImageManifestEntry | undefined {
  return manifest.find((entry) => basenameNoExt(entry.original) === name);
}

function slugTokens(value: string): string[] {
  return value.toLowerCase().split(/[-_\s]+/).filter(Boolean);
}

// Treats "withdrawal"/"withdrawals" as the same token - a client's filename
// is at least as likely to use the plural as the page slug's singular (or
// vice versa), and this is a safe heuristic (only ever adds/drops a
// trailing "s") rather than a general fuzzy-match that could mask typos.
function tokensMatch(a: string, b: string): boolean {
  return a === b || `${a}s` === b || `${b}s` === a;
}

function containsTokenRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start++) {
    if (needle.every((token, i) => tokensMatch(haystack[start + i], token))) return true;
  }
  return false;
}

// Images that are already spoken for by something other than page-slug
// auto-matching, and so must never be handed out as a generic-fallback
// banner (see buildPageImageMatches below): the slots carousel's own
// images, the two fixed footer logos, and anything config.json already
// points at directly (site-wide banner, navbar logo, sticky banner logo,
// favicon, ogImage) - all of those are matched by basename the same way
// resolveOverrideImage matches an override, since config stores the
// pipeline's *final* (optimized/slugified) filename, not the client's
// original.
function reservedImageBasenames(config: SiteConfig): Set<string> {
  const paths = [config.banner.desktop, config.banner.mobile, config.navbar.logo, config.stickyBanner?.logo, config.favicon, config.ogImage];
  return new Set(paths.filter((path): path is string => Boolean(path)).map((path) => basenameNoExt(path)));
}

// "logo.*" is reserved unconditionally, not just when reservedImageBasenames
// happens to catch it: it's the generator-cli pipeline's own fallback
// favicon source (FAVICON_SOURCE_BASENAMES in packages/generator-cli/src/
// pipeline.ts) whenever config.json doesn't set navbar.logo/favicon to that
// same file. When it's used that way, effectiveConfig.favicon ends up
// pointing at the *generated* "favicon.ico", not "logo.*" - so
// reservedImageBasenames() alone would miss it and let a page banner
// silently claim the client's logo artwork.
const ALWAYS_RESERVED_BASENAMES = new Set(["footer-logo-1", "footer-logo-2", "logo"]);

function isReservedManifestEntry(entry: ImageManifestEntry, reservedBasenames: Set<string>): boolean {
  if (entry.original.toLowerCase().startsWith("slots/")) return true;
  const originalBase = basenameNoExt(entry.original);
  if (ALWAYS_RESERVED_BASENAMES.has(originalBase)) return true;
  return reservedBasenames.has(originalBase) || reservedBasenames.has(basenameNoExt(entry.finalPath));
}

// Per-page banner images don't have to be named exactly after their page
// slug (e.g. "login.png") - a client-supplied file like "withdrawal mad
// casino.png" should still auto-match the withdrawal page. Exact matches
// are resolved first (unambiguous), then fuzzy token-run matches, most
// specific (longest) slug first and claiming its file before shorter/more
// generic slugs scan the same manifest - otherwise "bonus" could steal the
// file clearly intended for "no-deposit-bonus" just because its filename
// ends in "bonus" too.
//
// A slug that still has no match after both passes (e.g. a "promo-code"
// page when the client never sent a promo-code*.jpg) doesn't fall through
// to the site's shared default banner here - every such page would end up
// showing the exact same image. Instead it claims any other still-unused,
// non-reserved image (see isReservedManifestEntry) so every page keeps a
// distinct picture; only once that pool is exhausted does the caller's
// config.banner.desktop fallback ever get reused across pages.
function buildPageImageMatches(
  manifest: ImageManifestEntry[],
  slugs: string[],
  reservedBasenames: Set<string>,
): Map<string, ImageManifestEntry> {
  const matches = new Map<string, ImageManifestEntry>();
  const claimed = new Set<ImageManifestEntry>();

  for (const slug of slugs) {
    const entry = manifest.find((candidate) => !claimed.has(candidate) && basenameNoExt(candidate.original) === slug);
    if (entry) {
      matches.set(slug, entry);
      claimed.add(entry);
    }
  }

  const remainingSlugs = [...slugs].filter((slug) => !matches.has(slug)).sort((a, b) => b.length - a.length);
  for (const slug of remainingSlugs) {
    const needle = slugTokens(slug);
    const entry = manifest.find(
      (candidate) => !claimed.has(candidate) && containsTokenRun(slugTokens(basenameNoExt(candidate.original)), needle),
    );
    if (entry) {
      matches.set(slug, entry);
      claimed.add(entry);
    }
  }

  const unmatchedSlugs = slugs.filter((slug) => !matches.has(slug));
  if (unmatchedSlugs.length > 0) {
    const pool = manifest.filter((candidate) => !isReservedManifestEntry(candidate, reservedBasenames));
    for (const slug of unmatchedSlugs) {
      const entry = pool.find((candidate) => !claimed.has(candidate));
      if (entry) {
        matches.set(slug, entry);
        claimed.add(entry);
      }
    }
  }

  return matches;
}

function humanizeFilename(posixPath: string): string {
  const base = posixPath.split("/").pop() ?? posixPath;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function imagePath(slug: string, finalPath: string): string {
  return `/images/${slug}/${finalPath}`;
}

// override.image is a filename (matched the same way an auto-matched
// per-page banner image is - see findManifestEntry), not a literal path:
// it still has to go through image-pipeline for optimization/responsive
// variants like every other image, so a hand-written path would be wrong
// as soon as that pipeline's output naming changed.
function resolveOverrideImage(image: string | undefined, manifest: ImageManifestEntry[], slug: string): string | undefined {
  if (!image) return undefined;
  const entry = findManifestEntry(manifest, basenameNoExt(image));
  return entry ? imagePath(slug, entry.finalPath) : undefined;
}

// Sections assembleSite ever actually produces from parsed docx content
// (see packages/schema/src/parsed-docx-content.ts): intro/text/content/faq.
// A "content" section's blocks can mix prose with a table/list (a
// content-library entry that opens with paragraphs and backs them with a
// table, for instance) - only the "text" blocks are prose suitable for the
// hero, so this pulls just those out rather than requiring every block to
// be plain text before extracting anything. Whatever structured blocks are
// left behind stay as a shrunk version of the same section (given a
// distinct id so it doesn't collide with the hero's "intro" id once both
// are on the page) instead of being silently dropped.
function extractParagraphs(section: CasinoSection): { paragraphs: string[]; remainder: CasinoSection | undefined } {
  if (section.type === "text") {
    return { paragraphs: section.paragraphs, remainder: undefined };
  }
  if (section.type === "content") {
    const textBlocks = section.blocks.filter((block) => block.type === "text");
    if (textBlocks.length === 0) {
      return { paragraphs: [], remainder: section };
    }
    const paragraphs = textBlocks.flatMap((block) => block.paragraphs);
    const structuredBlocks = section.blocks.filter((block) => block.type !== "text");
    if (structuredBlocks.length === 0) {
      return { paragraphs, remainder: undefined };
    }
    return { paragraphs, remainder: { ...section, id: `${section.id}-details`, blocks: structuredBlocks } };
  }
  return { paragraphs: [], remainder: section };
}

// config.banner.text (optionally overridden per locale via
// config.banner.byLocale) is the site-wide default overlay headline for a
// page's hero banner - see siteBannerConfigSchema in packages/schema.
function resolveConfigBannerText(config: SiteConfig, locale: string): string | undefined {
  return config.banner.byLocale?.[locale]?.text ?? config.banner.text;
}

function buildIntroSection(
  page: CasinoPage,
  config: SiteConfig,
  manifest: ImageManifestEntry[],
  casinoName: string,
  locale: string,
  override: ParsedPageBannerOverride | undefined,
  pageImageMatches: Map<string, ImageManifestEntry>,
): { intro: CasinoSection; remainder: CasinoSection | undefined } {
  const first = page.sections[0];
  const { paragraphs, remainder } = first ? extractParagraphs(first) : { paragraphs: [], remainder: undefined };

  const overrideImage = resolveOverrideImage(override?.image, manifest, config.slug);
  const pageImage = pageImageMatches.get(page.slug);
  const autoImage = pageImage ? imagePath(config.slug, pageImage.finalPath) : undefined;
  const desktop = overrideImage ?? autoImage ?? config.banner.desktop;
  const mobile = overrideImage ?? autoImage ?? config.banner.mobile;

  const intro: CasinoSection = {
    type: "intro",
    id: "intro",
    title: page.title,
    paragraphs,
    banner: {
      desktop,
      mobile,
      alt: casinoName,
      text: override?.text ?? resolveConfigBannerText(config, locale) ?? page.title,
      buttonText: override?.buttonText ?? translate(locale, "intro.ctaText"),
      buttonLink: getRedirectHref(config.slug),
      buttonColor: config.banner.buttonColor ?? config.theme.primary,
      buttonTextColor: config.banner.buttonTextColor ?? "#FFFFFF",
      textColor: config.banner.textColor ?? "#FFFFFF",
    },
  };

  return { intro, remainder };
}

// A docx can supply banner overlay text (the "Hero Banner:" label,
// assembleSite -> banner.text) only for the home page, and even then only
// if the docx author included that label - so any intro still missing
// overlay text falls back to the page title rather than rendering an image
// with no headline on it. An overrides.<locale>.json banner entry (image/
// text/buttonText - see packages/overrides/README.md) wins over both the
// docx and that fallback, and is the only way to customize a non-home
// page's banner at all, since casino-v1-rules synthesizes those with no
// docx input to draw on in the first place.
// overrideImage (from overrides.<locale>.json) wins when present; otherwise
// autoImage (this page's own per-page-matched hero, from pageImageMatches -
// see buildPageImageMatches) wins; only a page with neither keeps whatever
// assembleSite already put in section.banner.desktop (config.banner.desktop,
// the site-wide shared fallback). Same three-tier priority buildIntroSection
// already used for a synthesized intro - this is what makes an
// already-"intro" page (every page of a content-library-composed site, or a
// docx site's home page) get its own generated hero too, instead of only
// ever reading the site-wide default.
function applyBannerOverride(
  section: CasinoSection,
  override: ParsedPageBannerOverride | undefined,
  manifest: ImageManifestEntry[],
  config: SiteConfig,
  locale: string,
  fallbackText: string,
  autoImage: string | undefined,
): CasinoSection {
  if (section.type !== "intro") return section;
  const overrideImage = resolveOverrideImage(override?.image, manifest, config.slug);
  return {
    ...section,
    banner: {
      ...section.banner!,
      desktop: overrideImage ?? autoImage ?? section.banner?.desktop,
      mobile: overrideImage ?? autoImage ?? section.banner?.mobile,
      text: override?.text ?? section.banner?.text ?? resolveConfigBannerText(config, locale) ?? fallbackText,
      // section.banner?.buttonText is only ever set by an explicit
      // config.banner.buttonText (assembleSite's buildSection leaves it
      // undefined otherwise) - so the translated default here is what
      // every content-library-composed page's hero actually renders,
      // matching buildIntroSection's own translate(locale, "intro.ctaText")
      // fallback below for the (docx-only) branch that skips this function.
      buttonText: override?.buttonText ?? section.banner?.buttonText ?? translate(locale, "intro.ctaText"),
    },
  };
}

function ensureIntro(
  page: CasinoPage,
  config: SiteConfig,
  manifest: ImageManifestEntry[],
  casinoName: string,
  locale: string,
  override: ParsedPageBannerOverride | undefined,
  pageImageMatches: Map<string, ImageManifestEntry>,
): CasinoPage {
  const pageImage = pageImageMatches.get(page.slug);
  const autoImage = pageImage ? imagePath(config.slug, pageImage.finalPath) : undefined;

  const first = page.sections[0];
  if (first?.type === "intro") {
    return {
      ...page,
      sections: [applyBannerOverride(first, override, manifest, config, locale, page.title, autoImage), ...page.sections.slice(1)],
    };
  }
  const { intro, remainder } = buildIntroSection(page, config, manifest, casinoName, locale, override, pageImageMatches);
  const rest = remainder ? [remainder, ...page.sections.slice(1)] : page.sections.slice(1);
  return { ...page, sections: [intro, ...rest] };
}

// Field sets deliberately mirror AuthFormSection.astro's own defaultFields
// (apps/templates/casino-v1/src/components/AuthFormSection.astro) - these
// forms only ever redirect to the affiliate link on submit (see that
// component's script), so there's no reason to ask for more than its
// original, already-designed field set: email+password for login,
// name+email+password for registration. No "remember me" checkbox, no
// confirm-password/country fields.
function buildSigninFormSection(locale: string): CasinoSection {
  return {
    type: "signinForm",
    id: "sign-in-form",
    title: translate(locale, "forms.login.title"),
    subtitle: translate(locale, "forms.login.subtitle"),
    fields: [
      { label: translate(locale, "forms.login.emailOrUsername"), name: "email", type: "email" },
      { label: translate(locale, "forms.login.password"), name: "password", type: "password" },
    ],
    buttonText: translate(locale, "forms.login.loginButton"),
    closeLabel: translate(locale, "forms.login.closeLabel"),
    redirectHref: "#",
  };
}

function buildSignupFormSection(locale: string): CasinoSection {
  return {
    type: "signupForm",
    id: "sign-up-form",
    title: translate(locale, "forms.registration.title"),
    subtitle: translate(locale, "forms.registration.subtitle"),
    fields: [
      { label: translate(locale, "forms.registration.username"), name: "username", type: "text" },
      { label: translate(locale, "forms.registration.email"), name: "email", type: "email" },
      { label: translate(locale, "forms.registration.password"), name: "password", type: "password" },
    ],
    buttonText: translate(locale, "forms.registration.signUpButton"),
    closeLabel: translate(locale, "forms.registration.closeLabel"),
    redirectHref: "#",
  };
}

function buildSlotItems(config: SiteConfig, manifest: ImageManifestEntry[]) {
  const slotEntries = manifest.filter((entry) => entry.original.toLowerCase().startsWith("slots/"));
  return slotEntries.map((entry) => {
    const title = humanizeFilename(entry.original);
    return { title, image: imagePath(config.slug, entry.finalPath), alt: title };
  });
}

function buildSlotsSection(config: SiteConfig, manifest: ImageManifestEntry[], locale: string): CasinoSection {
  return {
    type: "slots",
    id: "slots",
    title: translate(locale, "nav.slots"),
    href: "#",
    slots: buildSlotItems(config, manifest),
  };
}

// Home-page-only slots carousel for casino-v2 (see introSectionSchema's
// slotsSlider field) - rendered between the hero content and the quick-nav
// links, not a standalone page.sections entry, so it doesn't shift
// NavigationSection's "index === 0" positioning in CasinoPageView.astro.
// Undefined (not an empty array) when images/slots/* has nothing, so
// SlotsSlider.astro's own "slots.length > 0" check has something to key off
// without a separate has-slides flag threaded through.
function attachSlotsSlider(page: CasinoPage, config: SiteConfig, manifest: ImageManifestEntry[], locale: string): CasinoPage {
  const slots = buildSlotItems(config, manifest);
  if (slots.length === 0) return page;

  const first = page.sections[0];
  if (first?.type !== "intro") return page;

  return {
    ...page,
    sections: [{ ...first, slotsSlider: { title: translate(locale, "nav.slots"), slots } }, ...page.sections.slice(1)],
  };
}

function insertAfterIntro(page: CasinoPage, section: CasinoSection): CasinoPage {
  const rest = page.sections.slice(1);
  return { ...page, sections: [page.sections[0], section, ...rest] };
}

// Drops the content-library "cta" component's rendered section — the
// component itself stays exactly as authored (content:validate/stats/
// dedupe all still see it, and a future page could reintroduce it), this
// only ever stops it from reaching a page's section list. casino-v2 only,
// same scoping as attachSlotsSlider below: a plain text block reading like
// "Join now!" sitting alone at the very bottom of a page (its section id is
// always "cta", regardless of locale/component) reads as an afterthought
// once promo banners (below) are doing that job visually instead.
function removeCta(page: CasinoPage): CasinoPage {
  return { ...page, sections: page.sections.filter((section) => section.id !== "cta") };
}

// Insert a "banner" section (schema's bannerSectionSchema, rendered by
// ContentBannerSection.astro on both templates) after every this-many
// sections following the page's hero — casino-v2 only, for now.
const PROMO_BANNER_INTERVAL = 2;
// Never more than this many per page, however long the page is.
const MAX_PROMO_BANNERS = 4;

// Per-page alternate hero images — drop files named "<pageSlug>-alt-1.*"
// through "-alt-4.*" into the site's images/ folder alongside the page's
// own primary hero, which is still matched separately by
// buildPageImageMatches above. Ordered so promo banner 1 gets alt-1,
// banner 2 gets alt-2, and so on; cycles if a page somehow has more
// injected banners than alt images.
function buildPageAltImages(manifest: ImageManifestEntry[], pageSlug: string): ImageManifestEntry[] {
  const images: ImageManifestEntry[] = [];
  for (let n = 1; n <= MAX_PROMO_BANNERS; n++) {
    const entry = findManifestEntry(manifest, `${pageSlug}-alt-${n}`);
    if (entry) images.push(entry);
  }
  return images;
}

// Each injected banner prefers a real per-page image (see
// buildPageAltImages above) over the site's own shared config.banner
// image — previously every injected banner reused that one shared image
// regardless of which page or which position it was in; now it only falls
// back to that when no per-page pool exists (e.g. no AI-generated alt
// images for this site yet), so old sites keep working exactly as before.
function buildPromoBannerSection(id: string, config: SiteConfig, locale: string, image: ImageManifestEntry | undefined, siteSlug: string): CasinoSection {
  const desktop = image ? imagePath(siteSlug, image.finalPath) : config.banner.desktop;
  const mobile = image ? imagePath(siteSlug, image.finalPath) : config.banner.mobile;
  return {
    type: "banner",
    id,
    title: translate(locale, "promoBanner.heading"),
    banner: { desktop, mobile },
    bannerText: translate(locale, "promoBanner.overlayText"),
    ctaText: translate(locale, "intro.ctaText"),
  };
}

// Every page should read as having a real hero-banner presence (3-4
// hero/banner-style sections total, counting the intro), not just the
// content-rich pages that happen to have enough non-hero sections to space
// banners through. A short page (login/application/etc - hero + one form
// section) still gets this minimum, appended after its content rather than
// wedged between form fields.
const MIN_PROMO_BANNERS_SHORT_PAGE = 2;

// Spaces promo banners through the page's non-hero sections, capped at
// MAX_PROMO_BANNERS. A short page (e.g. login/application, which only ever
// have a hero + one form section) naturally never hits the spacing
// interval below, so a second pass tops it up to
// MIN_PROMO_BANNERS_SHORT_PAGE by appending banners after the page's
// existing content instead.
function injectPromoBanners(page: CasinoPage, config: SiteConfig, locale: string, manifest: ImageManifestEntry[]): CasinoPage {
  if (page.sections.length <= 1) return page;
  const [hero, ...rest] = page.sections;
  const altImages = buildPageAltImages(manifest, page.slug);

  const sections: CasinoSection[] = [hero];
  let bannerCount = 0;
  const nextBanner = () => {
    const image = altImages.length > 0 ? altImages[bannerCount % altImages.length] : undefined;
    bannerCount++;
    return buildPromoBannerSection(`promo-banner-${bannerCount}`, config, locale, image, config.slug);
  };

  rest.forEach((section, index) => {
    sections.push(section);
    const atInterval = (index + 1) % PROMO_BANNER_INTERVAL === 0;
    const isLastSection = index === rest.length - 1;
    if (atInterval && !isLastSection && bannerCount < MAX_PROMO_BANNERS) {
      sections.push(nextBanner());
    }
  });

  while (bannerCount < Math.min(MIN_PROMO_BANNERS_SHORT_PAGE, MAX_PROMO_BANNERS)) {
    sections.push(nextBanner());
  }

  return { ...page, sections };
}

function buildFixedMenu(pageBySlug: Map<string, CasinoPage>, locale: string, defaultLocale: string): NavItem[] {
  const menu: NavItem[] = [];

  if (pageBySlug.has("login")) {
    menu.push({ name: translate(locale, "nav.login"), href: pagePath("login", locale, defaultLocale) });
  }
  if (pageBySlug.has("application")) {
    menu.push({ name: translate(locale, "nav.signUp"), href: pagePath("application", locale, defaultLocale) });
  }
  if (pageBySlug.has("registration")) {
    menu.push({ name: translate(locale, "nav.registration"), href: pagePath("registration", locale, defaultLocale) });
  }
  menu.push({ name: translate(locale, "nav.application"), href: pagePath("index", locale, defaultLocale) });
  if (pageBySlug.has("withdrawal")) {
    menu.push({ name: translate(locale, "nav.withdrawal"), href: pagePath("withdrawal", locale, defaultLocale) });
  }
  if (pageBySlug.has("review")) {
    menu.push({ name: translate(locale, "nav.review"), href: pagePath("review", locale, defaultLocale) });
  }

  const bonusSlugs: Array<[string, string]> = [
    ["no-deposit-bonus", "nav.noDepositBonus"],
    ["free-spins", "nav.freeSpins"],
    ["promo-code", "nav.promoCodes"],
  ];
  const dropdown = bonusSlugs
    .filter(([slug]) => pageBySlug.has(slug))
    .map(([slug, key]) => ({ name: translate(locale, key), href: pagePath(slug, locale, defaultLocale) }));
  if (pageBySlug.has("bonus") || dropdown.length > 0) {
    menu.push({
      name: translate(locale, "nav.bonus"),
      // Clicking "Bonus" itself goes to the bonus page when one exists;
      // when it doesn't (only the dropdown's sub-pages do), there's
      // nowhere sensible to send a direct click, so it stays dropdown-only.
      href: pageBySlug.has("bonus") ? pagePath("bonus", locale, defaultLocale) : undefined,
      dropdown,
    });
  }

  if (pageBySlug.has("slots")) {
    menu.push({ name: translate(locale, "nav.slots"), href: pagePath("slots", locale, defaultLocale) });
  }

  return menu;
}

const FOOTER_LINKS: Array<[string, string]> = [
  ["responsible-gaming", "footer.responsibleGaming"],
  ["privacy-policy", "footer.privacyPolicy"],
  ["cookies-policy", "footer.cookiesPolicy"],
  ["betting-rules", "footer.bettingRules"],
  ["terms-conditions", "footer.termsConditions"],
  ["contacts", "footer.contacts"],
];

const LEGAL_SLUGS = new Set(FOOTER_LINKS.map(([slug]) => slug));

// The minimum age a visitor must confirm before entering the site (footer
// age badge, AgeGate popup in both templates, and the "{age}+" suffix in
// casino-v1-translations.ts's stickyBanner.disclaimer strings). Netherlands-
// licensed gambling sites require 24+, not the usual 18+ - see
// https://kansspelautoriteit.nl (Dutch gambling regulator) reclame/leeftijd
// rules.
//
// This is a property of which *market* the site targets, not of whichever
// language a given page happens to be rendered in: a site that has an "nl"
// locale configured at all is a Netherlands-targeted site, so its English
// pages are still shown to (or ordered for) NL players and must carry the
// same 24+ requirement as its Dutch pages - it can't fall back to 18+ just
// because English isn't the locale flagged in MINIMUM_AGE_BY_LOCALE. Hence
// this takes the *site's* full locale list and returns the strictest age
// across all of them, rather than looking at only the current page's locale.
const MINIMUM_AGE_BY_LOCALE: Record<string, number> = { nl: 24 };
const DEFAULT_MINIMUM_AGE = 18;

function resolveMinimumAge(config: SiteConfig): number {
  const ages = config.locales.map((entry) => MINIMUM_AGE_BY_LOCALE[entry.code] ?? DEFAULT_MINIMUM_AGE);
  return Math.max(DEFAULT_MINIMUM_AGE, ...ages);
}

// Same "nl locale configured at all" reasoning as resolveMinimumAge above:
// the age-confirmation popup itself is only a legal requirement for
// NL-targeted sites, so it's off by default everywhere else. config.json's
// ageGateEnabled (packages/schema/src/site-config.ts) always overrides this
// default when a specific site needs the gate on (or off) regardless of
// locale.
function resolveAgeGateEnabled(config: SiteConfig): boolean {
  return config.ageGateEnabled ?? config.locales.some((entry) => entry.code === "nl");
}

// casino-v1-translations.ts's ageGate strings use "{casinoName}"/"{age}" as
// plain literal placeholders (not a templating engine) - substituted here,
// once, in the visitor's locale, so both templates' AgeGate.astro just
// render the result as-is instead of each reimplementing this substitution.
function buildAgeGate(locale: string, casinoName: string, minimumAge: number) {
  const ageText = String(minimumAge);
  const fill = (template: string) => template.replace(/\{casinoName\}/g, casinoName).replace(/\{age\}/g, ageText);
  return {
    title: translate(locale, "ageGate.title"),
    body: fill(translate(locale, "ageGate.body")),
    confirmText: fill(translate(locale, "ageGate.confirmText")),
    declineText: translate(locale, "ageGate.declineText"),
    footnote: translate(locale, "ageGate.footnote"),
  };
}

export function applyCasinoV1Rules(
  casino: Casino,
  config: SiteConfig,
  manifest: ImageManifestEntry[],
  parsedPages: ParsedPage[] = [],
): Casino {
  const defaultLocale = resolveDefaultLocale(config);
  const locale = casino.locale ?? defaultLocale;
  const casinoName = config.navbar.brandName ?? config.slug;
  const pageBySlug = new Map(casino.pages.map((page) => [page.slug, page]));
  const bannerOverrideBySlug = new Map(parsedPages.map((page) => [page.slug, page.banner]));

  const menu = buildFixedMenu(pageBySlug, locale, defaultLocale);
  const navbar = {
    ...casino.navbar,
    menu,
    loginButton: casino.navbar.loginButton
      ? { ...casino.navbar.loginButton, text: translate(locale, "nav.login") }
      : casino.navbar.loginButton,
    signupButton: casino.navbar.signupButton
      ? { ...casino.navbar.signupButton, text: translate(locale, "nav.registration") }
      : casino.navbar.signupButton,
  };

  const footerLinks = FOOTER_LINKS.filter(([slug]) => pageBySlug.has(slug)).map(([slug, key]) => ({
    label: translate(locale, key),
    href: pagePath(slug, locale, defaultLocale),
  }));
  const logo1 = findManifestEntry(manifest, "footer-logo-1");
  const logo2 = findManifestEntry(manifest, "footer-logo-2");
  const logos =
    logo1 && logo2
      ? [
          { src: imagePath(config.slug, logo1.finalPath), alt: `${casinoName} Footer Logo 1` },
          { src: imagePath(config.slug, logo2.finalPath), alt: `${casinoName} Footer Logo 2` },
        ]
      : casino.footer.logos;
  const minimumAge = resolveMinimumAge(config);
  const ageGate = buildAgeGate(locale, casinoName, minimumAge);
  const ageGateEnabled = resolveAgeGateEnabled(config);
  const footer = {
    ...casino.footer,
    links: footerLinks,
    logos,
    ageBadge: { ...casino.footer.ageBadge, text: casino.footer.ageBadge?.text ?? `${minimumAge}+` },
  };

  // config.stickyBanner.byLocale[locale] carries this site's own per-locale
  // marketing copy and wins over both the locale-agnostic base field and
  // translate()'s generic fallback. bullets falls back to
  // translateStickyBannerBullets(locale) (generic "fast payouts" style
  // claims) the same way headline/disclaimer/buttonText already fall back
  // to translate() - a site that opts in via just `{}` still gets sensible
  // localized wording instead of an empty/broken bullet list.
  const stickyBannerOverride = config.stickyBanner?.byLocale?.[locale];
  const stickyBanner = casino.stickyBanner
    ? {
        ...casino.stickyBanner,
        headline: stickyBannerOverride?.headline ?? casino.stickyBanner.headline ?? translate(locale, "stickyBanner.headline"),
        bullets:
          stickyBannerOverride?.bullets ??
          (casino.stickyBanner.bullets && casino.stickyBanner.bullets.length > 0 ? casino.stickyBanner.bullets : undefined) ??
          translateStickyBannerBullets(locale),
        buttonText: stickyBannerOverride?.buttonText ?? casino.stickyBanner.buttonText ?? translate(locale, "intro.ctaText"),
        // The "{age}+" placeholder in this dictionary string uses the
        // site-wide resolved minimumAge, not a hardcoded per-locale number -
        // see resolveMinimumAge's comment on why (an English page on an
        // NL-targeted site is still 24+, not 18+).
        disclaimer:
          stickyBannerOverride?.disclaimer ??
          casino.stickyBanner.disclaimer ??
          translate(locale, "stickyBanner.disclaimer").replace("{age}", String(minimumAge)),
      }
    : casino.stickyBanner;

  // Every non-legal page is a candidate for auto-matching, regardless of
  // whether its first section already arrived as type "intro" - which one
  // that is varies by content source, not by whether the page deserves its
  // own image: a docx site's home page comes in pre-built as "intro" while
  // every other page gets one synthesized (assembleSite's buildSection
  // only ever produces "intro" from a docx's "Hero Banner:" block, which
  // only the home page has); a content-library-composed site instead gives
  // *every* page a literal "intro" component as its first section (every
  // page type's skeleton requires one - content-library/page-types.json),
  // since assembleSite's buildSection maps that component to type "intro"
  // too. Both branches of ensureIntro below now consult pageImageMatches,
  // so excluding already-intro pages here would silently leave every page
  // of a library-composed site on the site-wide config.banner.desktop
  // fallback instead of its own generated hero.
  // Legal pages stay in imageMatchSlugs too (unlike the hero/intro
  // treatment below, which is still skipped for them - they're plain text
  // pages by design) purely so the ogImage fix a few lines down has a
  // match to find. Without this, a legal page's seo.ogImage is stuck on
  // assembleSite's buildPageSeo default (config.banner.desktop) even when
  // that exact page already has its own hero image on disk (every page
  // gets one regardless of legal status) - config.banner.desktop is not
  // guaranteed to point at a real file (it's
  // only ever validated - see validate-library.ts's `images` check - when
  // a site actually has a local images/ directory), so a legal page could
  // reference a nonexistent image without ever having its own generated
  // one wired in.
  const imageMatchSlugs = casino.pages.map((page) => page.slug);
  const pageImageMatches = buildPageImageMatches(manifest, imageMatchSlugs, reservedImageBasenames(config));

  const pages = casino.pages.map((page) => {
    if (LEGAL_SLUGS.has(page.slug)) {
      const ogImagePageMatch = pageImageMatches.get(page.slug);
      return ogImagePageMatch
        ? { ...page, seo: { ...page.seo, ogImage: imagePath(config.slug, ogImagePageMatch.finalPath) } }
        : page;
    }

    let next = ensureIntro(page, config, manifest, casinoName, locale, bannerOverrideBySlug.get(page.slug), pageImageMatches);

    // seo.ogImage defaults to config.banner.desktop unconditionally
    // (assembleSite's buildPageSeo has no manifest access to do better) -
    // same fix as the intro banner above: a page's social-share preview
    // should be its own generated hero, not the site-wide fallback, once
    // one exists.
    const ogImagePageMatch = pageImageMatches.get(page.slug);
    if (ogImagePageMatch) {
      next = { ...next, seo: { ...next.seo, ogImage: imagePath(config.slug, ogImagePageMatch.finalPath) } };
    }

    if (page.slug === "login") {
      next = insertAfterIntro(next, buildSigninFormSection(locale));
    } else if (page.slug === "application") {
      next = insertAfterIntro(next, buildSignupFormSection(locale));
    } else if (page.slug === "slots") {
      next = insertAfterIntro(next, buildSlotsSection(config, manifest, locale));
    }

    if (page.slug === "index" && config.template === "casino-v2") {
      next = attachSlotsSlider(next, config, manifest, locale);
    }

    if (config.template === "casino-v2") {
      next = injectPromoBanners(removeCta(next), config, locale, manifest);
    }

    return next;
  });

  return { ...casino, navbar, footer, stickyBanner, pages, minimumAge, ageGate, ageGateEnabled };
}
