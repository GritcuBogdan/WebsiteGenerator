import type { ImportSitesResult, ImportSitesRowResult } from "./import-sites.js";

export function formatImportSites(result: ImportSitesResult): string {
  const lines: string[] = [
    `Created: ${result.created.length}, Updated: ${result.updated.length}, Unchanged: ${result.unchanged.length}, Failed: ${result.failed.length}`,
  ];

  if (result.created.length > 0) lines.push(`  created: ${result.created.join(", ")}`);
  if (result.updated.length > 0) lines.push(`  updated: ${result.updated.join(", ")}`);
  if (result.unchanged.length > 0) lines.push(`  unchanged: ${result.unchanged.join(", ")}`);
  if (result.failed.length > 0) {
    lines.push("  failed:");
    for (const failure of result.failed) lines.push(`    - ${failure.slug}: ${failure.reason}`);
  }

  return lines.join("\n");
}

const OUTCOME_LABEL: Record<ImportSitesRowResult["outcome"], string> = {
  created: "CREATE",
  updated: "UPDATE",
  unchanged: "UNCHANGED",
  failed: "ERROR",
};

// Numbered per-row progress, useful at 100-site scale — see
// architecture doc's batch-output example ("[001/100] luckyspin ... CREATE").
export function formatImportSitesProgress(result: ImportSitesResult): string {
  const total = result.rows.length;
  const width = String(total).length;
  const lines = result.rows.map((row, index) => {
    const number = String(index + 1).padStart(width, "0");
    const label = OUTCOME_LABEL[row.outcome];
    const suffix = row.outcome === "failed" ? ` — ${row.reason}` : "";
    return `[${number}/${total}] ${row.slug} ${".".repeat(Math.max(3, 24 - row.slug.length))} ${label}${suffix}`;
  });
  lines.push("", formatImportSites(result));
  return lines.join("\n");
}

// Dry-run report: only what would actually change, grouped the way the
// architecture doc's dry-run example is — "Would create/update/reject",
// silent about sites a re-run would leave untouched.
export function formatImportSitesDryRun(result: ImportSitesResult): string {
  const created = result.rows.filter((row) => row.outcome === "created");
  const updated = result.rows.filter((row) => row.outcome === "updated");
  const failed = result.rows.filter((row) => row.outcome === "failed");

  const lines: string[] = [];

  if (created.length > 0) {
    lines.push("Would create:");
    for (const row of created) lines.push(`  ${row.slug}/`);
    lines.push("");
  }

  if (updated.length > 0) {
    lines.push("Would update:");
    for (const row of updated) {
      if (row.files?.config === "updated") lines.push(`  ${row.slug}/config.json`);
      if (row.files?.data === "updated") lines.push(`  ${row.slug}/data.json`);
    }
    lines.push("");
  }

  if (failed.length > 0) {
    lines.push("Would reject:");
    for (const row of failed) {
      lines.push(`  ${row.slug}`);
      lines.push(`    - ${row.reason}`);
    }
    lines.push("");
  }

  if (created.length === 0 && updated.length === 0 && failed.length === 0) {
    lines.push(`Nothing to do — all ${result.rows.length} site(s) already match the dataset.`);
  }

  return lines.join("\n").trimEnd();
}
