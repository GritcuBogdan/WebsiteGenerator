import { createHash } from "node:crypto";

// Deterministic seed from slug+locale+contentVersion (architecture doc
// §26) — the same inputs always produce the same seed, and therefore the
// same composed content, until contentVersion is bumped on purpose. Never
// needs cryptographic strength (this only ever drives "which content
// variant," nothing security-sensitive) — sha256 is just a convenient,
// well-distributed, dependency-free way to turn an arbitrary string into
// a well-mixed integer, via Node's built-in node:crypto.
export function createSeed(parts: readonly string[]): number {
  const hash = createHash("sha256").update(parts.join("|")).digest();
  return hash.readUInt32BE(0);
}

// mulberry32 — a small, fast, seedable PRNG returning values in [0, 1).
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickOne<T>(rng: () => number, items: readonly T[]): T {
  if (items.length === 0) {
    throw new RangeError("pickOne called with an empty array");
  }
  const index = Math.min(Math.floor(rng() * items.length), items.length - 1);
  return items[index];
}

// Picks up to `count` items without replacement. Returned in `items`'
// original relative order (not shuffled) — a FAQ list built this way
// reads in the library's natural order rather than looking randomized.
export function pickMany<T>(rng: () => number, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const picked = new Set<T>();
  const n = Math.min(Math.max(count, 0), pool.length);
  for (let i = 0; i < n; i++) {
    const index = Math.min(Math.floor(rng() * pool.length), pool.length - 1);
    picked.add(pool.splice(index, 1)[0]);
  }
  return items.filter((item) => picked.has(item));
}
