import type { DuplicateFinding } from "content-library";

export function formatContentDedupe(findings: DuplicateFinding[]): string {
  if (findings.length === 0) return "No duplicate or near-duplicate content found.";

  const exact = findings.filter((finding) => finding.kind === "exact");
  const near = findings.filter((finding) => finding.kind === "near");
  const lines: string[] = [];

  if (exact.length > 0) {
    lines.push(`${exact.length} exact duplicate(s):`);
    for (const finding of exact) {
      lines.push(`  - [${finding.locale}/${finding.component}] ${finding.entryA} == ${finding.entryB}`);
    }
  }

  if (near.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`${near.length} near-duplicate(s):`);
    for (const finding of near) {
      lines.push(`  - [${finding.locale}/${finding.component}] ${finding.entryA} ~ ${finding.entryB} (${Math.round(finding.jaccard * 100)}% similar)`);
    }
  }

  return lines.join("\n");
}
