import { createHash } from "node:crypto";

// Text similarity utilities for quality control (architecture doc
// §24/§25) — normalized text, word shingles, Jaccard similarity, and a
// content-derived hash. Deliberately simple: shingle/Jaccard comparison
// is genuinely sufficient at this library's scale (§7's "10 good
// variants, not 1000 spun ones" means tens, not thousands, of entries
// per component) — starting with embeddings or any other ML approach
// here would be solving a problem that doesn't exist yet.
//
// This exists to catch when our OWN content library or generated sites
// have accidentally become too similar to each other — never to help
// evade search-engine duplicate-content detection.

// Lowercases, strips punctuation, and collapses whitespace so two
// paragraphs differing only in capitalization/punctuation/spacing still
// compare as identical.
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Word n-grams ("shingles") of the normalized text — the standard,
// simple building block for approximate text-similarity comparison.
// Short text (fewer words than `size`) still produces one shingle from
// whatever words it has, rather than an empty set that would trivially
// "match" every other short text.
export function shingles(text: string, size = 3): Set<string> {
  const words = normalizeText(text).split(" ").filter(Boolean);
  if (words.length === 0) return new Set();
  if (words.length < size) return new Set([words.join(" ")]);

  const result = new Set<string>();
  for (let i = 0; i <= words.length - size; i++) {
    result.add(words.slice(i, i + size).join(" "));
  }
  return result;
}

// |A ∩ B| / |A ∪ B|. Two empty shingle sets are trivially identical (1),
// matching the usual Jaccard convention rather than dividing by zero.
export function jaccardSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

// A stable, content-derived fingerprint, hashed after normalization —
// "exact" here means "identical once case/punctuation/whitespace
// differences are ignored," a deliberately more useful bar for catching
// copy-paste mistakes than strict byte-equality would be, not a claim
// this is a cryptographic content-authenticity check.
export function sha256Hash(text: string): string {
  return createHash("sha256").update(normalizeText(text)).digest("hex");
}
