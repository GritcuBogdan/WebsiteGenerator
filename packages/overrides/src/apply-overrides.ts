import { parsedDocxContentSchema, type ParsedDocxContent, type ParsedPage, type ParsedSection } from "schema";
import { deepMergeOverride } from "./deep-merge.js";
import type { OverridesFile } from "./overrides-file.js";

// Thrown instead of silently ignoring an override that targets a page slug
// or section id the parsed content doesn't actually have — almost always a
// typo or a stale override left over from a docx edit, and a silent no-op
// would hide exactly the kind of mistake this package exists to catch.
export class OverrideMismatchError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Overrides reference content that doesn't exist:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "OverrideMismatchError";
    this.issues = issues;
  }
}

export function applyOverrides(content: ParsedDocxContent, overridesFile?: OverridesFile): ParsedDocxContent {
  if (!overridesFile) return content;

  const issues: string[] = [];
  const knownSlugs = new Set(content.pages.map((page) => page.slug));

  for (const slug of Object.keys(overridesFile.pages)) {
    if (!knownSlugs.has(slug)) {
      issues.push(`page "${slug}" has no matching parsed page`);
    }
  }

  const pages = content.pages.map((page): ParsedPage => {
    const pageOverride = overridesFile.pages[page.slug];
    if (!pageOverride) return page;

    const { sections: sectionOverrides, ...pageFields } = pageOverride;
    let merged = deepMergeOverride(page, pageFields) as ParsedPage;

    if (sectionOverrides) {
      const knownSectionIds = new Set(page.sections.map((section) => section.id));
      for (const sectionId of Object.keys(sectionOverrides)) {
        if (!knownSectionIds.has(sectionId)) {
          issues.push(`page "${page.slug}" section "${sectionId}" has no matching parsed section`);
        }
      }

      merged = {
        ...merged,
        sections: merged.sections.map((section): ParsedSection => {
          const sectionOverride = sectionOverrides[section.id];
          return sectionOverride ? (deepMergeOverride(section, sectionOverride) as ParsedSection) : section;
        }),
      };
    }

    return merged;
  });

  if (issues.length > 0) {
    throw new OverrideMismatchError(issues);
  }

  // Re-validate: a merge is only guaranteed to satisfy each override
  // field's own schema, not that the resulting whole is still a valid
  // ParsedDocxContent (e.g. blindly replacing "blocks" on the wrong kind
  // of section would still need to fail somewhere).
  return parsedDocxContentSchema.parse({ ...content, pages });
}
