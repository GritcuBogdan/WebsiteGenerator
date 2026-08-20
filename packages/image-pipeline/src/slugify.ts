import path from "node:path";

// Mirrors casinoParser.py's slugify() so filenames and section ids follow
// the same convention across the whole pipeline: NFKD-fold diacritics,
// drop anything non-ASCII, lowercase, collapse non-alphanumerics to a
// single hyphen, trim.
export function slugifyName(value: string, fallback = "file"): string {
  const folded = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const ascii = folded.replace(/[^\x00-\x7F]/g, "");
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

export type SlugifiedPath = {
  dir: string; // slugified directory segments joined with "/", "" if none
  base: string; // slugified filename without extension
  ext: string; // lowercased extension, including the leading dot
};

// Slugifies every path segment independently so a source tree like
// "Slot Images/Book Of Ra!.JPG" becomes "slot-images/book-of-ra.jpg"
// while still preserving the directories that group related images.
export function slugifyRelativePath(relativePath: string): SlugifiedPath {
  const parsed = path.parse(relativePath);
  const dirSegments = parsed.dir
    .split(/[\\/]/)
    .filter(Boolean)
    .map((segment) => slugifyName(segment, "dir"));

  return {
    dir: dirSegments.join("/"),
    base: slugifyName(parsed.name, "file"),
    ext: parsed.ext.toLowerCase(),
  };
}

// Appends -2, -3, ... until `candidate` no longer collides within `used`,
// then reserves the result. Callers scope `used` however collisions should
// be scoped (e.g. one Set per output directory).
export function dedupeName(candidate: string, used: Set<string>): string {
  let name = candidate;
  let counter = 2;
  while (used.has(name)) {
    name = `${candidate}-${counter}`;
    counter += 1;
  }
  used.add(name);
  return name;
}
