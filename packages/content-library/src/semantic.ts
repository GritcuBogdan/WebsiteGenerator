import type { PageType } from "schema";

/**
 * Semantic metadata for an entry discovered from the legacy
 * locale/component directory layout.
 *
 * New content should live under locale/topic/section/ and gets its topic and
 * section from the path (or explicit frontmatter). This table is deliberately
 * small: it is a migration boundary for the current library, not a second
 * content system. Keeping it here lets the existing Markdown stay useful
 * while new content can use the page-first layout immediately.
 */
export type LegacySemanticMetadata = {
  topic: string;
  section: string;
  compatiblePageTypes: string[];
};

const ALL_PAGE_TYPES = [
  "home",
  "index",
  "review",
  "bonus",
  "slots",
  "casino-games",
  "live-casino",
  "payments",
  "withdrawal",
  "withdrawals",
  "mobile",
  "security",
  "login",
  "support",
  "application",
  "no-deposit-bonus",
  "free-spins",
  "promo-code",
  "registration",
];

const LEGACY_SEMANTICS: Record<string, LegacySemanticMetadata> = {
  // Generic legacy content remains available as an explicitly broad
  // migration fallback. Exact topic entries always outrank these entries in
  // composition, so a future slots.intro or login.faq automatically wins.
  intro: { topic: "shared", section: "intro", compatiblePageTypes: ALL_PAGE_TYPES },
  faq: { topic: "shared", section: "faq", compatiblePageTypes: ALL_PAGE_TYPES },
  cta: { topic: "shared", section: "cta", compatiblePageTypes: ALL_PAGE_TYPES },
  conclusion: { topic: "shared", section: "conclusion", compatiblePageTypes: ALL_PAGE_TYPES },

  bonus: {
    topic: "bonus",
    section: "welcome-offer",
    compatiblePageTypes: ["home", "index", "review", "bonus", "no-deposit-bonus", "free-spins", "promo-code"],
  },
  "bonus-terms": {
    topic: "bonus",
    section: "terms",
    compatiblePageTypes: ["home", "index", "review", "bonus", "no-deposit-bonus", "free-spins", "promo-code"],
  },
  games: {
    topic: "casino-games",
    section: "games",
    compatiblePageTypes: ["home", "index", "review", "casino-games", "live-casino", "free-spins", "application", "no-deposit-bonus", "mobile"],
  },
  payments: {
    topic: "payments",
    section: "payments",
    compatiblePageTypes: ["home", "index", "review", "bonus", "payments", "withdrawal", "withdrawals", "no-deposit-bonus", "free-spins", "promo-code", "mobile", "security", "support", "casino-games", "live-casino", "application"],
  },
  withdrawals: {
    topic: "withdrawals",
    section: "withdrawals",
    compatiblePageTypes: ["review", "withdrawal", "withdrawals", "payments"],
  },
  security: {
    topic: "security",
    section: "security",
    compatiblePageTypes: ["home", "index", "review", "withdrawal", "withdrawals", "security", "login"],
  },
  support: {
    topic: "support",
    section: "support",
    compatiblePageTypes: ["home", "index", "review", "bonus", "withdrawal", "withdrawals", "security", "support", "application", "no-deposit-bonus", "free-spins", "promo-code", "payments"],
  },

  "welcome-offer": {
    topic: "bonus",
    section: "welcome-offer",
    compatiblePageTypes: ["home", "index", "bonus", "promo-code"],
  },
  terms: {
    topic: "bonus",
    section: "terms",
    compatiblePageTypes: ["bonus", "no-deposit-bonus", "free-spins", "promo-code"],
  },
  "free-spins": {
    topic: "bonus",
    section: "free-spins",
    compatiblePageTypes: ["bonus", "free-spins"],
  },
  "no-deposit-bonus": {
    topic: "bonus",
    section: "no-deposit-bonus",
    compatiblePageTypes: ["no-deposit-bonus"],
  },
  "promo-code": {
    topic: "bonus",
    section: "promo-code",
    compatiblePageTypes: ["bonus", "promo-code"],
  },
  providers: {
    topic: "shared",
    section: "providers",
    compatiblePageTypes: ["slots", "casino-games", "live-casino", "free-spins"],
  },
  "mobile-play": {
    topic: "shared",
    section: "mobile-play",
    compatiblePageTypes: ["slots", "casino-games", "live-casino", "payments", "withdrawal", "withdrawals", "mobile", "security", "support", "no-deposit-bonus", "free-spins", "promo-code"],
  },
  registration: {
    topic: "login",
    section: "registration",
    compatiblePageTypes: ["login", "application"],
  },
  "account-access": {
    topic: "login",
    section: "account-access",
    compatiblePageTypes: ["login", "application"],
  },
  "how-to-play": {
    topic: "slots",
    section: "how-to-play",
    compatiblePageTypes: ["slots"],
  },
  jackpots: {
    topic: "slots",
    section: "jackpots",
    compatiblePageTypes: ["slots"],
  },
  rtp: {
    topic: "slots",
    section: "rtp",
    compatiblePageTypes: ["slots"],
  },
  mobile: {
    topic: "mobile",
    section: "mobile",
    compatiblePageTypes: ["mobile"],
  },
  privacy: {
    topic: "shared",
    section: "privacy",
    compatiblePageTypes: ["security", "support"],
  },
  "how-to-login": {
    topic: "login",
    section: "how-to-login",
    compatiblePageTypes: ["login", "application"],
  },
  "forgot-password": {
    topic: "login",
    section: "forgot-password",
    compatiblePageTypes: ["login", "application"],
  },
  troubleshooting: {
    topic: "login",
    section: "troubleshooting",
    compatiblePageTypes: ["login", "application"],
  },

  // Existing slots content already has useful semantic component names. Its
  // topic/section mapping is what makes the current library page-first
  // without requiring a mass Markdown move in this migration.
  "slots-intro": { topic: "slots", section: "intro", compatiblePageTypes: ["slots"] },
  "slot-providers": { topic: "slots", section: "providers", compatiblePageTypes: ["slots"] },
  "slots-rtp": { topic: "slots", section: "rtp", compatiblePageTypes: ["slots"] },
  "slots-jackpots": { topic: "slots", section: "jackpots", compatiblePageTypes: ["slots"] },
  "slots-how-to-play": { topic: "slots", section: "how-to-play", compatiblePageTypes: ["slots"] },
  "slots-mobile-play": { topic: "slots", section: "mobile-play", compatiblePageTypes: ["slots"] },

  // These two legacy folders are account-oriented content. They are allowed
  // on the old application page as a migration compatibility, but remain
  // semantically login content rather than generic prose.
  "registration-help": { topic: "login", section: "registration", compatiblePageTypes: ["login", "application"] },

};

export function legacySemanticMetadata(component: string): LegacySemanticMetadata {
  return LEGACY_SEMANTICS[component] ?? {
    topic: component,
    section: component,
    compatiblePageTypes: [component],
  };
}

export function pageTypeTopic(pageType: PageType): string {
  return pageType.topic ?? pageType.id;
}

export function pageTypeMatchesSlug(pageType: PageType, slug: string): boolean {
  return pageType.id === slug || pageType.aliases?.includes(slug) === true;
}

export function entryMatchesSection(
  entry: { component: string; section?: string },
  section: string,
): boolean {
  return entry.section === section || entry.component === section;
}

export function isEntryCompatible(
  entry: { topic?: string; compatiblePageTypes?: string[]; component: string; legacy?: boolean },
  pageType: PageType,
): boolean {
  // Unknown/custom slugs intentionally retain the old minimal fallback: a
  // legacy intro is the only generic content allowed there. Recognized page
  // types never use this escape hatch.
  if (pageType.id === "_generic" && entry.legacy && entry.component === "intro") return true;

  const topic = pageTypeTopic(pageType);
  if (entry.topic === topic || entry.topic === pageType.id) return true;

  const compatible = entry.compatiblePageTypes ?? [];
  return compatible.includes(pageType.id) || compatible.includes(topic);
}

export function isExactTopicMatch(entry: { topic?: string }, pageType: PageType): boolean {
  const topic = pageTypeTopic(pageType);
  return entry.topic === topic || entry.topic === pageType.id;
}
