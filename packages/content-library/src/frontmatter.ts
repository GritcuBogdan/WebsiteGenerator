// Minimal hand-rolled frontmatter parser, matching the repo's existing
// convention of hand-rolling small, flat formats rather than pulling in a
// dependency (see packages/env's dotenv parser, codegen's hand-rolled
// sitemap XML). Content-library frontmatter is always a flat block of
// `key: value` lines — never nested objects — so this doesn't need to be a
// real YAML parser.
//
//   ---
//   id: bonus-003
//   component: bonus
//   requires: [welcomeBonus, minimumDeposit]
//   ---
//   Body text, one or more paragraphs...
//
// Frontmatter is optional: a file with no leading "---" block is valid
// too (empty data, the whole file is body) — content authors shouldn't be
// forced to write metadata a file doesn't need.

export class FrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontmatterError";
  }
}

export type FrontmatterValue = string | string[];
export type ParsedFrontmatter = {
  data: Record<string, FrontmatterValue>;
  body: string;
};

function parseValue(raw: string): FrontmatterValue {
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return raw;
}

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const normalized = raw.replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---\n")) {
    return { data: {}, body: normalized.trim() };
  }

  const closingIndex = normalized.indexOf("\n---", 4);
  if (closingIndex === -1) {
    throw new FrontmatterError('frontmatter block is missing its closing "---"');
  }

  const block = normalized.slice(4, closingIndex);
  const afterClosing = normalized.slice(closingIndex + 4);
  const body = afterClosing.startsWith("\n") ? afterClosing.slice(1).trim() : afterClosing.trim();

  const data: Record<string, FrontmatterValue> = {};
  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      throw new FrontmatterError(`malformed frontmatter line (expected "key: value"): "${line.trim()}"`);
    }
    const key = line.slice(0, colonIndex).trim();
    if (!key) {
      throw new FrontmatterError(`malformed frontmatter line (empty key): "${line.trim()}"`);
    }
    data[key] = parseValue(line.slice(colonIndex + 1).trim());
  }

  return { data, body };
}
