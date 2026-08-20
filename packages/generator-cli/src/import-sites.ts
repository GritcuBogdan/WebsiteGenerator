import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { casinoDatasetRowSchema, type CasinoDatasetRow } from "schema";
import { deepMergeOverride } from "overrides";
import { loadProfile } from "./load-profile.js";

export type ImportSitesOptions = {
  // Discards whatever's already at sites/<slug>/{config,data}.json and
  // writes exactly what the dataset row says. Without this, an existing
  // file's own fields always win (see importSites' own doc comment).
  force?: boolean;
  // Computes and reports what would happen, without creating/writing
  // anything (not even the images/ directory). Combine with `force` to
  // preview what a forced re-import would discard.
  dryRun?: boolean;
  // When set, a row's `profile` (if any) is resolved against
  // profiles/<id>.json here and the row fails if it doesn't exist/isn't
  // valid — the same check resolveSiteConfig does at generate time
  // (load-profile.ts), just surfaced at import time so a typo'd profile
  // name doesn't silently scaffold a site that fails later. Omitted
  // entirely (no profilesDir passed), the check is skipped — callers that
  // don't care about profiles (e.g. most unit tests) don't need a fixture
  // dir on disk.
  profilesDir?: string;
};

export type ImportFileOutcome = "created" | "updated" | "unchanged";

export type ImportSitesRowResult = {
  slug: string;
  outcome: ImportFileOutcome | "failed";
  reason?: string;
  // Per-file breakdown, present only on non-failed rows — what dry-run
  // reporting needs to say e.g. "example-casino/data.json" rather than
  // just "example-casino" changed.
  files?: { config: ImportFileOutcome; data: ImportFileOutcome };
};

export type ImportSitesResult = {
  // One entry per dataset row, in dataset order — the source of truth for
  // numbered batch progress output ("[003/100] slug ... UPDATE") and for
  // dry-run's create/update/reject grouping.
  rows: ImportSitesRowResult[];
  created: string[];
  updated: string[];
  unchanged: string[];
  failed: { slug: string; reason: string }[];
};

// Structural equality independent of key order, so re-writing the same
// logical value doesn't register as a change just because deepMergeOverride
// (or a human's editor) reordered keys.
function deepEqualJson(a: unknown, b: unknown): boolean {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0))
          .map(([key, val]) => [key, canonicalize(val)]),
      );
    }
    return value;
  };
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

// data/casinos.json rows carry identity fields (slug/domain/affiliateUrl/
// locale/contentSource) alongside every SiteData fact — config.json only
// ever wants the former.
function toConfigFields(row: CasinoDatasetRow): Record<string, unknown> {
  return {
    slug: row.slug,
    domains: [row.domain],
    affiliateUrl: row.affiliateUrl,
    locales: [{ code: row.locale, default: true }],
    // Always written explicitly (never left for load-config's file-
    // presence inference) — site-config.ts's own contentSource comment is
    // exactly why: nothing this tool scaffolds should depend on guessing.
    contentSource: row.contentSource ?? "library",
    ...(row.profile ? { profile: row.profile } : {}),
    // Deep-merges over the profile's own theme (resolveSiteConfig - site
    // config.json always wins), so a row only needs to set the colors it
    // wants to override.
    ...(row.theme ? { theme: row.theme } : {}),
  };
}

// Everything else on the row — the facts data.json actually wants — plus
// its own `profile` reference (data.json's `profile` is content-
// composition defaults, independent of config.json's `profile` above,
// but a dataset row only has one `profile` concept, so both get it).
function toDataFields(row: CasinoDatasetRow): Record<string, unknown> {
  const {
    slug: _slug,
    domain: _domain,
    affiliateUrl: _affiliateUrl,
    locale: _locale,
    contentSource: _contentSource,
    theme: _theme,
    profile,
    ...facts
  } = row;
  return { ...facts, ...(profile ? { profile } : {}) };
}

function readJsonIfExists(filePath: string): unknown {
  if (!existsSync(filePath)) return undefined;
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function rawStringField(rawRow: unknown, field: string): string | undefined {
  if (typeof rawRow !== "object" || rawRow === null) return undefined;
  const value = (rawRow as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

// Counts how many rows share the same raw (pre-validation) value for
// `field`, so a duplicate can be reported even when the row is otherwise
// malformed. Rows with no string value for `field` are excluded — they'll
// surface their own schema error instead.
function findDuplicates(raw: unknown[], field: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rawRow of raw) {
    const value = rawStringField(rawRow, field);
    if (value !== undefined) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  for (const [value, count] of [...counts.entries()]) {
    if (count <= 1) counts.delete(value);
  }
  return counts;
}

// Sidecar file recording exactly what import-sites itself last wrote into
// config.json/data.json — the provenance record mergeWithProvenance needs
// to tell "a field the importer owns and can safely refresh from the
// dataset" apart from "a field a human has since hand-edited." Prefixed
// with a dot so it reads as tooling state, not site content; nothing else
// in the pipeline (pipeline.ts's load-config, content-library discovery)
// scans sites/<slug>/ for unknown files, so its presence is inert to them.
const MANIFEST_FILENAME = ".import-sites-state.json";

type ImportManifest = { config?: Record<string, unknown>; data?: Record<string, unknown> };

function readManifest(siteDir: string): ImportManifest {
  const value = readJsonIfExists(path.join(siteDir, MANIFEST_FILENAME));
  return value && typeof value === "object" ? (value as ImportManifest) : {};
}

function writeManifest(siteDir: string, manifest: ImportManifest): void {
  writeJson(path.join(siteDir, MANIFEST_FILENAME), manifest);
}

// Three-way merge, one step more precise than a plain deepMergeOverride:
// a field only takes the dataset's new value when the site doesn't have it
// yet, or when the site's current value for it still matches what
// import-sites itself wrote there on a previous run (i.e. nothing has
// touched it since). A field whose on-disk value has drifted from the
// importer's own last-written value — because a human edited it, whether
// that value happens to differ from the current dataset row or not — is
// left exactly as it is on disk, even if the dataset's value for it has
// also changed since. `lastWritten` undefined (no manifest — a site that
// predates this file, or was hand-created) falls back to the coarser
// whole-file rule: every existing field wins, nothing is ever refreshed
// short of --force.
function mergeWithProvenance(
  base: Record<string, unknown>,
  existing: Record<string, unknown>,
  lastWritten: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!lastWritten) return deepMergeOverride(base, existing);

  const result: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(base)) {
    const isNewField = !(key in existing);
    const stillImporterOwned = key in lastWritten && deepEqualJson(existing[key], lastWritten[key]);
    if (isNewField || stillImporterOwned) result[key] = base[key];
  }
  return result;
}

function fileOutcome(existing: unknown, merged: unknown): ImportFileOutcome {
  if (existing === undefined) return "created";
  return deepEqualJson(existing, merged) ? "unchanged" : "updated";
}

function rowOutcomeOf(files: { config: ImportFileOutcome; data: ImportFileOutcome }): ImportFileOutcome {
  if (files.config === "created" || files.data === "created") return "created";
  if (files.config === "unchanged" && files.data === "unchanged") return "unchanged";
  return "updated";
}

function recordOutcome(result: ImportSitesResult, row: ImportSitesRowResult): void {
  result.rows.push(row);
  if (row.outcome === "failed") result.failed.push({ slug: row.slug, reason: row.reason ?? "unknown error" });
  else if (row.outcome === "created") result.created.push(row.slug);
  else if (row.outcome === "updated") result.updated.push(row.slug);
  else result.unchanged.push(row.slug);
}

// Scaffolds/updates one sites/<slug>/{config,data}.json per row of
// data/casinos.json — the primary high-scale on-ramp (architecture doc
// §05's "master dataset"). Idempotent by default, at field-level
// granularity (mergeWithProvenance, above): a field only refreshes from
// the dataset when the site doesn't have it yet, or when its current value
// still matches what import-sites itself wrote there last time; a field a
// human has since changed is left alone even if the dataset's value for it
// changes too. A hand-edited config.json/data.json is never silently
// clobbered by re-running import-sites against an updated dataset;
// `--force` instead discards whatever was there and writes exactly what
// the row says. `--dry-run` computes the same outcomes without writing
// anything (including the .import-sites-state.json manifest this relies
// on).
//
// Every row is processed independently and failures are collected, not
// thrown — one malformed row (or a slug/domain that collides with another
// row in the same dataset, or a profile reference that doesn't resolve)
// doesn't stop the rest of the batch (§55's "one bad site doesn't stop the
// batch," applied at import time rather than generate time).
export function importSites(datasetPath: string, sitesRoot: string, options: ImportSitesOptions = {}): ImportSitesResult {
  const result: ImportSitesResult = { rows: [], created: [], updated: [], unchanged: [], failed: [] };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(datasetPath, "utf-8"));
  } catch (error) {
    throw new Error(`Cannot read dataset "${datasetPath}": ${(error as Error).message}`);
  }
  if (!Array.isArray(raw)) {
    throw new Error(`Dataset "${datasetPath}" must be a JSON array of rows.`);
  }

  const duplicateSlugs = findDuplicates(raw, "slug");
  const duplicateDomains = findDuplicates(raw, "domain");

  for (const rawRow of raw) {
    const slugLabel = rawStringField(rawRow, "slug") ?? "(unknown slug)";

    if (duplicateSlugs.has(slugLabel)) {
      recordOutcome(result, {
        slug: slugLabel,
        outcome: "failed",
        reason: `duplicate slug — appears ${duplicateSlugs.get(slugLabel)} times in ${path.basename(datasetPath)}`,
      });
      continue;
    }

    const domainLabel = rawStringField(rawRow, "domain");
    if (domainLabel !== undefined && duplicateDomains.has(domainLabel)) {
      recordOutcome(result, {
        slug: slugLabel,
        outcome: "failed",
        reason: `duplicate domain — "${domainLabel}" appears ${duplicateDomains.get(domainLabel)} times in ${path.basename(datasetPath)}`,
      });
      continue;
    }

    const parsed = casinoDatasetRowSchema.safeParse(rawRow);
    if (!parsed.success) {
      recordOutcome(result, {
        slug: slugLabel,
        outcome: "failed",
        reason: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; "),
      });
      continue;
    }
    const row = parsed.data;

    if (row.profile && options.profilesDir) {
      const profile = loadProfile(options.profilesDir, row.profile);
      if (!profile.ok) {
        recordOutcome(result, { slug: row.slug, outcome: "failed", reason: `invalid profile: ${profile.issue}` });
        continue;
      }
    }

    try {
      const siteDir = path.join(sitesRoot, row.slug);
      const configPath = path.join(siteDir, "config.json");
      const dataPath = path.join(siteDir, "data.json");

      const configBase = toConfigFields(row);
      const dataBase = toDataFields(row);

      // Read once, always — outcome classification (created/updated/
      // unchanged) reflects what's actually on disk regardless of --force.
      const realExistingConfig = readJsonIfExists(configPath) as Record<string, unknown> | undefined;
      const realExistingData = readJsonIfExists(dataPath) as Record<string, unknown> | undefined;
      const lastWritten = options.force ? {} : readManifest(siteDir);

      let mergedConfig: Record<string, unknown>;
      let mergedData: Record<string, unknown>;
      if (options.force || realExistingConfig === undefined) {
        mergedConfig = configBase;
      } else {
        mergedConfig = mergeWithProvenance(configBase, realExistingConfig, lastWritten.config);
      }
      if (options.force || realExistingData === undefined) {
        mergedData = dataBase;
      } else {
        mergedData = mergeWithProvenance(dataBase, realExistingData, lastWritten.data);
      }

      const files = { config: fileOutcome(realExistingConfig, mergedConfig), data: fileOutcome(realExistingData, mergedData) };

      if (!options.dryRun) {
        mkdirSync(path.join(siteDir, "images"), { recursive: true });
        writeJson(configPath, mergedConfig);
        writeJson(dataPath, mergedData);
        // Record what the importer itself just derived from the dataset
        // (not the merged-with-hand-edits result) so a future run can tell
        // these exact values apart from whatever a human changes them to.
        writeManifest(siteDir, { config: configBase, data: dataBase });
      }

      recordOutcome(result, { slug: row.slug, outcome: rowOutcomeOf(files), files });
    } catch (error) {
      recordOutcome(result, { slug: row.slug, outcome: "failed", reason: (error as Error).message });
    }
  }

  return result;
}
