import { z } from "zod";
import { siteDataSchema } from "./site-data.js";
import { themeSchema } from "./casino.js";

// data/casinos.json — one row per site for the bulk import-sites path (the
// architecture doc's §05 "master dataset"). Deliberately flat: import-sites
// (a later phase) splits each row into a real config.json (identity/
// branding) and data.json (facts) when it scaffolds/updates a site, so this
// only needs to carry what a human or spreadsheet export fills in per row,
// not the full shape of either target file.
//
// `domain` and `locale` are singular here (one primary domain, one primary
// locale per row) even though SiteConfig supports arrays of both —
// multi-domain or multi-locale sites are the exception, not the bulk case,
// and stay on the single-site new-site/hand-edited-config.json path rather
// than complicating every dataset row for a case most rows don't need.
// import-sites wraps them into `domains: [domain]` and a single-entry
// `locales` array with `default: true`.
export const casinoDatasetRowSchema = z
  .object({
    slug: z.string().min(1),
    domain: z.string().min(1),
    affiliateUrl: z.string().url(),
    locale: z.string().min(1),
    // Which profiles/<id>.json this row's scaffolded site should
    // reference (both config.json's and data.json's `profile` fields —
    // see site-profile.ts). Optional only because a profile-less site is
    // still valid, not because import-sites will guess one.
    profile: z.string().optional(),
    // Almost always left unset: a dataset row has no docx to point at, so
    // import-sites resolves this to "library" whenever the row doesn't
    // say otherwise, and always writes it explicitly into the scaffolded
    // config.json (see site-config.ts's `contentSource` comment — never
    // left to file-presence inference for anything the tooling scaffolds).
    contentSource: z.enum(["docx", "library"]).optional(),
    // Per-site color overrides, deep-merged over the profile's own theme in
    // config.json (resolveSiteConfig - site-level fields always win). Only
    // primary/secondary/accent are meaningful today (every other themeSchema
    // field already has a working template-level default nothing here sets).
    theme: themeSchema.partial().optional(),
  })
  .merge(siteDataSchema.omit({ profile: true }));
export type CasinoDatasetRow = z.infer<typeof casinoDatasetRowSchema>;

export const casinoDatasetSchema = z.array(casinoDatasetRowSchema);
export type CasinoDataset = z.infer<typeof casinoDatasetSchema>;
