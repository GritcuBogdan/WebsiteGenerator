import type { ContentLibraryValidationResult } from "content-library";

export function formatContentValidation(result: ContentLibraryValidationResult): string {
  const lines: string[] = [
    `Content library: ${result.entryCount} entr${result.entryCount === 1 ? "y" : "ies"}, ${result.skeletonCount} skeleton(s), ${result.pageTypeCount} page type(s)`,
  ];

  if (result.issues.length === 0) {
    lines.push("No issues found.");
    return lines.join("\n");
  }

  lines.push("", `${result.issues.length} issue(s):`);
  for (const issue of result.issues) lines.push(`  - ${issue}`);
  return lines.join("\n");
}
