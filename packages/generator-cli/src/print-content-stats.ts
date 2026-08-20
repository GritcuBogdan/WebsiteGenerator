import type { ContentLibraryStats } from "content-library";

export function formatContentStats(stats: ContentLibraryStats): string {
  const locales = Object.keys(stats).sort();
  if (locales.length === 0) return "Content library is empty.";

  const lines: string[] = [];
  for (const locale of locales) {
    lines.push(locale);
    for (const component of Object.keys(stats[locale]).sort()) {
      lines.push(`  ${component}: ${stats[locale][component]}`);
    }
  }
  return lines.join("\n");
}
