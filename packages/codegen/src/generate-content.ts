import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Casino, LanguageOption } from "schema";

// Writes .generated/content/site.ts — one Casino per locale the site has,
// plus the locale metadata (label/flag) and default-locale marker the
// template's language switcher needs but which isn't part of any single
// Casino object. Fully disposable: this *is* how "regenerate an existing
// site" works, there is no separate code path, running the pipeline again
// just overwrites this file.
export async function writeSiteContent(
  casinoLocales: Casino[],
  languageOptions: LanguageOption[],
  defaultLocale: string,
  outputPath: string,
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });

  const body =
    `import type { Casino, LanguageOption } from "schema";\n\n` +
    `export const siteLocales = ${JSON.stringify(casinoLocales, null, 2)} satisfies Casino[];\n\n` +
    `export const languageOptions = ${JSON.stringify(languageOptions, null, 2)} satisfies LanguageOption[];\n\n` +
    `export const defaultLocale = ${JSON.stringify(defaultLocale)};\n`;

  await writeFile(outputPath, body, "utf-8");
}
