import type { StageName } from "./pipeline.js";

export type ParsedGenerateArgs = {
  siteDir?: string;
  // --site=<slug> — an alternative to the positional siteDir, resolved
  // against sites/<slug>. Also usable together with --all as a "just this
  // one site" filter on the batch, and required (without a positional) for
  // --preview.
  site?: string;
  all: boolean;
  preview: boolean;
  locale?: string;
  limit?: number;
  dryRun: boolean;
  previewOnly: boolean;
  skipDeploy: boolean;
  verbose: boolean;
  only?: StageName[];
};

export function parseGenerateArgs(args: string[]): ParsedGenerateArgs {
  const result: ParsedGenerateArgs = {
    all: false,
    preview: false,
    dryRun: false,
    previewOnly: false,
    skipDeploy: false,
    verbose: false,
  };
  const positional: string[] = [];

  for (const arg of args) {
    if (arg === "--dry-run") result.dryRun = true;
    else if (arg === "--preview-only") result.previewOnly = true;
    else if (arg === "--skip-deploy") result.skipDeploy = true;
    else if (arg === "--verbose") result.verbose = true;
    else if (arg === "--all") result.all = true;
    else if (arg === "--preview") result.preview = true;
    else if (arg.startsWith("--site=")) result.site = arg.slice("--site=".length);
    else if (arg.startsWith("--locale=")) result.locale = arg.slice("--locale=".length);
    else if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(value) || value < 0) throw new Error(`--limit must be a non-negative integer, got "${arg.slice("--limit=".length)}"`);
      result.limit = value;
    } else if (arg.startsWith("--only=")) {
      result.only = arg
        .slice("--only=".length)
        .split(",")
        .map((stage) => stage.trim())
        .filter(Boolean) as StageName[];
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  result.siteDir = positional[0];
  return result;
}

export type ParsedValidateSitesArgs = {
  all: boolean;
  site?: string;
  locale?: string;
};

export function parseValidateSitesArgs(args: string[]): ParsedValidateSitesArgs {
  const result: ParsedValidateSitesArgs = { all: false };

  for (const arg of args) {
    if (arg === "--all") result.all = true;
    else if (arg.startsWith("--site=")) result.site = arg.slice("--site=".length);
    else if (arg.startsWith("--locale=")) result.locale = arg.slice("--locale=".length);
    else throw new Error(`Unknown flag: ${arg}`);
  }

  return result;
}

export type ParsedImportSitesArgs = {
  datasetPath?: string;
  force: boolean;
  dryRun: boolean;
};

export function parseImportSitesArgs(args: string[]): ParsedImportSitesArgs {
  const result: ParsedImportSitesArgs = { force: false, dryRun: false };
  const positional: string[] = [];

  for (const arg of args) {
    if (arg === "--force") result.force = true;
    else if (arg === "--dry-run") result.dryRun = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown flag: ${arg}`);
    else positional.push(arg);
  }

  result.datasetPath = positional[0];
  return result;
}
