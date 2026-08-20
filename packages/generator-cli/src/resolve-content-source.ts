import { existsSync } from "node:fs";
import path from "node:path";
import type { SiteConfig } from "schema";

export type ContentSourceResolution =
  | { ok: true; contentSource: "docx" | "library" }
  | { ok: false; issue: string };

// Resolves which input produces a site's page content — see
// packages/schema/src/site-config.ts's `contentSource` field comment for
// the full rationale. Never silently guesses in a genuinely ambiguous
// case: a stray data.json left next to a real docx (or a leftover docx
// after a site migrates to the library) must fail loudly, not flip what
// gets built.
//
// Two symmetric, unambiguous cases infer safely:
//   - a docx exists for at least one locale, and data.json doesn't exist
//     -> "docx" (every site in the repo before this feature existed)
//   - data.json exists, and no locale has a docx on disk
//     -> "library" (a brand new library site that forgot to set the
//        field explicitly — safe to infer because there's no existing
//        docx behavior it could silently override)
// Anything else (both present, or neither) fails, naming the fix.
export function resolveContentSource(config: SiteConfig, siteDir: string): ContentSourceResolution {
  if (config.contentSource) {
    return { ok: true, contentSource: config.contentSource };
  }

  const hasDataJson = existsSync(path.join(siteDir, "data.json"));
  const hasAnyDocx = config.locales.some((locale) => locale.docx && existsSync(path.join(siteDir, locale.docx)));

  if (hasAnyDocx && !hasDataJson) {
    return { ok: true, contentSource: "docx" };
  }
  if (hasDataJson && !hasAnyDocx) {
    return { ok: true, contentSource: "library" };
  }

  const detail = hasAnyDocx && hasDataJson ? "both a docx file and data.json exist" : "neither a docx file nor data.json exists";
  return {
    ok: false,
    issue: `Cannot determine contentSource for "${config.slug}": ${detail}. Set "contentSource": "docx" or "library" explicitly in config.json.`,
  };
}
