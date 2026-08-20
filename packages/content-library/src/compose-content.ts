import {
  parsedDocxContentSchema,
  type ParsedDocxContent,
  type ParsedPage,
  type ParsedSection,
  type PageType,
  type Skeleton,
  type SiteData,
} from "schema";
import type { ContentEntry } from "./discover.js";
import { resolvePlaceholders } from "./placeholders.js";
import { createSeed, createSeededRng, pickMany, pickOne } from "./seeded-rng.js";
import { resolveSkeleton } from "./resolve-skeleton.js";
import { sha256Hash } from "./similarity.js";
import type { EntryBlock } from "./parse-blocks.js";
import { entryMatchesSection, isEntryCompatible, isExactTopicMatch } from "./semantic.js";
import { localizedLabel } from "./labels.js";

// Pages composeContent attempts when data.json doesn't declare its own
// `pages` list — the "marketing" pages casino-v1-rules.ts (packages/
// codegen) already recognizes and specially handles (login/application
// form injection, the bonus dropdown, the slots grid). Every one of these
// gets a "text" section from the component the skeleton names for its
// first slot; casino-v1-rules.ts's ensureIntro() already promotes
// whichever section lands first on a page into a real intro+banner
// (exactly what it does for a docx-sourced page whose first section isn't
// already typed "intro") — so the composer never needs to build a
// ParsedIntroSection itself, "text" is enough for every ordinary
// component, uniformly.
// no-deposit-bonus/free-spins/promo-code are attempted by default the same
// as every other marketing page, not opportunistically like the legal
// slugs below — casino-v1-rules.ts's bonus dropdown already filters to
// whichever of these three actually got a page (`pageBySlug.has(slug)`),
// so a site with none of the corresponding facts (noDepositBonus/
// freeSpins/promoCode) simply skips them via the ordinary "no eligible
// content" path, the same graceful-degradation every other page already
// has — nothing special-cases them further here.
const DEFAULT_PAGE_SLUGS = [
  "index",
  "review",
  "bonus",
  "withdrawal",
  "slots",
  "login",
  "application",
  "registration",
  "no-deposit-bonus",
  "free-spins",
  "promo-code",
];

// Legal pages are opportunistic, never part of the forced default set:
// only added when the library actually has a reviewed `legal` entry for
// this locale+slug (id === slug, e.g. content-library/en-US/legal/
// privacy-policy.md). Mirrors assembleSite's existing "only link a legal
// page that actually exists" behavior rather than forcing one.
const LEGAL_PAGE_SLUGS = [
  "privacy-policy",
  "cookies-policy",
  "terms-conditions",
  "betting-rules",
  "responsible-gaming",
  "contacts",
];

const FAQ_ITEM_COUNT = 6;

export type ComposeContentInput = {
  slug: string;
  locale: string;
  siteData: SiteData;
  // Resolved by the caller (a later, pipeline-integration phase) from
  // siteData.contentVersion ?? "v1" — kept as a required, explicit input
  // here rather than defaulted internally, so this function stays pure
  // and its determinism is trivially testable without depending on that
  // default living in two places.
  contentVersion: string;
  // The full discovered library across every locale (discoverContentLibrary's
  // output) — filtered internally to `locale`. Accepting the full library
  // lets a caller load it once per batch and reuse it across every
  // site/locale (architecture doc §52/§53), rather than pre-filtering per call.
  library: ContentEntry[];
  skeletons: Skeleton[];
  pageTypes: PageType[];
};

export type PageSelectionReport = {
  slug: string;
  skeleton: string;
  // componentId -> chosen entry id(s); more than one only ever for "faq".
  components: Record<string, string[]>;
  wordCount: number;
  // A normalized-text fingerprint of the page's full composed content
  // (similarity.ts's sha256Hash) — stored generation metadata (§25), not
  // itself a similarity verdict: composing one site has no visibility
  // into any other site's content to compare against. A future bulk
  // runner comparing many sites' content-report.json files can use this
  // to catch cross-site duplication without re-reading every page's raw
  // text.
  contentHash: string;
};

export type ComposeContentResult = {
  // undefined only when composition produced zero usable pages — never a
  // partially-invalid ParsedDocxContent.
  content: ParsedDocxContent | undefined;
  issues: string[];
  report: PageSelectionReport[];
};

function humanizeSlug(slug: string): string {
  if (slug === "index") return "Home";
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function isFactPresent(data: SiteData, field: string): boolean {
  const value = (data as Record<string, unknown>)[field];
  if (value === undefined) return false;
  return Array.isArray(value) ? value.length > 0 : true;
}

type ResolvedEntry = { entry: ContentEntry; paragraphs: string[]; blocks: EntryBlock[]; question?: string };

// Editorial copy uses commas or sentence breaks for parenthetical transitions.
// Normalize legacy variants at composition time as well, so older library
// entries cannot reintroduce the conspicuous em dash style into a generated
// page while the source library is being expanded and reviewed.
function normalizeEditorialPunctuation(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/,\s*,/g, ",");
}

// Resolves every placeholder inside one block, preserving its shape.
// Table columns/cells and list titles/items are all fair game for a
// {{TOKEN}} the same as ordinary prose is — a table row might legitimately
// read ["{{PAYMENT_METHODS}}", "Instant"] — so every string in the block is
// run through the exact same resolvePlaceholders() ordinary paragraphs use,
// failing the whole block (and therefore the whole entry, below) the same
// way an unresolved token in prose already does.
function resolveBlock(block: EntryBlock, data: SiteData, locale: string): EntryBlock | undefined {
  const resolveAll = (texts: string[]): string[] | undefined => {
    const resolved: string[] = [];
    for (const text of texts) {
      const result = resolvePlaceholders(text, data, locale);
      if (!result.ok) return undefined;
      resolved.push(normalizeEditorialPunctuation(result.text));
    }
    return resolved;
  };

  if (block.type === "paragraphs") {
    const paragraphs = resolveAll(block.paragraphs);
    return paragraphs ? { type: "paragraphs", paragraphs } : undefined;
  }

  if (block.type === "table") {
    const columns = resolveAll(block.columns);
    if (!columns) return undefined;
    const rows: string[][] = [];
    for (const row of block.rows) {
      const resolvedRow = resolveAll(row);
      if (!resolvedRow) return undefined;
      rows.push(resolvedRow);
    }
    return { type: "table", columns, rows };
  }

  if (block.type === "heading") {
    const result = resolvePlaceholders(block.text, data, locale);
    if (!result.ok) return undefined;
    return { type: "heading", level: block.level, text: normalizeEditorialPunctuation(result.text) };
  }

  let title: string | undefined;
  if (block.title !== undefined) {
    const result = resolvePlaceholders(block.title, data, locale);
    if (!result.ok) return undefined;
    title = normalizeEditorialPunctuation(result.text);
  }
  const items = resolveAll(block.items);
  return items ? { type: "list", title, items } : undefined;
}

// An entry is eligible for a site only when every fact its frontmatter
// declares in `requires` is actually present AND every {{TOKEN}} its body
// actually uses resolves — the second check is the independent safety net
// placeholders.ts's own comment describes: a `requires` list an author
// forgot to keep accurate never lets an unresolved placeholder leak into
// generated output. (A `requires` field name that doesn't match any real
// SiteData field just makes that entry permanently ineligible rather than
// erroring here — catching that kind of authoring typo belongs to a
// content-library validation pass, not this runtime path.)
function resolveEntry(entry: ContentEntry, data: SiteData, locale: string): ResolvedEntry | undefined {
  if (!entry.requires.every((field) => isFactPresent(data, field))) return undefined;

  const blocks: EntryBlock[] = [];
  for (const block of entry.blocks) {
    const resolved = resolveBlock(block, data, locale);
    if (!resolved) return undefined;
    blocks.push(resolved);
  }
  const paragraphs = blocks.filter((block) => block.type === "paragraphs").flatMap((block) => block.paragraphs);

  let question = entry.question;
  if (question !== undefined) {
    const result = resolvePlaceholders(question, data, locale);
    if (!result.ok) return undefined;
    question = normalizeEditorialPunctuation(result.text);
  }

  return { entry, paragraphs, blocks, question };
}

function eligibleEntries(
  library: ContentEntry[],
  locale: string,
  section: string,
  data: SiteData,
  pageType: PageType,
): ResolvedEntry[] {
  const candidates = library
    .filter((entry) => entry.locale === locale && entryMatchesSection(entry, section))
    .filter(
      (entry) =>
        isEntryCompatible(entry, pageType) ||
        // Programmatically-created entries from the pre-semantic API do not
        // have metadata. Keep those fixtures and integrations working, but
        // require their old component allowlist to opt them into the page.
        (!entry.topic && !entry.compatiblePageTypes && pageType.allowedComponents.includes(entry.component)),
    );

  // During migration, shared legacy entries are a fallback only. If a page
  // has topic-specific content for this section, never let a generic intro,
  // FAQ, or CTA variant win merely because it is in the larger legacy pool.
  const exact = candidates.filter((entry) => isExactTopicMatch(entry, pageType));
  return (exact.length > 0 ? exact : candidates)
    .map((entry) => resolveEntry(entry, data, locale))
    .filter((resolved): resolved is ResolvedEntry => resolved !== undefined);
}

function sectionTitle(locale: string, id: string): string {
  return localizedLabel(locale, id) ?? humanizeSlug(id);
}

function buildTextSection(locale: string, id: string, resolved: ResolvedEntry): ParsedSection {
  return { type: "text", id, title: sectionTitle(locale, id), paragraphs: resolved.paragraphs };
}

// A "content" section — the same shape a docx-authored page already
// produces for a table/list, via casinoParser.py — built whenever the
// chosen entry has more than plain prose. An entry with no table/list
// syntax always has exactly one "paragraphs" block, so this never fires
// for any of the library's plain-prose entries; buildTextSection above
// keeps producing exactly the same "text" section it always has for them.
function buildContentSection(locale: string, id: string, resolved: ResolvedEntry): ParsedSection {
  return {
    type: "content",
    id,
    title: sectionTitle(locale, id),
    blocks: resolved.blocks.map((block) =>
      block.type === "paragraphs" ? { type: "text", paragraphs: block.paragraphs } : block,
    ),
  };
}

function buildSection(locale: string, id: string, resolved: ResolvedEntry): ParsedSection {
  const hasStructure = resolved.blocks.some((block) => block.type !== "paragraphs");
  return hasStructure ? buildContentSection(locale, id, resolved) : buildTextSection(locale, id, resolved);
}

function buildCombinedSection(locale: string, id: string, resolved: ResolvedEntry[]): ParsedSection {
  const hasStructure = resolved.some((item) => item.blocks.some((block) => block.type !== "paragraphs"));
  if (!hasStructure) {
    return buildTextSection(locale, id, { ...resolved[0], paragraphs: resolved.flatMap((item) => item.paragraphs) });
  }

  return {
    type: "content",
    id,
    title: sectionTitle(locale, id),
    blocks: resolved.flatMap((item) =>
      item.blocks.map((block) =>
        block.type === "paragraphs" ? { type: "text" as const, paragraphs: block.paragraphs } : block,
      ),
    ),
  };
}

function buildFaqSection(locale: string, id: string, items: ResolvedEntry[]): ParsedSection {
  return {
    type: "faq",
    id,
    title: sectionTitle(locale, id),
    items: items.map((item) => ({ question: item.question!, answer: item.paragraphs.join(" ") })),
  };
}

// Same idea as parse-blocks.ts's blockTexts, but over ParsedSection's own
// schema-shaped content blocks ("text"/"table"/"list", per
// parsedContentSectionSchema) rather than this package's internal
// EntryBlock ("paragraphs"/"table"/"list") — the two are structurally
// close but use a different discriminator for plain prose, so they aren't
// interchangeable.
function contentBlockTexts(
  block:
    | { type: "text"; paragraphs: string[] }
    | { type: "table"; columns: string[]; rows: string[][] }
    | { type: "list"; title?: string; items: string[] }
    | { type: "heading"; level: 3 | 4; text: string },
): string[] {
  if (block.type === "text") return block.paragraphs;
  if (block.type === "table") return [...block.columns, ...block.rows.flat()];
  if (block.type === "heading") return [block.text];
  return block.title !== undefined ? [block.title, ...block.items] : [...block.items];
}

function pageText(sections: ParsedSection[]): string {
  return sections
    .flatMap((section) => {
      if (section.type === "text") return section.paragraphs;
      if (section.type === "faq") return section.items.flatMap((item) => [item.question, item.answer]);
      if (section.type === "content") return section.blocks.flatMap((block) => contentBlockTexts(block));
      return [];
    })
    .join(" ");
}

function pageTextStats(sections: ParsedSection[]): { wordCount: number; contentHash: string } {
  const text = pageText(sections);
  return { wordCount: text.split(/\s+/).filter(Boolean).length, contentHash: sha256Hash(text) };
}

function composeOrdinaryPage(
  slug: string,
  input: ComposeContentInput,
  rng: () => number,
  issues: string[],
): { page: ParsedPage; selection: PageSelectionReport } | undefined {
  const resolution = resolveSkeleton(slug, input.pageTypes, input.skeletons, input.siteData);
  if (!resolution.ok) {
    issues.push(resolution.issue);
    return undefined;
  }
  const { skeleton, pageType } = resolution;

  const sections: ParsedSection[] = [];
  const components: Record<string, string[]> = {};
  const selectedBySection = new Map<string, ResolvedEntry[]>();
  const eligibleBySection = new Map<string, ResolvedEntry[]>();

  for (const sectionId of skeleton.sections) {
    const candidates = input.library.filter(
      (entry) => entry.locale === input.locale && entryMatchesSection(entry, sectionId),
    );
    const eligible = eligibleEntries(input.library, input.locale, sectionId, input.siteData, pageType);

    if (eligible.length === 0) {
      issues.push(
        `page "${slug}": no eligible "${sectionId}" content (${candidates.length} candidate(s) found, none usable with the page type or available data)`,
      );
      continue;
    }

    if (sectionId === "faq") {
      const picked = pickMany(rng, eligible, FAQ_ITEM_COUNT);
      sections.push(buildFaqSection(input.locale, sectionId, picked));
      components[sectionId] = picked.map((item) => item.entry.id);
      selectedBySection.set(sectionId, picked);
    } else {
      const picked = pickOne(rng, eligible);
      selectedBySection.set(sectionId, [picked]);
      eligibleBySection.set(sectionId, eligible);
      sections.push(buildSection(input.locale, sectionId, picked));
      components[sectionId] = [picked.entry.id];
    }
  }

  const targetWordCount = pageType.targetWordCount;
  if (targetWordCount !== undefined) {
    let cursor = 0;
    let currentWordCount = pageTextStats(sections).wordCount;
    const expandableSections = skeleton.sections.filter((sectionId) => sectionId !== "faq" && eligibleBySection.has(sectionId));

    while (currentWordCount < targetWordCount && expandableSections.length > 0) {
      const sectionId = expandableSections[cursor % expandableSections.length];
      cursor += 1;
      const selected = selectedBySection.get(sectionId)!;
      const used = new Set(selected.map((item) => item.entry.id));
      const next = eligibleBySection.get(sectionId)!.filter((item) => !used.has(item.entry.id));
      if (next.length === 0) {
        if (cursor >= expandableSections.length * 2) break;
        continue;
      }

      selected.push(pickOne(rng, next));
      const rebuilt = skeleton.sections.map((id) => {
        const items = selectedBySection.get(id);
        if (!items) return undefined;
        return id === "faq" ? buildFaqSection(input.locale, id, items) : buildCombinedSection(input.locale, id, items);
      }).filter((section): section is ParsedSection => section !== undefined);
      currentWordCount = pageTextStats(rebuilt).wordCount;
      sections.splice(0, sections.length, ...rebuilt);
      components[sectionId] = selected.map((item) => item.entry.id);
    }
  }

  for (const requiredSection of pageType.requiredSections ?? []) {
    if (!sections.some((section) => section.id === requiredSection)) {
      issues.push(`page "${slug}": required section "${requiredSection}" had no eligible content`);
    }
  }

  if (sections.length === 0) {
    issues.push(`page "${slug}": skipped — no skeleton section had any eligible content`);
    return undefined;
  }

  const page: ParsedPage = { slug, title: sectionTitle(input.locale, slug), meta: {}, sections };
  return { page, selection: { slug, skeleton: skeleton.id, components, ...pageTextStats(sections) } };
}

// Legal pages bypass skeleton/page-type resolution entirely: there's no
// meaningful "structure" for a single piece of reviewed boilerplate, and
// its content lives under the "legal" component with id === the page
// slug it's for (one-to-one, not seeded-selected from many variants —
// architecture doc §4.6's "legal text isn't a place to want diversity").
function composeLegalPage(
  slug: string,
  input: ComposeContentInput,
  rng: () => number,
  issues: string[],
): { page: ParsedPage; selection: PageSelectionReport } | undefined {
  const candidates = input.library.filter(
    (entry) => entry.locale === input.locale && entry.component === "legal" && entry.id === slug,
  );
  const eligible = candidates
    .map((entry) => resolveEntry(entry, input.siteData, input.locale))
    .filter((resolved): resolved is ResolvedEntry => resolved !== undefined);

  if (eligible.length === 0) {
    issues.push(`page "${slug}": no eligible legal content found for this locale`);
    return undefined;
  }

  const picked = pickOne(rng, eligible);
  const sections = [buildSection(input.locale, "legal", picked)];
  const resolveOptional = (value: string | undefined): string | undefined => {
    if (value === undefined) return undefined;
    const result = resolvePlaceholders(value, input.siteData, input.locale);
    return result.ok ? normalizeEditorialPunctuation(result.text) : undefined;
  };
  const page: ParsedPage = {
    slug,
    title: resolveOptional(picked.entry.title) ?? sectionTitle(input.locale, slug),
    meta: {
      title: resolveOptional(picked.entry.metaTitle),
      description: resolveOptional(picked.entry.metaDescription),
    },
    sections,
  };
  return { page, selection: { slug, skeleton: "_legal", components: { legal: [picked.entry.id] }, ...pageTextStats(sections) } };
}

// Composes a full ParsedDocxContent for one site+locale from the content
// library instead of a docx (architecture doc §00) — the "Mode B" input
// to the existing, unmodified pipeline (assembleSite onward). This
// function never touches disk itself; a later pipeline-integration phase
// is responsible for loading the library/skeletons/pageTypes once and
// passing them in.
//
// Deterministic: identical inputs (same slug/locale/contentVersion/
// siteData/library) always produce the same output, because every
// random-looking choice is drawn from one seeded RNG (§26) rather than
// Math.random() — never reset mid-call, so the sequence of picks across
// every page/component of one composition is reproducible as a whole, not
// just page by page.
//
// Never fabricates: a component with no eligible content for this site's
// data is skipped (recorded as an issue) rather than filled with invented
// prose; a page left with zero sections is dropped entirely rather than
// produced empty. Failure is isolated per page/component, matching the
// rest of this architecture's "one bad site/section doesn't block the
// others" posture — composition only reports a hard failure (content:
// undefined) when literally nothing could be built.
export function composeContent(input: ComposeContentInput): ComposeContentResult {
  const seed = createSeed([input.slug, input.locale, input.contentVersion]);
  const rng = createSeededRng(seed);
  const issues: string[] = [];
  const report: PageSelectionReport[] = [];

  const requestedSlugs = input.siteData.pages ?? DEFAULT_PAGE_SLUGS;
  const opportunisticLegalSlugs = input.siteData.pages
    ? []
    : LEGAL_PAGE_SLUGS.filter((legalSlug) =>
        input.library.some(
          (entry) => entry.locale === input.locale && entry.component === "legal" && entry.id === legalSlug,
        ),
      );
  const slugsToBuild = [...requestedSlugs, ...opportunisticLegalSlugs];

  const pages: ParsedPage[] = [];
  for (const slug of slugsToBuild) {
    const result = LEGAL_PAGE_SLUGS.includes(slug)
      ? composeLegalPage(slug, input, rng, issues)
      : composeOrdinaryPage(slug, input, rng, issues);
    if (result) {
      pages.push(result.page);
      report.push(result.selection);
    }
  }

  if (pages.length === 0) {
    issues.push("composition produced zero pages — nothing to generate");
    return { content: undefined, issues, report };
  }

  const content = parsedDocxContentSchema.parse({ locale: input.locale, pages });
  return { content, issues, report };
}
