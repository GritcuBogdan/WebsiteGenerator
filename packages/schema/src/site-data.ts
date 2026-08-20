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

// Semantic image roles (§22 of the architecture doc) — e.g. { hero: "...",
// logo: "...", slots: ["...", "..."] }. Open-ended by design: which roles
// exist depends on the site's page types, not a fixed enum. Consumed by
// the (later) image-matching layer as a lookup that's tried before falling
// back to casino-v1-rules.ts's filename/token-run auto-matching.
export const siteDataImagesSchema = z.record(z.string().min(1), z.union([z.string(), z.array(z.string())]));
export type SiteDataImages = z.infer<typeof siteDataImagesSchema>;

export const siteDataSchema = z.object({
  brandName: z.string().min(1).optional(),
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
