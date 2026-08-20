import type { PreviewSiteResult } from "./preview-site.js";

export function formatPreviewSite(preview: PreviewSiteResult): string {
  const { generate, profile, contentReport } = preview;
  const lines: string[] = ["", "=".repeat(60)];
  lines.push(`Preview:           ${generate.slug}`);
  lines.push(`Profile:           ${profile ?? "(none)"}`);

  if (contentReport) {
    lines.push(`Content version:   ${contentReport.contentVersion}`);
    for (const [locale, entry] of Object.entries(contentReport.locales)) {
      lines.push(`  ${locale}:`);
      for (const page of entry.pages) {
        const componentSummary = Object.entries(page.components)
          .map(([component, ids]) => `${component}=${ids.join("+")}`)
          .join(", ");
        lines.push(`    ${page.slug}: skeleton "${page.skeleton}", ${page.wordCount} word(s) — ${componentSummary}`);
      }
      if (entry.issues.length > 0) {
        lines.push(`    issues:`);
        for (const issue of entry.issues) lines.push(`      - ${issue}`);
      }
    }
  } else {
    lines.push(`Locales:           ${generate.locales.join(", ") || "(none)"}`);
    for (const [locale, count] of Object.entries(generate.pageCounts)) lines.push(`  ${locale}: ${count} page(s)`);
  }

  if (generate.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of generate.warnings) lines.push(`  - ${warning}`);
  }

  lines.push("(preview only — no build, no deploy)");
  lines.push("=".repeat(60));
  return lines.join("\n");
}
