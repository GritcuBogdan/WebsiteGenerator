import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter, FrontmatterError } from "./frontmatter.js";
import { parseBody, type EntryBlock } from "./parse-blocks.js";
import { legacySemanticMetadata } from "./semantic.js";

// Top-level content-library/ directories that aren't locales — reserved so
// a future skeletons/ or seo/ directory (architecture doc §03's repo-root
// layout) can sit alongside the locale directories without discovery
// mistaking it for one. Anything starting with "_" is reserved the same
// way (a convention, not a special case here).
const RESERVED_TOP_LEVEL_DIRS = new Set(["skeletons", "seo"]);

export type ContentEntry = {
  id: string;
  // Kept for skeleton/report/override compatibility. New content can use
  // the semantic `section` instead of treating this as the topic.
  component: string; // e.g. "bonus", "faq"
  locale: string; // derived from the top-level directory, e.g. "de-DE"
  // Page-first metadata. Optional in the type so callers that construct old
  // ContentEntry fixtures/programmatic entries keep working; discovery
  // always fills these fields.
  topic?: string; // e.g. "slots", "payments", "login"
  section?: string; // e.g. "intro", "providers", "forgot-password"
  compatiblePageTypes?: string[];
  legacy?: boolean;
  requires: string[]; // SiteData field names this entry depends on (placeholders.ts's PlaceholderKey namespace, checked independently at resolve time)
  title?: string;
  metaTitle?: string;
  metaDescription?: string;
  question?: string; // faq entries only — the frontmatter `question:` field
  // Flattened plain-prose paragraphs only (unchanged meaning/behavior from
  // before tables/lists existed) — every "paragraphs"-type block's
  // content, concatenated in order. Still what FAQ answers and simple
  // text-only components use directly.
  paragraphs: string[];
  // The body's full structured breakdown, in original order — prose runs,
  // plus any table/list blocks (parse-blocks.ts). A file with no table/list
  // syntax parses to exactly one "paragraphs" block equal to `paragraphs`
  // above. compose-content.ts builds a "content" section (with real
  // table/list blocks) instead of a plain "text" section whenever this has
  // more than just prose.
  blocks: EntryBlock[];
  sourcePath: string; // relative to the library root, "/"-separated
};

export type ContentLibrary = {
  entries: ContentEntry[];
  issues: string[];
};

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

// Sorted, always — readdir's order isn't guaranteed by any filesystem, and
// a later phase's seeded selection needs a stable candidate order to be
// reproducible run to run (same seed -> same pick only holds if "the
// list of candidates" itself doesn't silently reshuffle).
async function listDirNames(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function asStringArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// Walks both the legacy content-library/<locale>/<component>/*.md layout and
// the page-first content-library/<locale>/<topic>/<section>/*.md layout,
// parses each file's frontmatter+body, and returns every entry found plus a flat list of
// structural issues (malformed frontmatter, an empty file, a duplicate id,
// frontmatter that contradicts the directory it's actually in). Never
// throws for a single bad file — one broken entry shouldn't block
// discovering the other few hundred, the same failure-isolation posture
// as the rest of this architecture (bulk generation, override validation).
export async function discoverContentLibrary(rootDir: string): Promise<ContentLibrary> {
  const entries: ContentEntry[] = [];
  const issues: string[] = [];
  const seenIds = new Map<string, string>(); // "locale/component/id" -> sourcePath of the first entry seen

  let localeDirs: string[];
  try {
    localeDirs = (await listDirNames(rootDir)).filter(
      (name) => !RESERVED_TOP_LEVEL_DIRS.has(name) && !name.startsWith("_"),
    );
  } catch (error) {
    issues.push(`cannot read content library root "${rootDir}": ${(error as Error).message}`);
    return { entries, issues };
  }

  for (const locale of localeDirs) {
    const localeDir = path.join(rootDir, locale);
    let componentDirs: string[];
    try {
      componentDirs = await listDirNames(localeDir);
    } catch (error) {
      issues.push(`cannot read locale directory "${locale}": ${(error as Error).message}`);
      continue;
    }

    for (const component of componentDirs) {
      const componentDir = path.join(localeDir, component);
      const files = await listMarkdownFiles(componentDir);

      for (const filePath of files) {
        const fileName = path.basename(filePath);
        const sourcePath = toPosix(path.relative(rootDir, filePath));
        const relativeSegments = path.relative(localeDir, filePath).split(path.sep);
        const directorySegments = relativeSegments.slice(0, -1);
        const isSemanticLayout = directorySegments.length >= 2;
        const sectionDirectory = directorySegments[directorySegments.length - 1] ?? component;
        const topicDirectory = directorySegments[0] ?? component;

        let raw: string;
        try {
          raw = await readFile(filePath, "utf-8");
        } catch (error) {
          issues.push(`${sourcePath}: cannot read file: ${(error as Error).message}`);
          continue;
        }

        let parsed;
        try {
          parsed = parseFrontmatter(raw);
        } catch (error) {
          if (error instanceof FrontmatterError) {
            issues.push(`${sourcePath}: ${error.message}`);
            continue;
          }
          throw error;
        }

        const { data, body } = parsed;

        const frontmatterComponent = typeof data.component === "string" ? data.component : undefined;
        const expectedComponentDirectory = isSemanticLayout ? sectionDirectory : component;
        if (frontmatterComponent && frontmatterComponent !== expectedComponentDirectory && !isSemanticLayout) {
          issues.push(
            `${sourcePath}: frontmatter component "${frontmatterComponent}" does not match its directory "${component}"`,
          );
          continue;
        }
        const frontmatterLocale = typeof data.locale === "string" ? data.locale : undefined;
        if (frontmatterLocale && frontmatterLocale !== locale) {
          issues.push(`${sourcePath}: frontmatter locale "${frontmatterLocale}" does not match its directory "${locale}"`);
          continue;
        }

        const frontmatterTopic = typeof data.topic === "string" ? data.topic : undefined;
        const frontmatterSection = typeof data.section === "string" ? data.section : undefined;
        if (isSemanticLayout && frontmatterTopic && frontmatterTopic !== topicDirectory) {
          issues.push(`${sourcePath}: frontmatter topic "${frontmatterTopic}" does not match its directory "${topicDirectory}"`);
          continue;
        }
        if (isSemanticLayout && frontmatterSection && frontmatterSection !== sectionDirectory) {
          issues.push(`${sourcePath}: frontmatter section "${frontmatterSection}" does not match its directory "${sectionDirectory}"`);
          continue;
        }

        if (!body) {
          issues.push(`${sourcePath}: file is empty (no body content)`);
          continue;
        }

        const question = typeof data.question === "string" ? data.question : undefined;
        const title = typeof data.title === "string" ? data.title : undefined;
        const metaTitle = typeof data.metaTitle === "string" ? data.metaTitle : undefined;
        const metaDescription = typeof data.metaDescription === "string" ? data.metaDescription : undefined;
        const effectiveComponent = frontmatterComponent ?? (isSemanticLayout ? sectionDirectory : component);
        if (effectiveComponent === "faq" && !question) {
          issues.push(`${sourcePath}: faq entries require a "question" frontmatter field`);
          continue;
        }

        const id = typeof data.id === "string" ? data.id : fileName.slice(0, -3);
        const legacyMetadata = legacySemanticMetadata(effectiveComponent);
        const topic = frontmatterTopic ?? (isSemanticLayout ? topicDirectory : legacyMetadata.topic);
        const section = frontmatterSection ?? (isSemanticLayout ? sectionDirectory : legacyMetadata.section);
        const isSharedScope = isSemanticLayout && topicDirectory === "shared";
        const migratedCompatibility =
          isSharedScope ||
          frontmatterComponent !== undefined ||
          (topicDirectory === "withdrawals" && sectionDirectory === "withdrawals") ||
          (topicDirectory === "support" && sectionDirectory === "support") ||
          (topicDirectory === "login" && ["registration", "account-access"].includes(sectionDirectory));
        const compatiblePageTypes = asStringArray(
          data.compatiblePageTypes ?? data.compatibleWith ?? data.compatibility,
        );
        const dedupeKey = `${locale}/${topic}/${section}/${id}`;
        const existing = seenIds.get(dedupeKey);
        if (existing) {
          issues.push(`duplicate id "${id}" in ${locale}/${component}: ${existing} and ${sourcePath}`);
          continue;
        }
        seenIds.set(dedupeKey, sourcePath);

        const blocks = parseBody(body);
        const paragraphs = blocks.filter((block) => block.type === "paragraphs").flatMap((block) => block.paragraphs);

        entries.push({
          id,
          component: effectiveComponent,
          locale,
          topic,
          section,
          compatiblePageTypes: compatiblePageTypes.length > 0
            ? compatiblePageTypes
            : (migratedCompatibility ? legacyMetadata.compatiblePageTypes : []),
          legacy: !isSemanticLayout && frontmatterTopic === undefined && frontmatterSection === undefined,
          requires: asStringArray(data.requires),
          title,
          metaTitle,
          metaDescription,
          question,
          paragraphs,
          blocks,
          sourcePath,
        });
      }
    }
  }

  return { entries, issues };
}
