#!/usr/bin/env node
import path from "node:path";
import { loadContentLibrary, validateContentLibrary, computeContentLibraryStats, findDuplicateContent } from "content-library";
import { generate } from "./pipeline.js";
import { newSite } from "./new-site.js";
import { importSites } from "./import-sites.js";
import { parseGenerateArgs, parseImportSitesArgs, parseValidateSitesArgs } from "./cli-args.js";
import { formatSummary } from "./print-summary.js";
import { formatContentValidation } from "./print-content-validation.js";
import { formatContentStats } from "./print-content-stats.js";
import { formatContentDedupe } from "./print-content-dedupe.js";
import { formatImportSitesProgress, formatImportSitesDryRun } from "./print-import-sites.js";
import { validateSites } from "./validate-sites.js";
import { formatValidateSites } from "./print-validate-sites.js";
import { bulkGenerate } from "./bulk-generate.js";
import { formatBulkGenerateProgress, formatBulkGenerateSummary } from "./print-bulk-generate.js";
import { previewSite } from "./preview-site.js";
import { formatPreviewSite } from "./print-preview-site.js";
import { PipelineError } from "./pipeline-error.js";

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "generate") {
    const args = parseGenerateArgs(rest);

    if (args.all) {
      const result = await bulkGenerate({
        sitesRoot: path.resolve("sites"),
        dryRun: args.dryRun,
        skipDeploy: args.skipDeploy,
        site: args.site,
        locale: args.locale,
        limit: args.limit,
        only: args.only,
        onSiteComplete: (outcome, completed, total) => console.log(formatBulkGenerateProgress(outcome, completed, total)),
      });
      console.log("");
      console.log(formatBulkGenerateSummary(result));
      if (result.failed.length > 0) process.exitCode = 1;
      return;
    }

    const siteDir = args.siteDir ? path.resolve(args.siteDir) : args.site ? path.resolve("sites", args.site) : undefined;
    if (!siteDir) {
      throw new Error(
        "Usage: generate <site-dir> [--dry-run] [--preview-only] [--skip-deploy] [--only=stage1,stage2] [--verbose]\n" +
          "   or: generate --site=<slug> --preview\n" +
          "   or: generate --all [--dry-run] [--site=<slug>] [--locale=<code>] [--limit=<n>]",
      );
    }

    if (args.preview) {
      const preview = await previewSite(siteDir);
      console.log(formatPreviewSite(preview));
      return;
    }

    const result = await generate(siteDir, args);
    console.log(formatSummary(result));
    return;
  }

  if (command === "validate-sites") {
    const args = parseValidateSitesArgs(rest);
    if (!args.all && !args.site) {
      throw new Error("Usage: validate-sites --all [--site=<slug>] [--locale=<code>]");
    }
    const result = await validateSites({ sitesRoot: path.resolve("sites"), site: args.site, locale: args.locale });
    console.log(formatValidateSites(result));
    if (result.errorCount > 0) process.exitCode = 1;
    return;
  }

  if (command === "new-site") {
    const slug = rest[0];
    if (!slug) throw new Error("Usage: new-site <slug>");
    const siteDir = newSite(slug, path.resolve("sites"));
    console.log(`Created ${siteDir}`);
    console.log("Next: edit data.json with real facts, add images/, then run:");
    console.log(`  npm run generate -- ${path.relative(process.cwd(), siteDir)}`);
    return;
  }

  if (command === "content:validate") {
    const rootDir = path.resolve(rest[0] ?? "content-library");
    const result = await validateContentLibrary(rootDir);
    console.log(formatContentValidation(result));
    if (result.issues.length > 0) process.exitCode = 1;
    return;
  }

  if (command === "content:stats") {
    const rootDir = path.resolve(rest[0] ?? "content-library");
    const library = await loadContentLibrary(rootDir);
    console.log(formatContentStats(computeContentLibraryStats(library.entries)));
    return;
  }

  if (command === "import-sites") {
    const args = parseImportSitesArgs(rest);
    const datasetPath = path.resolve(args.datasetPath ?? "data/casinos.json");
    const result = importSites(datasetPath, path.resolve("sites"), {
      force: args.force,
      dryRun: args.dryRun,
      profilesDir: path.resolve("profiles"),
    });
    console.log(args.dryRun ? formatImportSitesDryRun(result) : formatImportSitesProgress(result));
    if (result.failed.length > 0) process.exitCode = 1;
    return;
  }

  if (command === "content:dedupe") {
    const rootDir = path.resolve(rest[0] ?? "content-library");
    const library = await loadContentLibrary(rootDir);
    const findings = findDuplicateContent(library.entries);
    console.log(formatContentDedupe(findings));
    if (findings.some((finding) => finding.kind === "exact")) process.exitCode = 1;
    return;
  }

  throw new Error(
    `Unknown command "${command ?? ""}". Expected "generate", "new-site", "import-sites", "validate-sites", "content:validate", "content:stats", or "content:dedupe".`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof PipelineError) {
    console.error(`\n✖ ${error.message}`);
  } else {
    console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exit(1);
});
