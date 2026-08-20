import type { SiteData } from "schema";
import { formatCurrencyAmount, formatList, formatNumber } from "./formatting.js";

// {{TOKEN}} placeholders content-library prose uses (architecture doc
// §16). One resolver per token, each backed by a real SiteData field —
// returns undefined when the fact it needs isn't present, and never
// fabricates a value (§17's "never invent facts" is non-negotiable, and
// this is the one place a missing fact could otherwise leak into
// generated copy).
//
// {{COUNTRY}} from the original brief is deliberately not registered:
// no SiteData field backs it yet (see site-data.ts's own header comment —
// add a field only once a real content component needs it). Add it here,
// and to SiteData, together, once something actually consumes it.
export type PlaceholderKey =
  | "BRAND_NAME"
  | "GAME_COUNT"
  | "WELCOME_BONUS"
  | "MINIMUM_DEPOSIT"
  | "CURRENCY"
  | "PAYMENT_METHODS"
  | "WITHDRAWAL_METHODS"
  | "NO_DEPOSIT_BONUS"
  | "FREE_SPINS_COUNT"
  | "PROMO_CODE";

type PlaceholderResolver = (data: SiteData, locale: string) => string | undefined;

const PLACEHOLDER_REGISTRY: Record<PlaceholderKey, PlaceholderResolver> = {
  BRAND_NAME: (data) => data.brandName,

  GAME_COUNT: (data, locale) => (data.gameCount === undefined ? undefined : formatNumber(data.gameCount, locale)),

  WELCOME_BONUS: (data, locale) =>
    data.welcomeBonus
      ? formatCurrencyAmount(data.welcomeBonus.amount, data.welcomeBonus.currency, locale)
      : undefined,

  // Falls back to the welcome bonus's own currency, then the site's first
  // supported currency, when minimumDeposit has no currency of its own to
  // format against — degrades to a plain number rather than failing the
  // whole placeholder when neither is set.
  MINIMUM_DEPOSIT: (data, locale) => {
    if (data.minimumDeposit === undefined) return undefined;
    const currency = data.welcomeBonus?.currency ?? data.supportedCurrencies?.[0];
    return currency
      ? formatCurrencyAmount(data.minimumDeposit, currency, locale)
      : formatNumber(data.minimumDeposit, locale);
  },

  CURRENCY: (data) => data.welcomeBonus?.currency ?? data.supportedCurrencies?.[0],

  PAYMENT_METHODS: (data, locale) =>
    data.paymentMethods && data.paymentMethods.length > 0 ? formatList(data.paymentMethods, locale) : undefined,

  WITHDRAWAL_METHODS: (data, locale) =>
    data.withdrawalMethods && data.withdrawalMethods.length > 0
      ? formatList(data.withdrawalMethods, locale)
      : undefined,

  NO_DEPOSIT_BONUS: (data, locale) =>
    data.noDepositBonus
      ? formatCurrencyAmount(data.noDepositBonus.amount, data.noDepositBonus.currency, locale)
      : undefined,

  FREE_SPINS_COUNT: (data, locale) => (data.freeSpins === undefined ? undefined : formatNumber(data.freeSpins.count, locale)),

  PROMO_CODE: (data) => data.promoCode,
};

export function isKnownPlaceholder(token: string): token is PlaceholderKey {
  return Object.prototype.hasOwnProperty.call(PLACEHOLDER_REGISTRY, token);
}

export function knownPlaceholders(): PlaceholderKey[] {
  return Object.keys(PLACEHOLDER_REGISTRY) as PlaceholderKey[];
}

const PLACEHOLDER_PATTERN = /\{\{([A-Z0-9_]+)\}\}/g;

export function extractPlaceholders(text: string): string[] {
  const tokens = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    tokens.add(match[1]);
  }
  return [...tokens];
}

// Independent of any specific site's data — for content:validate (a later
// phase) to catch a typo'd or unsupported token the moment it's authored,
// not the first time a site with matching data happens to hit it.
export function validatePlaceholderTokens(text: string): { unknown: string[] } {
  return { unknown: extractPlaceholders(text).filter((token) => !isKnownPlaceholder(token)) };
}

export type ResolveResult = { ok: true; text: string } | { ok: false; unknown: string[]; missing: string[] };

// Substitutes every {{TOKEN}} in `text` using `data`, locale-aware. Fails
// closed: an unknown token or a token whose backing fact is missing from
// `data` fails the whole substitution rather than leaving a literal
// "{{...}}" in generated output or silently dropping it. The composer
// (a later phase) treats a failed resolution as "this variant isn't
// eligible for this site," the same way a frontmatter `requires` mismatch
// does — this is the independent safety net behind that, not a
// replacement for declaring `requires` accurately.
export function resolvePlaceholders(text: string, data: SiteData, locale: string): ResolveResult {
  const tokens = extractPlaceholders(text);

  const unknown = tokens.filter((token) => !isKnownPlaceholder(token));
  if (unknown.length > 0) {
    return { ok: false, unknown, missing: [] };
  }

  const resolved = new Map<string, string>();
  const missing: string[] = [];
  for (const token of tokens as PlaceholderKey[]) {
    const value = PLACEHOLDER_REGISTRY[token](data, locale);
    if (value === undefined) {
      missing.push(token);
    } else {
      resolved.set(token, value);
    }
  }
  if (missing.length > 0) {
    return { ok: false, unknown: [], missing };
  }

  return { ok: true, text: text.replace(PLACEHOLDER_PATTERN, (_match, token: string) => resolved.get(token)!) };
}
