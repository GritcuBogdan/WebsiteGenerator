import type { BulkGenerateResult, BulkGenerateSiteOutcome } from "./bulk-generate.js";

export function formatBulkGenerateProgress(outcome: BulkGenerateSiteOutcome, completed: number, total: number): string {
  const width = String(total).length;
  const number = String(completed).padStart(width, "0");
  const dots = ".".repeat(Math.max(3, 24 - outcome.slug.length));
  if (outcome.status === "success") {
    const pages = Object.values(outcome.result.pageCounts).reduce((sum, n) => sum + n, 0);
    return `[${number}/${total}] ${outcome.slug} ${dots} OK (${pages} page(s), ${outcome.result.buildDurationMs}ms)`;
  }
  return `[${number}/${total}] ${outcome.slug} ${dots} FAILED — ${outcome.reason}`;
}

export function formatBulkGenerateSummary(result: BulkGenerateResult): string {
  const lines: string[] = [
    `${result.sites.length} site(s): ${result.succeeded.length} succeeded, ${result.failed.length} failed`,
  ];
  if (result.failed.length > 0) {
    lines.push("failed:");
    for (const failure of result.failed) lines.push(`  - ${failure.slug}: ${failure.reason}`);
  }
  return lines.join("\n");
}
