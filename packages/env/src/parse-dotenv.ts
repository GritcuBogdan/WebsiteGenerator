// A deliberately minimal .env parser (KEY=VALUE lines, # comments, blank
// lines, optionally quoted values) rather than a new dependency — the
// format we need is simple enough not to warrant pulling in a library for
// it, matching how this repo hand-rolls other small, well-understood
// formats (e.g. packages/image-pipeline's ICO encoder).
export function parseDotenv(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    const isQuoted =
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2);
    if (isQuoted) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }

  return result;
}
