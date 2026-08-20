// Locale-aware formatting for placeholder substitution (architecture doc
// §16: "payment methods in German should not simply be joined with an
// English comma pattern"). Built entirely on Node's built-in Intl — no new
// dependency, and the repo's engines requirement (node >=22.12) guarantees
// Intl.ListFormat/NumberFormat support, so no feature-detection fallback
// is needed for something that can't actually fail here.

export function formatList(
  items: string[],
  locale: string,
  type: "conjunction" | "disjunction" = "conjunction",
): string {
  return new Intl.ListFormat(locale, { style: "long", type }).format(items);
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

// Whole amounts render with no decimals ("€500", not "€500.00") — casino
// bonus/deposit figures are always whole numbers in practice; a
// non-integer amount still renders with up to 2 decimal places.
export function formatCurrencyAmount(amount: number, currency: string, locale: string): string {
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    // An unrecognized ISO currency code is bad site data, not a code bug —
    // degrade to a plain number + the raw code rather than throwing out of
    // a content-composition path.
    return `${formatNumber(amount, locale)} ${currency}`;
  }
}
