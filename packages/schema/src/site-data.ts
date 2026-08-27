import { z } from "zod";

// sites/<slug>/data.json — verified, site-specific facts, kept separate
// from config.json's branding/visual concerns (see site-config.ts's own
// header comment). Every field is optional: a content-library component or
// FAQ item only ever gets selected once its `requires` list is fully
// satisfied by what's actually here (packages/content-library, a later
// phase) — nothing downstream fabricates a value this file doesn't supply.
//
// Deliberately narrow — only fields an existing or planned content-library
// placeholder/FAQ `requires` entry actually needs, not a general "every
// fact about a casino" schema. Add a field here only once something in the
// content library actually consumes it.

export const welcomeBonusSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(1),
  percentage: z.number().positive().optional(),
});
export type WelcomeBonus = z.infer<typeof welcomeBonusSchema>;

// A no-deposit bonus is a distinct offer from welcomeBonus (credited
// without requiring a deposit at all) — modeled the same shape as
// welcomeBonus rather than reusing it, since a site can plausibly have
// one, the other, both, or neither, and conflating them would make a
// no-deposit-bonus page's content indistinguishable from the main bonus
// page's.
export const noDepositBonusSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(1),
});
export type NoDepositBonus = z.infer<typeof noDepositBonusSchema>;

export const freeSpinsSchema = z.object({
  count: z.number().int().positive(),
});
export type FreeSpins = z.infer<typeof freeSpinsSchema>;

// An ISO 3166-1 alpha-2 country code — the *market* the site is licensed
// for and sells to, which is not the same thing as the language it's
// written in and can't be derived from it: a de-DE site can be licensed
// for Switzerland, and an en + et locale pair can address one Estonian
// market in two languages. Uppercase-only on purpose, so "Switzerland" or
// "ch" fails at load time rather than silently reaching Intl.DisplayNames
// (which would hand back a placeholder name for either).
export const geoCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, 'must be an ISO 3166-1 alpha-2 country code in uppercase (e.g. "CH", "CA")');

// Either one code for the whole site (the normal case: one market, N
// languages) or a per-locale map for the genuine exception where a second
// language targets a different market: { "de-DE": "CH", "en-US": "GB" }.
export const siteGeoSchema = z.union([geoCodeSchema, z.record(z.string().min(1), geoCodeSchema)]);
export type SiteGeo = z.infer<typeof siteGeoSchema>;

// Semantic image roles (§22 of the architecture doc) — e.g. { hero: "...",
// logo: "...", slots: ["...", "..."] }. Open-ended by design: which roles
// exist depends on the site's page types, not a fixed enum. Consumed by
// the (later) image-matching layer as a lookup that's tried before falling
// back to casino-v1-rules.ts's filename/token-run auto-matching.
export const siteDataImagesSchema = z.record(z.string().min(1), z.union([z.string(), z.array(z.string())]));
export type SiteDataImages = z.infer<typeof siteDataImagesSchema>;

export const siteDataSchema = z.object({
  brandName: z.string().min(1).optional(),
  geo: siteGeoSchema.optional(),
  foundedYear: z.number().int().positive().optional(),
  welcomeBonus: welcomeBonusSchema.optional(),
  minimumDeposit: z.number().nonnegative().optional(),
  gameCount: z.number().int().positive().optional(),
  paymentMethods: z.array(z.string().min(1)).optional(),
  withdrawalMethods: z.array(z.string().min(1)).optional(),
  supportedCurrencies: z.array(z.string().min(1)).optional(),
  noDepositBonus: noDepositBonusSchema.optional(),
  freeSpins: freeSpinsSchema.optional(),
  // A literal code a player enters to unlock a promotion — free-text since
  // real promo codes have no fixed format across operators.
  promoCode: z.string().min(1).optional(),

  // Composition inputs below — not facts about the casino itself, but
  // still site-specific enough to belong in data.json rather than
  // config.json (config.json stays visual/branding-only, per its header
  // comment).
  //
  // Names a profiles/<id>.json (site-profile.ts) this site's content
  // composition defaults from — independent of config.json's own
  // `profile` field, which resolves branding/theme defaults. A site can
  // reference the same profile id in both places (the common case) or
  // diverge if its visual identity and its content defaults genuinely
  // need to come from different profiles.
  profile: z.string().optional(),
  // Seeds deterministic content selection together with slug+locale (see
  // the architecture doc's §26) — bump this to intentionally recompose an
  // already-generated site after a content-library update, without
  // otherwise touching the site's files.
  contentVersion: z.string().optional(),
  // Overrides the profile's/global default skeleton id for this site.
  skeleton: z.string().optional(),
  // Which page slugs to generate — the fixed vocabulary
  // casino-v1-rules.ts already recognizes (index, review, bonus,
  // withdrawal, slots, login, application, no-deposit-bonus, free-spins,
  // promo-code, plus the legal slugs). Optional: a later phase's defaults
  // resolver supplies a standard set when this is omitted.
  pages: z.array(z.string().min(1)).optional(),
  images: siteDataImagesSchema.optional(),
});
export type SiteData = z.infer<typeof siteDataSchema>;

// The market a given locale's pages target. Per-locale map first (exact
// locale code, then its bare language subtag, so a { "de": "CH" } entry
// still covers a "de-DE" locale), then the site-wide code, then the
// locale's own region subtag as a last resort — "de-CH" implies CH even
// when nobody wrote `geo` down. Returns undefined when there is genuinely
// nothing to go on (a bare "de" locale with no geo set); callers degrade
// rather than guess a market.
export function resolveGeo(geo: SiteGeo | undefined, locale: string): string | undefined {
  const languageSubtag = locale.split("-")[0];
  if (typeof geo === "string") return geo;
  if (geo) {
    const mapped = geo[locale] ?? geo[languageSubtag];
    if (mapped) return mapped;
  }
  const region = locale.split("-")[1]?.toUpperCase();
  return region && /^[A-Z]{2}$/.test(region) ? region : undefined;
}
