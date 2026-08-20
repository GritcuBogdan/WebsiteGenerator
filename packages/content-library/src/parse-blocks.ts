// Parses a content-library entry's raw body into an ordered list of blocks
// — plain prose, plus two structured forms a docx-authored page has always
// been able to produce (packages/schema's parsedContentSectionSchema) but
// the content-library composer never could: tables and bulleted lists.
// Hand-rolled, matching this repo's existing convention for small flat
// formats (frontmatter.ts, env's dotenv parser) rather than pulling in a
// real Markdown parser — the two syntaxes recognized here are a strict
// subset of GitHub-flavored Markdown tables/lists, not general Markdown.
//
// A file with no table/list syntax parses to exactly one "paragraphs"
// block whose content is identical to the old body.split(/\n\s*\n/)
// behavior — every one of the 395 existing library files round-trips
// unchanged through this.

export type EntryBlock =
  | { type: "paragraphs"; paragraphs: string[] }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "list"; title?: string; items: string[] }
  | { type: "heading"; level: 3 | 4; text: string };

function isTableRow(line: string): boolean {
  return line.length > 1 && line.startsWith("|") && line.endsWith("|");
}

function splitTableRow(line: string): string[] {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return splitTableRow(line).every((cell) => /^:?-+:?$/.test(cell));
}

function isListItem(line: string): boolean {
  return /^[-*]\s+/.test(line);
}

function listItemText(line: string): string {
  return line.replace(/^[-*]\s+/, "").trim();
}

function flushParagraphs(buffer: string[], blocks: EntryBlock[]): void {
  const text = buffer.join("\n");
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (paragraphs.length > 0) blocks.push({ type: "paragraphs", paragraphs });
  buffer.length = 0;
}

export function parseBody(rawBody: string): EntryBlock[] {
  const lines = rawBody.replace(/\r\n/g, "\n").split("\n");
  const blocks: EntryBlock[] = [];
  let paragraphBuffer: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    const heading = /^(###|####)\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraphs(paragraphBuffer, blocks);
      blocks.push({ type: "heading", level: heading[1].length === 3 ? 3 : 4, text: heading[2].trim() });
      i++;
      continue;
    }

    if (isTableRow(trimmed)) {
      flushParagraphs(paragraphBuffer, blocks);
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const columns = splitTableRow(tableLines[0]);
      const dataLines = tableLines.length > 1 && isSeparatorRow(tableLines[1]) ? tableLines.slice(2) : tableLines.slice(1);
      const rows = dataLines.map(splitTableRow);
      blocks.push({ type: "table", columns, rows });
      continue;
    }

    if (isListItem(trimmed)) {
      // A line directly above the list, ending in ":", becomes the list's
      // title — e.g. "Available payment methods:" followed immediately by
      // "- Visa" / "- Mastercard" — rather than staying its own paragraph.
      let title: string | undefined;
      const lastBuffered = paragraphBuffer[paragraphBuffer.length - 1]?.trim();
      if (lastBuffered && lastBuffered.endsWith(":")) {
        title = lastBuffered.slice(0, -1).trim();
        paragraphBuffer.pop();
      }
      flushParagraphs(paragraphBuffer, blocks);

      const listLines: string[] = [];
      while (i < lines.length && isListItem(lines[i].trim())) {
        listLines.push(lines[i].trim());
        i++;
      }
      blocks.push({ type: "list", title, items: listLines.map(listItemText) });
      continue;
    }

    paragraphBuffer.push(lines[i]);
    i++;
  }
  flushParagraphs(paragraphBuffer, blocks);

  return blocks;
}

// Every string a placeholder could appear in, across every block — used by
// both placeholder resolution (compose-content.ts) and validation
// (validate-library.ts) so neither has to know the block shapes itself.
export function blockTexts(block: EntryBlock): string[] {
  if (block.type === "paragraphs") return block.paragraphs;
  if (block.type === "table") return [...block.columns, ...block.rows.flat()];
  if (block.type === "heading") return [block.text];
  return block.title !== undefined ? [block.title, ...block.items] : [...block.items];
}
