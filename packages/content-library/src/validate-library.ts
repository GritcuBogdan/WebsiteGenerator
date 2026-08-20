import { siteDataSchema, type PageType, type Skeleton } from "schema";
import type { ContentEntry } from "./discover.js";
import { loadContentLibrary } from "./load-library.js";
import { validatePlaceholderTokens } from "./placeholders.js";
import { blockTexts } from "./parse-blocks.js";

export type ContentLibraryValidationResult = {
  issues: string[];
  entryCount: number;
  skeletonCount: number;
  pageTypeCount: number;
};

// The real field names composeContent's resolveEntry actually checks a
// `requires` entry against (site-data.ts's own schema) — a `requires`
// value that isn't one of these can never become eligible for any site,
// no matter what data.json supplies, and today that just makes the entry
// permanently (and silently) unusable rather than failing anywhere.
const KNOWN_SITE_DATA_FIELDS = new Set(Object.keys(siteDataSchema.shape));

function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

// Unknown placeholders and bad `requires` references are exactly the
// authoring mistakes composeContent's fail-closed resolution (§17: never
// leak an unresolved {{TOKEN}}, never fabricate a missing fact) would
// otherwise only ever surface as "this variant silently never gets
// picked" for whichever sites happen to lack the data — never as an
// error, for any site. Content-library validation exists to catch these
// independently of any specific site's data.
function validatePlaceholdersAndRequires(entries: ContentEntry[]): string[] {
  const issues: string[] = [];
  for (const entry of entries) {
    // entry.blocks covers table/list content too (blockTexts), not just
    // plain paragraphs — a placeholder typo'd inside a table cell or list
    // item needs to be just as loud as one in ordinary prose.
    const blockText = entry.blocks.flatMap(blockTexts);
    const texts = entry.question !== undefined ? [...blockText, entry.question] : blockText;
    for (const text of texts) {
      for (const token of validatePlaceholderTokens(text).unknown) {
        issues.push(`${entry.sourcePath}: unknown placeholder {{${token}}}`);
      }
    }
    for (const field of entry.requires) {
      if (!KNOWN_SITE_DATA_FIELDS.has(field)) {
        issues.push(`${entry.sourcePath}: requires unknown field "${field}" (not a real data.json field)`);
      }
    }
  }
  return issues;
}

// Two FAQ entries with the same question (after trimming/case/whitespace
// normalization) in the same locale is very likely a copy-paste leftover,
// not two genuinely different, deliberately-varied questions — and
// pickMany's no-repeats guarantee only prevents the *same entry* from
// being picked twice, not two different entries that ask the same thing.
function validateDuplicateFaqQuestions(entries: ContentEntry[]): string[] {
  const issues: string[] = [];
  const seenByLocale = new Map<string, Map<string, string>>();

  for (const entry of entries) {
    if (entry.component !== "faq" || entry.question === undefined) continue;
    const key = normalizeQuestion(entry.question);
    let seen = seenByLocale.get(entry.locale);
    if (!seen) {
      seen = new Map();
      seenByLocale.set(entry.locale, seen);
    }
    const existing = seen.get(key);
    if (existing) {
      issues.push(`duplicate FAQ question in ${entry.locale}: "${entry.question}" (${existing} and ${entry.sourcePath})`);
    } else {
      seen.set(key, entry.sourcePath);
    }
  }
  return issues;
}

function validateSemanticCompatibility(entries: ContentEntry[], pageTypes: PageType[]): string[] {
  const knownTargets = new Set<string>(["legal"]);
  for (const pageType of pageTypes) {
    knownTargets.add(pageType.id);
    knownTargets.add(pageType.topic ?? pageType.id);
    for (const alias of pageType.aliases ?? []) knownTargets.add(alias);
  }

  const issues: string[] = [];
  for (const entry of entries) {
    // Legacy entries receive compatibility targets from the in-code
    // migration map. Those targets are intentionally allowed to mention
    // page types not present in a small fixture/older page-types.json. Only
    // validate compatibility declared by a new page-first entry.
    if (entry.legacy) continue;
    for (const target of entry.compatiblePageTypes ?? []) {
      if (!knownTargets.has(target)) {
        issues.push(`${entry.sourcePath}: compatible page type "${target}" is not defined in page-types.json`);
      }
    }
  }
  return issues;
}

// Statically re-checks every page-type/skeleton pairing resolveSkeleton
// (packages/content-library's own resolve-skeleton.ts) would otherwise
// only ever check the first time some site's generation happens to
// resolve that particular page type — so an authoring mistake here
// surfaces the moment the library changes, not whenever a site first
// exercises the broken combination.
function validateSkeletonPageTypeConsistency(skeletons: Skeleton[], pageTypes: PageType[]): string[] {
  const issues: string[] = [];
  const skeletonById = new Map(skeletons.map((skeleton) => [skeleton.id, skeleton]));

  for (const pageType of pageTypes) {
    const skeleton = skeletonById.get(pageType.defaultSkeleton);
    if (!skeleton) {
      issues.push(`page type "${pageType.id}": defaultSkeleton "${pageType.defaultSkeleton}" doesn't exist`);
      continue;
    }
    const disallowed = skeleton.sections.filter((section) => !pageType.allowedComponents.includes(section));
    if (disallowed.length > 0) {
      issues.push(
        `page type "${pageType.id}": skeleton "${skeleton.id}" includes section(s) [${disallowed.join(", ")}] not in its allowedComponents`,
      );
    }
    const missingRequired = (pageType.requiredSections ?? []).filter((section) => !skeleton.sections.includes(section));
    if (missingRequired.length > 0) {
      issues.push(
        `page type "${pageType.id}": skeleton "${skeleton.id}" is missing required section(s) [${missingRequired.join(", ")}]`,
      );
    }
  }
  return issues;
}

// A skeleton component with zero matching entries in any locale can
// never be composed for any site, ever — a dead reference, most likely a
// typo in either the skeleton file or every content file meant to back
// it.
function validateSkeletonComponentsHaveContent(skeletons: Skeleton[], entries: ContentEntry[]): string[] {
  const componentsWithContent = new Set(entries.flatMap((entry) => [entry.component, ...(entry.section ? [entry.section] : [])]));
  const referencedBySkeletons = new Map<string, string[]>();

  for (const skeleton of skeletons) {
    for (const section of skeleton.sections) {
      if (skeleton.optionalSections?.includes(section)) continue;
      const skeletonIds = referencedBySkeletons.get(section) ?? [];
      skeletonIds.push(skeleton.id);
      referencedBySkeletons.set(section, skeletonIds);
    }
  }

  const issues: string[] = [];
  for (const [component, skeletonIds] of referencedBySkeletons) {
    if (!componentsWithContent.has(component)) {
      issues.push(
        `component "${component}" is referenced by skeleton(s) [${skeletonIds.join(", ")}] but has no content-library entries in any locale`,
      );
    }
  }
  return issues;
}

// Validates the content library independently of any specific site
// (architecture doc §45) — the standalone `content:validate` command's
// implementation. Combines the structural issues loadContentLibrary
// already surfaces (malformed frontmatter, duplicate ids, empty files,
// bad skeleton/page-type JSON) with the content-quality checks above.
export async function validateContentLibrary(rootDir: string): Promise<ContentLibraryValidationResult> {
  const library = await loadContentLibrary(rootDir);

  const issues = [
    ...library.issues,
    ...validatePlaceholdersAndRequires(library.entries),
    ...validateDuplicateFaqQuestions(library.entries),
    ...validateSemanticCompatibility(library.entries, library.pageTypes),
    ...validateSkeletonPageTypeConsistency(library.skeletons, library.pageTypes),
    ...validateSkeletonComponentsHaveContent(library.skeletons, library.entries),
  ];

  return {
    issues,
    entryCount: library.entries.length,
    skeletonCount: library.skeletons.length,
    pageTypeCount: library.pageTypes.length,
  };
}
