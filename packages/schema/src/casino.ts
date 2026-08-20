import { z } from "zod";

export const languageOptionSchema = z.object({
  label: z.string(),
  code: z.string(),
  flagImage: z.string().optional(),
  flagFile: z.string().optional(),
  href: z.string().optional(),
  active: z.boolean().optional(),
});
export type LanguageOption = z.infer<typeof languageOptionSchema>;

export const themeSchema = z.object({
  primary: z.string(),
  secondary: z.string(),
  accent: z.string().optional(),
  background: z.string().optional(),
  surface: z.string().optional(),
  text: z.string().optional(),
  mutedText: z.string().optional(),
  border: z.string().optional(),
  sectionBackground: z.string().optional(),
  sectionText: z.string().optional(),
  headingText: z.string().optional(),
  link: z.string().optional(),
  linkHover: z.string().optional(),
  footerBackground: z.string().optional(),
  footerText: z.string().optional(),
  navigationBackground: z.string().optional(),
  // The sticky site-header navbar specifically - independent of `surface`,
  // which the navbar used to share with unrelated elements (e.g. the
  // login/signup form cards), so changing one no longer forces the other
  // to change too. Falls back to `surface` when unset.
  navbarBackground: z.string().optional(),
  // Text/link color inside the navbar specifically. There's no safe generic
  // default for this (a dark navbarBackground needs light text, a light one
  // needs dark text - the two can't share one fallback), so set it
  // explicitly whenever navbarBackground moves away from the default light
  // surface. Falls back to the page's normal `text`/`secondary` otherwise.
  navbarText: z.string().optional(),
  rowColor: z.string().optional(),
  rowTextColor: z.string().optional(),
});
export type Theme = z.infer<typeof themeSchema>;

export const linkItemSchema = z.object({
  label: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  href: z.string(),
});
export type LinkItem = z.infer<typeof linkItemSchema>;

export const navItemSchema = z.object({
  name: z.string(),
  href: z.string().optional(),
  dropdown: z
    .array(
      z.object({
        name: z.string(),
        href: z.string(),
      }),
    )
    .optional(),
});
export type NavItem = z.infer<typeof navItemSchema>;

export const buttonStyleSchema = z.object({
  background: z.string().optional(),
  border: z.string().optional(),
  text: z.string().optional(),
  hover: z.string().optional(),
});
export type ButtonStyle = z.infer<typeof buttonStyleSchema>;

export const buttonConfigSchema = z.object({
  text: z.string(),
  href: z.string(),
  style: buttonStyleSchema.optional(),
});
export type ButtonConfig = z.infer<typeof buttonConfigSchema>;

export const bannerSchema = z.object({
  desktop: z.string(),
  mobile: z.string().optional(),
  alt: z.string().optional(),
  text: z.string().optional(),
  textColor: z.string().optional(),
  buttonText: z.string().optional(),
  buttonLink: z.string().optional(),
  buttonColor: z.string().optional(),
  buttonTextColor: z.string().optional(),
});
export type Banner = z.infer<typeof bannerSchema>;

export const componentThemeSchema = themeSchema.partial().extend({
  background: z.string().optional(),
  text: z.string().optional(),
  title: z.string().optional(),
  cardBackground: z.string().optional(),
  cardText: z.string().optional(),
  buttonBackground: z.string().optional(),
  buttonText: z.string().optional(),
  buttonHover: z.string().optional(),
  border: z.string().optional(),
});
export type ComponentTheme = z.infer<typeof componentThemeSchema>;

// --- content blocks (used inside a "content" section) ---

export const textBlockSchema = z.object({
  type: z.literal("text"),
  paragraphs: z.array(z.string()),
});
export type TextBlock = z.infer<typeof textBlockSchema>;

export const tableBlockSchema = z.object({
  type: z.literal("table"),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  theme: themeSchema.partial().optional(),
});
export type TableBlock = z.infer<typeof tableBlockSchema>;

export const listBlockSchema = z.object({
  type: z.literal("list"),
  title: z.string().optional(),
  items: z.array(z.string()),
});
export type ListBlock = z.infer<typeof listBlockSchema>;

export const quoteBlockSchema = z.object({
  type: z.literal("quote"),
  text: z.string(),
  author: z.string().optional(),
  theme: componentThemeSchema.optional(),
});
export type QuoteBlock = z.infer<typeof quoteBlockSchema>;

export const calloutBlockSchema = z.object({
  type: z.literal("callout"),
  title: z.string().optional(),
  text: z.string(),
  background: z.string().optional(),
  borderColor: z.string().optional(),
});
export type CalloutBlock = z.infer<typeof calloutBlockSchema>;

// Content-library entries can use Markdown-style headings to preserve the
// section hierarchy of long legal pages without requiring one file per
// subsection. Docx-authored content never emits this block type; it is an
// additive library-only representation.
export const headingBlockSchema = z.object({
  type: z.literal("heading"),
  level: z.union([z.literal(3), z.literal(4)]),
  text: z.string(),
});
export type HeadingBlock = z.infer<typeof headingBlockSchema>;

export const contentBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  tableBlockSchema,
  listBlockSchema,
  headingBlockSchema,
  quoteBlockSchema,
  calloutBlockSchema,
]);
export type ContentBlock = z.infer<typeof contentBlockSchema>;

// --- sections (a page is made of these) ---

const baseSectionFields = {
  id: z.string(),
  title: z.string(),
  theme: componentThemeSchema.optional(),
};
export const baseSectionSchema = z.object(baseSectionFields);
export type BaseSection = z.infer<typeof baseSectionSchema>;

export const slotItemSchema = z.object({
  title: z.string(),
  image: z.string(),
  alt: z.string().optional(),
});
export type SlotItem = z.infer<typeof slotItemSchema>;

export const introSectionSchema = z.object({
  ...baseSectionFields,
  type: z.literal("intro"),
  paragraphs: z.array(z.string()).optional(),
  banner: bannerSchema.optional(),
  navigation: z
    .array(
      z.object({
        title: z.string(),
        href: z.string(),
      }),
    )
    .optional(),
  // Optional slots carousel rendered between the hero content and the
  // quick-nav links (see CasinoPageView.astro) - casino-v2's home page
  // only, synthesized in casino-v1-rules.ts from images/slots/* the same
  // way the /slots page's grid is, not something a docx can supply.
  slotsSlider: z
    .object({
      title: z.string().optional(),
      slots: z.array(slotItemSchema),
    })
    .optional(),
});
export type IntroSection = z.infer<typeof introSectionSchema>;

export const contentSectionSchema = z.object({
  ...baseSectionFields,
  type: z.literal("content"),
  blocks: z.array(contentBlockSchema),
});
export type ContentSection = z.infer<typeof contentSectionSchema>;

export const textSectionSchema = z.object({
  ...baseSectionFields,
  type: z.literal("text"),
  paragraphs: z.array(z.string()),
});
export type TextSection = z.infer<typeof textSectionSchema>;

export const tableSectionSchema = z.object({
  ...baseSectionFields,
  type: z.literal("table"),
  paragraphs: z.array(z.string()).optional(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});
export type TableSection = z.infer<typeof tableSectionSchema>;

export const listSectionSchema = z.object({
  ...baseSectionFields,
  type: z.literal("list"),
  paragraphs: z.array(z.string()).optional(),
  items: z.array(z.string()),
});
export type ListSection = z.infer<typeof listSectionSchema>;

export const stepsSectionSchema = z.object({
  ...baseSectionFields,
  type: z.literal("steps"),
  paragraphs: z.array(z.string()).optional(),
  steps: z.array(z.string()),
});
export type StepsSection = z.infer<typeof stepsSectionSchema>;

export const bannerSectionSchema = z.object({
  ...baseSectionFields,
  type: z.literal("banner"),
  paragraphs: z.array(z.string()).optional(),
  banner: bannerSchema.optional(),
  bannerMobile: z.string().optional(),
  bannerText: z.string().optional(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
});
export type BannerSection = z.infer<typeof bannerSectionSchema>;

export const faqSectionSchema = z.object({
  ...baseSectionFields,
  type: z.literal("faq"),
  items: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    }),
  ),
});
export type FAQSection = z.infer<typeof faqSectionSchema>;

export const authFieldSchema = z.object({
  label: z.string(),
  name: z.string(),
  type: z.string().optional(),
  placeholder: z.string().optional(),
});
export type AuthField = z.infer<typeof authFieldSchema>;

// Zod's discriminatedUnion needs one literal per variant, so the original
// `type: "signupForm" | "signinForm"` becomes two variants sharing the same
// fields; AuthFormSection is their union, same as before.
const authFormFields = {
  ...baseSectionFields,
  subtitle: z.string().optional(),
  fields: z.array(authFieldSchema).optional(),
  buttonText: z.string().optional(),
  closeLabel: z.string().optional(),
  redirectHref: z.string(),
  legalText: z.string().optional(),
};

export const signupFormSectionSchema = z.object({
  ...authFormFields,
  type: z.literal("signupForm"),
});
export const signinFormSectionSchema = z.object({
  ...authFormFields,
  type: z.literal("signinForm"),
});
export type AuthFormSection =
  | z.infer<typeof signupFormSectionSchema>
  | z.infer<typeof signinFormSectionSchema>;

export const slotsSectionSchema = z.object({
  ...baseSectionFields,
  type: z.literal("slots"),
  subtitle: z.string().optional(),
  slots: z.array(slotItemSchema).optional(),
  href: z.string(),
  playText: z.string().optional(),
  demoText: z.string().optional(),
});
export type SlotsSection = z.infer<typeof slotsSectionSchema>;

export const quoteSectionSchema = z.object({
  ...baseSectionFields,
  type: z.literal("quote"),
  text: z.string(),
  author: z.string().optional(),
  eyebrow: z.string().optional(),
});
export type QuoteSection = z.infer<typeof quoteSectionSchema>;

export const casinoSectionSchema = z.discriminatedUnion("type", [
  introSectionSchema,
  contentSectionSchema,
  textSectionSchema,
  tableSectionSchema,
  listSectionSchema,
  stepsSectionSchema,
  bannerSectionSchema,
  faqSectionSchema,
  signupFormSectionSchema,
  signinFormSectionSchema,
  slotsSectionSchema,
  quoteSectionSchema,
]);
export type CasinoSection = z.infer<typeof casinoSectionSchema>;

// --- pages ---

export const casinoPageSeoSchema = z.object({
  title: z.string(),
  description: z.string(),
  keywords: z.array(z.string()).optional(),
  canonical: z.string().optional(),
  ogImage: z.string().optional(),
  favicon: z.string().optional(),
  lang: z.string().optional(),
  noindex: z.boolean().optional(),
});
export type CasinoPageSeo = z.infer<typeof casinoPageSeoSchema>;

export const casinoPageSchema = z.object({
  slug: z.string(),
  title: z.string(),
  navLabel: z.string().optional(),
  seo: casinoPageSeoSchema,
  sections: z.array(casinoSectionSchema),
});
export type CasinoPage = z.infer<typeof casinoPageSchema>;

// --- casino (site) ---

export const casinoNavbarSchema = z.object({
  logo: z.string().optional(),
  brandName: z.string().optional(),
  showBrandName: z.boolean().optional(),
  homeHref: z.string().optional(),
  menu: z.array(navItemSchema).optional(),
  loginButton: buttonConfigSchema.optional(),
  signupButton: buttonConfigSchema.optional(),
  languageOptions: z.array(languageOptionSchema).optional(),
});
export type CasinoNavbar = z.infer<typeof casinoNavbarSchema>;

export const casinoFooterLogoSchema = z.object({
  src: z.string(),
  alt: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const casinoFooterAgeBadgeSchema = z.object({
  text: z.string().optional(),
  background: z.string().optional(),
  textColor: z.string().optional(),
  borderColor: z.string().optional(),
});

export const casinoFooterSchema = z.object({
  links: z.array(linkItemSchema).optional(),
  logos: z.array(casinoFooterLogoSchema).optional(),
  ageBadge: casinoFooterAgeBadgeSchema.optional(),
  casinoName: z.string().optional(),
  copyright: z.string().optional(),
  disclaimer: z.string().optional(),
});
export type CasinoFooter = z.infer<typeof casinoFooterSchema>;

// A sticky bottom bar, present on every page (not per-page content - a docx
// has no way to describe it, same reasoning as navbar/footer). Optional:
// only rendered when a site's config actually supplies one.
export const stickyBannerSchema = z.object({
  logo: z.string().optional(),
  casinoName: z.string().optional(),
  headline: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  disclaimer: z.string().optional(),
  buttonText: z.string().optional(),
  buttonLink: z.string().optional(),
});
export type StickyBanner = z.infer<typeof stickyBannerSchema>;

// Pre-translated AgeGate popup copy (see casino-v1-translations.ts's
// "ageGate" dictionary entry) - already has {casinoName}/{age} substituted
// by casino-v1-rules.ts, so templates render these strings as-is.
export const casinoAgeGateSchema = z.object({
  title: z.string(),
  body: z.string(),
  confirmText: z.string(),
  declineText: z.string(),
  footnote: z.string(),
});
export type CasinoAgeGate = z.infer<typeof casinoAgeGateSchema>;

export const casinoSchema = z.object({
  slug: z.string(),
  locale: z.string().optional(),
  name: z.string(),
  favicon: z.string().optional(),
  theme: themeSchema,
  navbar: casinoNavbarSchema,
  footer: casinoFooterSchema,
  stickyBanner: stickyBannerSchema.optional(),
  // The minimum age visitors must confirm on entry (AgeGate, both
  // templates) - defaults to 18 wherever unset. Set per-locale by
  // casino-v1-rules.ts (MINIMUM_AGE_BY_LOCALE), not hand-authored in
  // config.json: a jurisdiction's legal gambling age isn't a per-site
  // branding choice, so every site in that locale should get it
  // automatically rather than each new site's config needing to remember it.
  minimumAge: z.number().int().positive().optional(),
  ageGate: casinoAgeGateSchema.optional(),
  // Whether the AgeGate popup renders at all (both templates) — set by
  // casino-v1-rules.ts from config.ageGateEnabled, defaulting to "on only
  // for sites with an nl locale". Defaults to true here (fail-safe: a
  // Casino built by anything that skips that rule still shows the gate
  // rather than silently omitting it).
  ageGateEnabled: z.boolean().optional(),
  pages: z.array(casinoPageSchema),
});
export type Casino = z.infer<typeof casinoSchema>;
