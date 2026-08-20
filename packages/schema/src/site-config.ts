import { z } from "zod";
import { themeSchema, casinoFooterLogoSchema } from "./casino.js";

// sites/<slug>/config.json — desired state for one deployable site.
// Actual state (Cloudflare project/domain/deployment history) lives in the
// registry (packages/registry), not here.
//
// Everything here is branding/config that a docx cannot supply: theme
// colors, logo, banner image, footer boilerplate. assemble-site
// (packages/codegen) combines this with docx-parser's output; the docx
// only ever supplies page copy/structure, never visual identity.

export const siteLocaleConfigSchema = z.object({
  code: z.string().min(1), // e.g. "en", "el", "de" — not a fixed enum, open per user requirement
  // Filename relative to the site dir, e.g. "casino.en.docx" — required
  // only when this site's contentSource resolves to "docx" (see this
  // file's `contentSource` field below); a "library" site has no docx at
  // all, so this stays optional at the schema level. The pipeline's
  // parse-docx stage is what actually enforces it's present when needed.
  docx: z.string().min(1).optional(),
  label: z.string().optional(), // display name for the language switcher, e.g. "English"
  flagImage: z.string().optional(),
  default: z.boolean().optional(),
});
export type SiteLocaleConfig = z.infer<typeof siteLocaleConfigSchema>;

export const siteNavbarConfigSchema = z.object({
  logo: z.string().optional(),
  brandName: z.string().optional(),
  // Whether brandName renders next to the logo in the navbar itself.
  // Independent of brandName's presence: brandName also feeds SEO
  // titles/descriptions, footer copy, and image alt text (see
  // assemble-site.ts), so a site can keep a real brandName for those while
  // hiding it from the navbar, or vice versa. Defaults to true whenever
  // brandName is set, matching the old (pre-toggle) behavior.
  showBrandName: z.boolean().optional(),
});
export type SiteNavbarConfig = z.infer<typeof siteNavbarConfigSchema>;

export const siteFooterConfigSchema = z.object({
  logos: z.array(casinoFooterLogoSchema).optional(),
  copyright: z.string().optional(),
  disclaimer: z.string().optional(),
  // Page slugs (must match slugs the docx actually produces) to link from
  // the footer, e.g. "privacy-policy". Defaults to a standard legal-page
  // set in assemble-site; only slugs that actually exist get linked.
  legalPageSlugs: z.array(z.string()).optional(),
});
export type SiteFooterConfig = z.infer<typeof siteFooterConfigSchema>;

// Per-locale wording overrides for stickyBanner/banner fields that are
// genuine marketing copy (not generic UI strings casino-v1-translations.ts
// could supply a per-locale default for) - a client's promo bullets or a
// hero headline reads differently per language, but config.json is shared
// across every locale a site has. Keyed by locale code, same as
// SiteLocaleConfig.code; applyCasinoV1Rules (packages/codegen) looks up the
// current locale's entry and layers it over the locale-agnostic base
// fields, which stay as the fallback for any locale without its own entry.
const stickyBannerLocaleOverrideSchema = z.object({
  headline: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  disclaimer: z.string().optional(),
  buttonText: z.string().optional(),
});

// Opt-in: only rendered when a site's config.json actually has one (see
// assemble-site.ts's buildStickyBanner). Wording defaults (headline,
// buttonText, disclaimer) come from casino-v1-rules.ts's translations when
// left unset here - this only needs to carry the branding/offer specifics
// that differ per site.
export const siteStickyBannerConfigSchema = z.object({
  logo: z.string().optional(),
  headline: z.string().optional(),
  // Optional, like headline/disclaimer/buttonText above: falls back to
  // casino-v1-translations.ts's translateStickyBannerBullets(locale) when
  // unset (casino-v1-rules.ts) - a site opts into the sticky banner/popup
  // with just `{}` and still gets sensible localized wording.
  bullets: z.array(z.string()).optional(),
  disclaimer: z.string().optional(),
  buttonText: z.string().optional(),
  byLocale: z.record(z.string(), stickyBannerLocaleOverrideSchema).optional(),
});
export type SiteStickyBannerConfig = z.infer<typeof siteStickyBannerConfigSchema>;

const bannerLocaleOverrideSchema = z.object({
  text: z.string().optional(),
  buttonText: z.string().optional(),
});

export const siteBannerConfigSchema = z.object({
  desktop: z.string(),
  mobile: z.string().optional(),
  // Site-wide default overlay text for a page's hero banner, used whenever
  // neither the docx (home page's "Hero banner:" line only) nor an
  // overrides.<locale>.json page.banner.text entry supplies one - see
  // buildIntroSection/applyBannerOverride in casino-v1-rules.ts. Without
  // this, every non-home page falls back to its own page title instead.
  text: z.string().optional(),
  buttonText: z.string().optional(),
  buttonColor: z.string().optional(),
  buttonTextColor: z.string().optional(),
  textColor: z.string().optional(),
  byLocale: z.record(z.string(), bannerLocaleOverrideSchema).optional(),
});
export type SiteBannerConfig = z.infer<typeof siteBannerConfigSchema>;

export const siteConfigSchema = z.object({
  slug: z.string().min(1),
  domains: z.array(z.string().min(1)).min(1),
  affiliateUrl: z.string().url(),
  template: z.string().min(1),
  // Optional: names a profiles/<id>.json (site-profile.ts) this site
  // inherits branding/config defaults from. Resolution order (global
  // defaults -> profile -> this config -> locale overrides) lives in the
  // profile loader (a later phase), not here — this only records which
  // profile, if any, was chosen.
  profile: z.string().optional(),
  locales: z.array(siteLocaleConfigSchema).min(1),
  theme: themeSchema,
  navbar: siteNavbarConfigSchema,
  footer: siteFooterConfigSchema.optional(),
  banner: siteBannerConfigSchema,
  stickyBanner: siteStickyBannerConfigSchema.optional(),
  favicon: z.string().optional(),
  ogImage: z.string().optional(),
  seo: z.object({ keywords: z.array(z.string()).optional() }).optional(),
  // Overrides casino-v1-rules.ts's default of "on only for sites with an
  // nl locale" (Dutch gambling law requires the age-confirmation popup;
  // most other jurisdictions the templates currently target don't).
  // Explicit true/false here always wins over that default.
  ageGateEnabled: z.boolean().optional(),
  // Which input produces this site's page content: "docx" reads
  // casino.<locale>.docx through the existing parser (packages/docx-parser);
  // "library" composes it from data.json + the content library
  // (packages/content-library, a later phase). Both paths converge on the
  // same ParsedDocxContent shape before assembleSite ever runs, so nothing
  // past that point needs to know which one produced it.
  //
  // Optional, and deliberately NOT inferred from which files happen to
  // exist on disk (a stray data.json next to a real docx must never
  // silently flip what gets built). Left unset, the pipeline's
  // load-config stage falls back to "docx" only in the one unambiguous
  // legacy case — a docx file present, no data.json — which is every site
  // in this repo today; anything more ambiguous than that (both present,
  // or neither) fails load-config loudly, naming the fix, rather than
  // guessing. new-site and import-sites always set this explicitly for
  // anything they scaffold.
  contentSource: z.enum(["docx", "library"]).optional(),
});
export type SiteConfig = z.infer<typeof siteConfigSchema>;

// The RAW per-site sites/<slug>/config.json contract — looser than
// siteConfigSchema above. template/theme/navbar/banner become optional
// here because profiles/_base.json and a named profile (site-profile.ts)
// can each supply a default for exactly these fields (architecture doc
// §35's precedence chain); every other field stays required since
// nothing in that chain can fill it in (slug/domains/affiliateUrl/locales
// are always genuinely site-specific).
//
// This is the schema the pipeline's load-config stage parses config.json
// against; the result of merging it with any base/profile defaults
// (packages/generator-cli's resolveSiteConfig) is then re-validated
// against siteConfigSchema itself before anything downstream ever sees
// it, so SiteConfig's own meaning — "every branding field is genuinely
// present" — never changes.
export const siteConfigInputSchema = siteConfigSchema.partial({
  template: true,
  theme: true,
  navbar: true,
  banner: true,
});
export type SiteConfigInput = z.infer<typeof siteConfigInputSchema>;
