import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PageSelectionReport } from "content-library";
import { generate, type GenerateResult, type StageName } from "./pipeline.js";

// Everything through validate-site, nothing that writes a build or touches
// deployment — architecture doc §05: "runs stages through validate-site
// only... prints resolved data/profile/skeleton/components/word-count/
// validation instead of building."
const PREVIEW_STAGES: StageName[] = ["load-config", "parse-docx", "apply-overrides", "process-images", "assemble-site", "validate-site"];

export type ContentReport = {
  slug: string;
  contentVersion: string;
  locales: Record<string, { pages: PageSelectionReport[]; issues: string[] }>;
};

export type PreviewSiteResult = {
  generate: GenerateResult;
  profile?: string;
  // Only present for contentSource:"library" sites — parse-docx writes this
  // as a byproduct of composeContent (pipeline.ts), so no extra work is
  // needed to get it; a docx site simply has none, and the preview output
  // falls back to generate()'s own page counts/warnings.
  contentReport?: ContentReport;
};

export async function previewSite(siteDir: string, repoRoot: string = process.cwd()): Promise<PreviewSiteResult> {
  const result = await generate(siteDir, {
    repoRoot,
    // `skipDeploy` matters even though PREVIEW_STAGES already excludes
    // every deploy stage: generate() builds its Cloudflare/registry
    // providers unconditionally whenever skipDeploy is falsy, regardless
    // of `only` — omitting this would still try to load real credentials.
    skipDeploy: true,
    only: PREVIEW_STAGES,
  });

  const configPath = path.join(siteDir, "config.json");
  let profile: string | undefined;
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    if (raw && typeof raw === "object" && typeof (raw as { profile?: unknown }).profile === "string") {
      profile = (raw as { profile: string }).profile;
    }
  } catch {
    // generate() above would already have thrown on an unreadable config;
    // reaching here with a read failure would be a race, not a real case.
  }

  const reportPath = path.join(siteDir, ".generated", "content-report.json");
  const contentReport = existsSync(reportPath) ? (JSON.parse(readFileSync(reportPath, "utf-8")) as ContentReport) : undefined;

  return { generate: result, profile, contentReport };
}
