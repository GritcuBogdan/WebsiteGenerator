import { existsSync } from "node:fs";
import path from "node:path";
import { deepMergeOverride } from "overrides";
import { siteConfigSchema, type SiteConfig, type SiteConfigInput, type SiteProfile } from "schema";
import { loadProfile } from "./load-profile.js";

export type ResolveSiteConfigResult = { ok: true; config: SiteConfig } | { ok: false; issue: string };

const BASE_PROFILE_ID = "_base";

// Strips fields that have no place in a SiteConfig-shaped merge layer:
// `id` is just the file's own identifier, and `defaultSkeleton`/`images`
// are content-composition defaults (consumed via data.json's own
// `profile` reference — packages/content-library — not this one).
//
// Returns `unknown`, not `Partial<SiteConfig>`: a profile's `theme` is
// itself only a *partial* Theme (site-profile.ts deep-partials it — a
// profile might set only `accent` and leave primary/secondary for
// `_base.json` or the site itself to supply), so nothing this function
// returns is guaranteed to satisfy SiteConfig's field types on its own.
// deepMergeOverride only needs `unknown` for an override layer anyway;
// the terminal siteConfigSchema.safeParse() below is what actually
// guarantees the fully-merged result is type-correct.
function asConfigLayer(profile: SiteProfile): unknown {
  const { id: _id, defaultSkeleton: _defaultSkeleton, images: _images, ...configFields } = profile;
  return configFields;
}

// Resolves one site's final SiteConfig from three layers, low to high
// precedence (architecture doc §35): profiles/_base.json (optional,
// silently skipped when it doesn't exist — most repos won't have one) ->
// the profile config.json's own `profile` field names, if any -> the
// site's own config.json fields, which always win. Built entirely on
// packages/overrides' existing deepMergeOverride — the same "objects
// merge key by key, arrays replace wholesale" rule already governing
// docx overrides.<locale>.json, just applied to a different pair of
// layers.
//
// The merged result is re-validated against the strict siteConfigSchema
// before being returned — a site (or its profile chain) that still
// leaves a required field unset fails loudly here, naming exactly what's
// missing, rather than crashing deep inside assembleSite later.
export function resolveSiteConfig(rawConfig: SiteConfigInput, profilesDir: string): ResolveSiteConfigResult {
  let merged: unknown = {};

  if (existsSync(path.join(profilesDir, `${BASE_PROFILE_ID}.json`))) {
    const base = loadProfile(profilesDir, BASE_PROFILE_ID);
    if (!base.ok) return { ok: false, issue: base.issue };
    merged = deepMergeOverride(merged, asConfigLayer(base.profile));
  }

  if (rawConfig.profile) {
    const profile = loadProfile(profilesDir, rawConfig.profile);
    if (!profile.ok) return { ok: false, issue: profile.issue };
    merged = deepMergeOverride(merged, asConfigLayer(profile.profile));
  }

  merged = deepMergeOverride(merged, rawConfig);

  const result = siteConfigSchema.safeParse(merged);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    return {
      ok: false,
      issue: `Site "${rawConfig.slug}" is missing required config after resolving defaults/profile: ${missing}. Set these in config.json directly, or reference a profile (profiles/<id>.json) that supplies them.`,
    };
  }

  return { ok: true, config: result.data };
}
