import { z } from "zod";
import { themeSchema } from "./casino.js";
import {
  siteNavbarConfigSchema,
  siteFooterConfigSchema,
  siteBannerConfigSchema,
  siteStickyBannerConfigSchema,
} from "./site-config.js";
import { siteDataImagesSchema } from "./site-data.js";

// profiles/<id>.json — a reusable bundle of branding/content defaults a
// site inherits by setting config.json's `profile` field (site-config.ts)
// to this file's `id`. Every field mirrors a SiteConfig field but stays
// optional here: a profile only ever supplies defaults, never a site's
// identity (slug/domains/affiliateUrl/locales always come from the site's
// own config.json, never a profile).
//
// Precedence (packages/overrides' deepMergeOverride, reused as-is — see
// the architecture doc's §4.7): global defaults -> this profile -> site
// config.json -> site config.json's own locale overrides. That resolver
// is a later phase; this file only defines the shape being merged.
export const siteProfileSchema = z.object({
  id: z.string().min(1),
  template: z.string().min(1).optional(),
  theme: themeSchema.partial().optional(),
  navbar: siteNavbarConfigSchema.optional(),
  footer: siteFooterConfigSchema.optional(),
  banner: siteBannerConfigSchema.partial().optional(),
  stickyBanner: siteStickyBannerConfigSchema.partial().optional(),
  favicon: z.string().optional(),
  ogImage: z.string().optional(),
  ageGateEnabled: z.boolean().optional(),
  // Content-composition defaults (packages/content-library, a later
  // phase) — not part of SiteConfig at all, only meaningful to the
  // content composer. A site's own data.json `skeleton`/`images` win over
  // these when set.
  defaultSkeleton: z.string().optional(),
  images: siteDataImagesSchema.optional(),
});
export type SiteProfile = z.infer<typeof siteProfileSchema>;
