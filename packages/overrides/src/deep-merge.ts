function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The one merge rule every override in this package follows: plain objects
// merge key by key (recursively); anything else in the override — arrays
// included — replaces the base value wholesale. Arrays are never merged
// item-by-item: there's no reliable way to match "which item is this" in a
// docx-derived list without fuzzy guessing, so an override that touches an
// array (paragraphs, items, blocks, navigation, ...) must supply the whole
// corrected array.
export function deepMergeOverride<T>(base: T, override: unknown): T {
  if (override === undefined) return base;
  if (Array.isArray(override)) return override as T;
  if (isPlainObject(override) && isPlainObject(base)) {
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
      merged[key] = deepMergeOverride(base[key], value);
    }
    return merged as T;
  }
  return override as T;
}
