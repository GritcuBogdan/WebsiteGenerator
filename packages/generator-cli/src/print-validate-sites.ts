import type { CheckLevel, SiteValidation, ValidateSitesResult } from "./validate-sites.js";

const LEVEL_LABEL: Record<CheckLevel, string> = { OK: "OK", WARNING: "WARN", ERROR: "ERROR" };

function formatSite(site: SiteValidation): string {
  const lines = [`[${site.level}] ${site.slug}`];
  for (const check of site.checks) {
    if (check.level === "OK") continue; // only surface what needs attention, per-check
    lines.push(`  ${LEVEL_LABEL[check.level]} ${check.name}: ${check.detail}`);
  }
  if (site.checks.every((c) => c.level === "OK")) lines.push(`  all ${site.checks.length} check(s) OK`);
  return lines.join("\n");
}

export function formatValidateSites(result: ValidateSitesResult): string {
  const lines: string[] = [];
  for (const site of result.sites) lines.push(formatSite(site), "");

  lines.push(
    `${result.sites.length} site(s): ${result.okCount} OK, ${result.warningCount} warning(s), ${result.errorCount} error(s)`,
  );
  if (result.errorCount > 0) {
    lines.push("Fix the ERROR site(s) above before running generate --all — they'll fail generation the same way.");
  }
  return lines.join("\n");
}
