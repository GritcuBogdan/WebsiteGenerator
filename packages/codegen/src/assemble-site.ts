import {
  casinoSchema,
  type Casino,
  type CasinoPage,
  type CasinoSection,
  type LanguageOption,
  type ParsedDocxContent,
  type ParsedPage,
  type ParsedSection,
  type SiteConfig,
} from "schema";
import { translate } from "./casino-v1-translations.js";

// Pages linked from the footer if (and only if) the docx actually produced
// a page with that slug. Overridable per site via config.footer.legalPageSlugs.
const DEFAULT_LEGAL_PAGE_SLUGS = [
  "privacy-policy",
  "cookies-policy",
  "terms-conditions",
  "betting-rules",
  "responsible-gaming",
  "contacts",
];
// Maps each legal slug to its casino-v1-translations.ts "footer.*" key
// (already localized for every dictionary locale - de/nl/fi/sv/el/no) so
// footer links get real translated labels instead of English text on every
// locale. Falls back to translate()'s own English default for a locale
// this table doesn't cover.
const LEGAL_PAGE_LABEL_KEYS: Record<string, string> = {
  "privacy-policy": "footer.privacyPolicy",
  "cookies-policy": "footer.cookiesPolicy",
  "terms-conditions": "footer.termsConditions",
  "betting-rules": "footer.bettingRules",
  "responsible-gaming": "footer.responsibleGaming",
  contacts: "footer.contacts",
};
const DEFAULT_KEYWORD_SUFFIX = ["online casino", "casino bonus", "casino games"];

export function getRedirectHref(slug: string): string {
  return `/go/${slug}`;
}

export function pagePath(pageSlug: string, locale: string, defaultLocale: string): string {
  const prefix = locale === defaultLocale ? "" : `/${locale}`;
  return pageSlug === "index" ? `${prefix}/` : `${prefix}/${pageSlug}/`;
}

export function resolveDefaultLocale(config: SiteConfig): string {
  return config.locales.find((entry) => entry.default)?.code ?? config.locales[0].code;
}

// Locale metadata (label/flag) needed for the language switcher isn't part
// of any single locale's Casino object — it's config-level, spanning every
// locale a site has — so it's generated once alongside siteLocales rather
// than folded into assembleSite's per-locale output.
export function buildLanguageOptions(config: SiteConfig): LanguageOption[] {
  return config.locales.map((locale) => ({
    code: locale.code,
    label: locale.label ?? locale.code.toUpperCase(),
    flagImage: locale.flagImage,
  }));
}

function buildNavbar(config: SiteConfig, pages: ParsedPage[], locale: string, defaultLocale: string) {
  const menu = pages
    .filter((page) => page.slug !== "index")
    .map((page) => ({
      name: page.navLabel ?? page.title,
      href: pagePath(page.slug, locale, defaultLocale),
    }));

  const hasLogin = pages.some((page) => page.slug === "login");
  const hasApplication = pages.some((page) => page.slug === "application");

  return {
    logo: config.navbar.logo,
    brandName: config.navbar.brandName ?? config.slug,
    showBrandName: config.navbar.showBrandName ?? Boolean(config.navbar.brandName),
    homeHref: pagePath("index", locale, defaultLocale),
    menu,
    loginButton: hasLogin
      ? {
          text: "Login",
          href: pagePath("login", locale, defaultLocale),
          style: { background: "transparent", border: config.theme.primary, text: config.theme.primary },
        }
      : undefined,
    signupButton: hasApplication
      ? {
          text: "Sign Up",
          href: pagePath("application", locale, defaultLocale),
          style: { background: config.theme.primary, text: "#ffffff" },
        }
      : undefined,
  };
}

function buildFooter(config: SiteConfig, pages: ParsedPage[], locale: string, defaultLocale: string) {
  const legalSlugs = config.footer?.legalPageSlugs ?? DEFAULT_LEGAL_PAGE_SLUGS;
  const existingSlugs = new Set(pages.map((page) => page.slug));

  const links = legalSlugs
    .filter((slug) => existingSlugs.has(slug))
    .map((slug) => ({
      label: LEGAL_PAGE_LABEL_KEYS[slug] ? translate(locale, LEGAL_PAGE_LABEL_KEYS[slug]) : slug,
      href: pagePath(slug, locale, defaultLocale),
    }));

  return {
    links,
    logos: config.footer?.logos ?? [],
    casinoName: config.navbar.brandName ?? config.slug,
    copyright: config.footer?.copyright ?? "All rights reserved.",
    disclaimer:
      config.footer?.disclaimer ??
      "By using this website you agree to our Privacy Policy and Terms & Conditions.",
  };
}

function buildSection(section: ParsedSection, config: SiteConfig): CasinoSection {
  switch (section.type) {
    case "intro":
      return {
        type: "intro",
        id: section.id,
        title: section.title,
        paragraphs: section.paragraphs,
        navigation: section.navigation,
        banner: {
          desktop: config.banner.desktop,
          mobile: config.banner.mobile,
          alt: config.navbar.brandName ?? config.slug,
          text: section.bannerText,
          // Left undefined (not a hardcoded English default) when the site
          // doesn't set one - applyBannerOverride (casino-v1-rules.ts) is
          // what every content-library-composed page's hero actually goes
          // through, and it fills this in with the locale-translated
          // "intro.ctaText" default. Hardcoding English here would win over
          // that translation since this value is never undefined otherwise.
          buttonText: config.banner.buttonText,
          buttonLink: getRedirectHref(config.slug),
          textColor: config.banner.textColor ?? "#FFFFFF",
          buttonColor: config.banner.buttonColor ?? config.theme.primary,
          buttonTextColor: config.banner.buttonTextColor ?? "#FFFFFF",
        },
      };
    case "text":
      return { type: "text", id: section.id, title: section.title, paragraphs: section.paragraphs };
    case "content":
      return { type: "content", id: section.id, title: section.title, blocks: section.blocks };
    case "faq":
      return { type: "faq", id: section.id, title: section.title, items: section.items };
  }
}

function buildStickyBanner(config: SiteConfig) {
  if (!config.stickyBanner) return undefined;
  return {
    logo: config.stickyBanner.logo ?? config.navbar.logo,
    casinoName: config.navbar.brandName ?? config.slug,
    headline: config.stickyBanner.headline,
    bullets: config.stickyBanner.bullets,
    disclaimer: config.stickyBanner.disclaimer,
    buttonText: config.stickyBanner.buttonText,
    buttonLink: getRedirectHref(config.slug),
  };
}

function buildPageSeo(page: ParsedPage, config: SiteConfig, locale: string, canonical: string) {
  const brandName = config.navbar.brandName ?? config.slug;

  return {
    title: page.meta.title ?? `${page.title} - ${brandName}`,
    description:
      page.meta.description ??
      `Read about ${page.title.toLowerCase()} at ${brandName}, including bonuses, payments, games and player support.`,
    keywords: config.seo?.keywords ?? [config.slug, ...DEFAULT_KEYWORD_SUFFIX],
    canonical,
    ogImage: config.ogImage ?? config.banner.desktop,
    favicon: config.favicon,
    lang: locale,
  };
}

// Combines one locale's parsed docx content with the site's config
// (branding the docx can't supply: theme, logo, banner image, footer
// boilerplate) into a full, schema-valid Casino. One call = one locale;
// generate-content.ts packages multiple locales' output together.
export function assembleSite(content: ParsedDocxContent, config: SiteConfig): Casino {
  const localeConfig = config.locales.find((entry) => entry.code === content.locale);
  if (!localeConfig) {
    throw new Error(`No locale "${content.locale}" configured for site "${config.slug}"`);
  }
  const defaultLocale = resolveDefaultLocale(config);

  const pages: CasinoPage[] = content.pages.map((page) => ({
    slug: page.slug,
    title: page.title,
    navLabel: page.navLabel,
    seo: buildPageSeo(page, config, content.locale, pagePath(page.slug, content.locale, defaultLocale)),
    sections: page.sections.map((section) => buildSection(section, config)),
  }));

  const casino: Casino = {
    slug: config.slug,
    locale: content.locale,
    name: config.navbar.brandName ?? config.slug,
    favicon: config.favicon,
    theme: config.theme,
    navbar: buildNavbar(config, content.pages, content.locale, defaultLocale),
    footer: buildFooter(config, content.pages, content.locale, defaultLocale),
    stickyBanner: buildStickyBanner(config),
    pages,
  };

  // Round-trip through JSON now rather than let the two diverge: this
  // object is only ever going to live on disk as JSON (generate-content
  // writes it via JSON.stringify), and JSON.stringify silently drops
  // undefined-valued keys (signupButton, banner.mobile, ...) that the
  // builders above leave present-but-undefined. Normalizing here means
  // assembleSite's return value already matches what a later
  // writeSiteContent + re-import produces, instead of only matching after
  // a save/load cycle.
  return casinoSchema.parse(JSON.parse(JSON.stringify(casino)));
}
