import { localizedLabel } from "content-library";
import type { SiteData } from "schema";
import { translate } from "./casino-v1-translations.js";
import { fitFragments, truncateAtWordBoundary, type SeoFragment } from "./seo-fit.js";
import { countryForTitle, localizedPlace } from "./seo-geo-names.js";
import { fillTemplate, seoDictionary, type SeoDictionary } from "./seo-translations.js";

// Every page of every site, on both templates, gets a title and a meta
// description built to one fixed contract:
//
//   title       <= 70 chars, names: brand, casino term, geo, bonus
//   description <= 170 chars, names: brand, casino term, geo, slots,
//                 payments, crypto
//
//   BetWest™ — Official Site | Online Casino for Canada | Up to CAD 500
//   BetWest: slots, live casino and fast payouts in CAD for players in
//   Canada. Check games, bonuses, limits, and licensing information
//   before you join.
//
// Both strings are always in the site's own language (seo-translations.ts
// for the fixed phrases, seo-geo-names.ts for the country names).
//
// Decisions this file implements deliberately:
//
//   - The formula applies to EVERY page, legal pages included.
//   - A page's own meta.title/meta.description (from a docx, or a
//     content-library legal entry's metaTitle) does NOT override it.
//     Neither of those knows the site's geo or its bonus, so honoring them
//     would exempt exactly the pages that carry them. The page's own title
//     is still used, but only as one candidate *page name* inside the
//     formula (see pageNameVariants).
//   - No two pages of a site may share a title, which is why every
//     non-home page leads with its page name (see buildPagesSeo).
//   - Never invent a fact: no bonus data means no bonus fragment, not a
//     fabricated offer. The one exception is crypto — see cryptoTerm.

export const TITLE_MAX_LENGTH = 70;
export const DESCRIPTION_MAX_LENGTH = 170;

const TITLE_JOINER = " | ";
const DESCRIPTION_JOINER = " ";
const NAME_BRAND_SEPARATOR = " — ";

// Page slugs whose localized name already exists in the template's own
// UI dictionary (casino-v1-translations.ts) — reused rather than
// re-translated here, so a page's SEO title and its nav/footer link can
// never drift apart. content-library's labels.ts is consulted first (it
// covers more locales for these same slugs); this is the second step of
// the chain, not a duplicate of it.
const PAGE_LABEL_KEYS: Record<string, string> = {
  login: "nav.login",
  registration: "nav.registration",
  application: "nav.signUp",
  withdrawal: "nav.withdrawal",
  review: "nav.review",
  bonus: "nav.bonus",
  "no-deposit-bonus": "nav.noDepositBonus",
  "free-spins": "nav.freeSpins",
  "promo-code": "nav.promoCodes",
  slots: "nav.slots",
  "responsible-gaming": "footer.responsibleGaming",
  "privacy-policy": "footer.privacyPolicy",
  "cookies-policy": "footer.cookiesPolicy",
  "betting-rules": "footer.bettingRules",
  "terms-conditions": "footer.termsConditions",
  contacts: "footer.contacts",
};

export type SeoPage = {
  slug: string;
  title: string;
};

export type SeoContext = {
  // config.navbar.brandName ?? data.json's brandName ?? the site slug —
  // resolved by the caller (assemble-site.ts) so this module never has to
  // know which file a name came from.
  brandName: string;
  locale: string;
  // ISO 3166-1 alpha-2, already resolved for this locale (schema's
  // resolveGeo). Undefined only when the site truly has nothing to go on.
  geo?: string;
  siteData?: SiteData;
};

export type PageSeoStrings = { title: string; description: string };

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// A docx site's page titles are free text and often carry the site's own
// suffix ("Casino App On Your Smartphone - BetWest"). Cutting at the first
// separator gives a usable shorter label for exactly those pages.
function shortenAtSeparator(value: string): string | undefined {
  const match = value.match(/\s[-–—|]\s|:\s?/u);
  if (!match || match.index === undefined || match.index < 3) return undefined;
  const head = value.slice(0, match.index).trim();
  return head.length > 0 && head.length < value.length ? head : undefined;
}

function unique(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

// The page's name in the site's own language, best candidate first.
//
//   1. the existing localized page-slug labels (content-library/labels.ts)
//   2. the nav/footer translation for that slug
//   3. the page's own title — docx sites have free-text slugs like
//      "casino-app-on-your-smartphone", and humanizing those gives a
//      worse, untranslated label than the real title does
//   4. for an unknown slug, the title cut at its first separator
//   5. a humanized slug, as the last thing that always exists
function pageNameVariants(page: SeoPage, ctx: SeoContext): string[] {
  const label = localizedLabel(ctx.locale, page.slug);
  const labelKey = PAGE_LABEL_KEYS[page.slug];
  const fromDictionary = labelKey ? translate(ctx.locale, labelKey) : undefined;
  const knownSlug = Boolean(label ?? fromDictionary);
  const ownTitle = page.title?.trim();

  return unique([
    label,
    fromDictionary,
    ownTitle,
    knownSlug ? undefined : ownTitle ? shortenAtSeparator(ownTitle) : undefined,
    humanizeSlug(page.slug),
  ]);
}

// "don't repeat the brand if the title already contains it" — a docx page
// titled "Bonus - BetWest" must not become "Bonus - BetWest — BetWest".
function withBrand(name: string, brand: string): string {
  return name.toLowerCase().includes(brand.toLowerCase()) ? name : `${name}${NAME_BRAND_SEPARATOR}${brand}`;
}

function formatAmount(locale: string, amount: number): string {
  try {
    return new Intl.NumberFormat(locale).format(amount);
  } catch {
    return String(amount);
  }
}

// Crypto is named in every description regardless of what paymentMethods
// actually lists — the one place the contract asserts something data.json
// does not say. Isolated in this single function precisely so it can be
// made data-driven later (return undefined when the site has no crypto
// rail) by editing one place instead of every sentence template.
function cryptoTerm(dictionary: SeoDictionary, _siteData: SiteData | undefined): string {
  return dictionary.crypto;
}

// The currency shown in the title's bonus fragment and the description's
// intro. welcomeBonus.currency first: it's the currency the offer is
// actually denominated in, which is what a player reads the number in.
function resolveCurrency(siteData: SiteData | undefined): string | undefined {
  return siteData?.welcomeBonus?.currency ?? siteData?.supportedCurrencies?.[0];
}

// [ brand+page ] | [ casino term + country ] | [ bonus ]
function titleFragments(page: SeoPage, ctx: SeoContext, dictionary: SeoDictionary, forceSlugName: boolean): SeoFragment[] {
  const brand = ctx.brandName;
  const isHome = page.slug === "index";
  const names = forceSlugName ? [humanizeSlug(page.slug)] : pageNameVariants(page, ctx);

  const identityVariants = isHome
    ? [`${brand}™${NAME_BRAND_SEPARATOR}${dictionary.officialSite}`, `${brand}${NAME_BRAND_SEPARATOR}${dictionary.officialSite}`, brand]
    : names.map((name) => withBrand(name, brand));

  const identity: SeoFragment = {
    id: "identity",
    required: true,
    variants: identityVariants,
    // Rather than let a long page label push the country out of the title,
    // the label itself shrinks into whatever room the other fragments
    // left. The brand is kept as long as anything can be: it is the one
    // thing every title must name.
    shrinkToFit: (remaining) => {
      if (isHome) return truncateAtWordBoundary(brand, remaining);
      const shortest = names[names.length - 1] ?? humanizeSlug(page.slug);
      const room = remaining - brand.length - NAME_BRAND_SEPARATOR.length;
      if (room >= 6) return `${truncateAtWordBoundary(shortest, room)}${NAME_BRAND_SEPARATOR}${brand}`;
      return truncateAtWordBoundary(brand, remaining);
    },
  };

  const country = ctx.geo ? countryForTitle(ctx.locale, ctx.geo) : undefined;
  const casinoGeo: SeoFragment = {
    id: "casino-geo",
    required: true,
    variants: country
      ? [
          `${dictionary.onlineCasino} ${country}`,
          `${dictionary.casinoShort} ${country}`,
          `${dictionary.onlineCasino} ${ctx.geo}`,
          `${dictionary.casinoShort} ${ctx.geo}`,
        ]
      : [dictionary.onlineCasino, dictionary.casinoShort],
  };

  // Never invented: with no welcomeBonus and no freeSpins there is simply
  // no third fragment, rather than a made-up offer.
  const welcomeBonus = ctx.siteData?.welcomeBonus;
  const spins = ctx.siteData?.freeSpins?.count;
  const bonusVariants: string[] = [];
  if (welcomeBonus) {
    const amount = `${welcomeBonus.currency} ${formatAmount(ctx.locale, welcomeBonus.amount)}`;
    if (spins) bonusVariants.push(`${dictionary.upTo} ${amount} + ${spins} ${dictionary.freeSpins}`);
    bonusVariants.push(`${dictionary.upTo} ${amount}`, amount);
  } else if (spins) {
    bonusVariants.push(`${spins} ${dictionary.freeSpins}`);
  }

  const fragments = [identity, casinoGeo];
  if (bonusVariants.length > 0) fragments.push({ id: "bonus", required: false, variants: bonusVariants });
  return fragments;
}

// [ brand + slots + live casino + geo + currency ] [ payments+crypto ] [ advice ]
function descriptionFragments(ctx: SeoContext, dictionary: SeoDictionary): SeoFragment[] {
  const place = ctx.geo ? localizedPlace(ctx.locale, ctx.geo) : undefined;
  // An inflected locative goes inside the sentence ("for players in der
  // Schweiz" / "Suomessa pelaaville"); a market with no entry in its
  // language's case table gets the plain trailing sentence instead of a
  // guessed ending.
  const geoSlot = place?.inflected ? fillTemplate(dictionary.geoPhrase, { place: place.text }) : "";
  const geoTail = place && !place.inflected ? fillTemplate(dictionary.geoPlain, { country: place.text }) : "";

  const currency = resolveCurrency(ctx.siteData);
  const templates = currency
    ? [dictionary.introFull, dictionary.introNoCurrency, dictionary.introShort]
    : [dictionary.introNoCurrency, dictionary.introShort];
  const introVariants = templates.map((template) => {
    const sentence = fillTemplate(template, { brand: ctx.brandName, currency: currency ?? "", geo: geoSlot });
    return geoTail ? `${sentence} ${geoTail}` : sentence;
  });

  const intro: SeoFragment = {
    id: "intro",
    required: true,
    variants: introVariants,
    shrinkToFit: (remaining) => truncateAtWordBoundary(introVariants[introVariants.length - 1], remaining),
  };

  const crypto = cryptoTerm(dictionary, ctx.siteData);
  const methods = ctx.siteData?.paymentMethods ?? [];
  const paymentVariants: string[] = [];
  for (let count = Math.min(3, methods.length); count >= 1; count--) {
    paymentVariants.push(fillTemplate(dictionary.payments, { methods: methods.slice(0, count).join(", "), crypto }));
  }
  // The generic wording is the floor, not the default: real method names
  // are only given up once the budget genuinely cannot hold them.
  paymentVariants.push(dictionary.paymentsGeneric);

  return [
    intro,
    { id: "payments", required: false, variants: paymentVariants },
    { id: "advice", required: false, variants: [dictionary.advice, dictionary.adviceShort] },
  ];
}

export function buildPageSeoStrings(
  page: SeoPage,
  ctx: SeoContext,
  options: { forceSlugName?: boolean } = {},
): PageSeoStrings {
  const dictionary = seoDictionary(ctx.locale);
  return {
    title: fitFragments(titleFragments(page, ctx, dictionary, options.forceSlugName ?? false), TITLE_MAX_LENGTH, TITLE_JOINER),
    description: fitFragments(descriptionFragments(ctx, dictionary), DESCRIPTION_MAX_LENGTH, DESCRIPTION_JOINER),
  };
}

// Builds every page's strings at once, because one of the contract's rules
// is site-wide rather than per-page: no two pages may share a title.
// Leading with the page name normally guarantees that on its own; the two
// fallbacks below only ever fire when two different slugs resolved to the
// same localized name, or when the budget crushed the difference away.
export function buildPagesSeo(pages: SeoPage[], ctx: SeoContext): Map<string, PageSeoStrings> {
  const result = new Map<string, PageSeoStrings>();
  const taken = new Set<string>();

  for (const page of pages) {
    let strings = buildPageSeoStrings(page, ctx);
    if (taken.has(strings.title)) {
      strings = buildPageSeoStrings(page, ctx, { forceSlugName: true });
    }
    if (taken.has(strings.title)) {
      // The slug is the only per-page value a site guarantees to be
      // unique, and it goes in front so truncation cannot eat it.
      strings = { ...strings, title: truncateAtWordBoundary(`${humanizeSlug(page.slug)}: ${strings.title}`, TITLE_MAX_LENGTH) };
    }
    taken.add(strings.title);
    result.set(page.slug, strings);
  }

  return result;
}
