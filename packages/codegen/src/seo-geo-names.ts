// Country names for the SEO title/description contract (build-page-seo.ts),
// in the site's own language.
//
// The base names come from Intl.DisplayNames — full ICU is built into the
// Node version this repo requires (>= 22.12), so there is no country table
// to maintain and no locale/country pair that silently renders an English
// name inside a Finnish sentence.
//
// What Intl cannot do is grammar. It only ever returns the NOMINATIVE
// ("Schweiz", "Suomi", "Ελβετία"). A title can use that as-is in most
// languages, but a description says "for players in X", which inflects:
//
//   - Finnish/Estonian/Hungarian inflect the noun itself
//     (Suomi -> Suomessa, Eesti -> Eestis, Magyarország -> Magyarországon)
//   - German/Dutch/Greek need an article Intl never supplies
//     (in der Schweiz, in de Verenigde Staten, στην Ελβετία)
//
// So each case-marking language gets one small hand-written table below,
// and a market missing from its table falls back to a plainer construction
// ("kohdemaa: Suomi") rather than a guessed inflection — wrong grammar in a
// player's own language reads worse than plain wording does.

// CLDR answers for these with a placeholder string ("Unknown Region",
// "Pseudo-Accents") rather than failing, even with fallback: "none" — they
// are real CLDR regions, just not real markets. Excluded explicitly so a
// typo'd or synthetic code can never reach a page as a country name.
const PLACEHOLDER_REGIONS = new Set(["ZZ", "XA", "XB", "XX", "QO", "QQ"]);

// The nominative country name in `locale`'s language, or undefined when
// the code is not a usable market name (placeholder region, or a locale
// this ICU build has no name for — fallback: "none" returns undefined
// rather than echoing the code back).
export function countryName(locale: string, geo: string): string | undefined {
  if (!/^[A-Z]{2}$/.test(geo) || PLACEHOLDER_REGIONS.has(geo)) return undefined;
  try {
    const name = new Intl.DisplayNames([locale, "en"], { type: "region", fallback: "none" }).of(geo);
    // A name identical to the code itself is ICU telling us it has nothing
    // better; that reads as a typo on a page, not as a country.
    return name && name !== geo ? name : undefined;
  } catch {
    return undefined;
  }
}

// English is the one language whose *title* wants a preposition rather than
// the bare nominative ("Online Casino for Canada", not "Online Casino
// Canada"), and a handful of English country names additionally want "the"
// ("for the Netherlands"). Every other language uses the nominative as-is
// in a title: "Online Casino Schweiz", "Nettikasino Suomi".
const ENGLISH_DEFINITE_ARTICLE_REGIONS = new Set([
  "NL", "GB", "US", "PH", "AE", "BS", "DO", "MV", "KY", "VI", "CD", "CG", "CZ", "VA", "GM", "SD", "CF", "NE",
]);

export function countryForTitle(locale: string, geo: string): string | undefined {
  const name = countryName(locale, geo);
  if (!name) return undefined;
  if (locale.split("-")[0] !== "en") return name;
  return ENGLISH_DEFINITE_ARTICLE_REGIONS.has(geo) ? `for the ${name}` : `for ${name}`;
}

// --- locative ("in X") forms, per case-marking language ---------------
//
// Keyed by ISO 3166-1 alpha-2. Only markets these languages' sites
// plausibly target are listed: an unlisted market falls back to the
// plainer construction rather than to a guess (see localizedPlace).

// German: "in {country}" is correct for the large majority of country
// names (in Deutschland, in Kanada, in Frankreich) — only the ones whose
// German name carries a definite article need an entry here.
const DE_PLACES: Record<string, string> = {
  CH: "in der Schweiz",
  NL: "in den Niederlanden",
  US: "in den USA",
  GB: "im Vereinigten Königreich",
  TR: "in der Türkei",
  SK: "in der Slowakei",
  CZ: "in Tschechien",
  UA: "in der Ukraine",
  PH: "auf den Philippinen",
  DO: "in der Dominikanischen Republik",
  MN: "in der Mongolei",
  AE: "in den Vereinigten Arabischen Emiraten",
};

// Dutch: same shape — "in {country}" by default, article/preposition
// exceptions listed.
const NL_PLACES: Record<string, string> = {
  US: "in de Verenigde Staten",
  GB: "in het Verenigd Koninkrijk",
  CH: "in Zwitserland",
  PH: "op de Filipijnen",
  AE: "in de Verenigde Arabische Emiraten",
  TR: "in Turkije",
  SK: "in Slowakije",
  UA: "in Oekraïne",
};

// Greek: "σε" contracts with the article, and the article is gendered, so
// there is no safe default at all — an unlisted market takes the plain
// construction instead of a guessed contraction.
const EL_PLACES: Record<string, string> = {
  GR: "στην Ελλάδα",
  CY: "στην Κύπρο",
  CH: "στην Ελβετία",
  DE: "στη Γερμανία",
  NL: "στις Κάτω Χώρες",
  GB: "στο Ηνωμένο Βασίλειο",
  US: "στις ΗΠΑ",
  CA: "στον Καναδά",
  AT: "στην Αυστρία",
  SE: "στη Σουηδία",
  FI: "στη Φινλανδία",
  NO: "στη Νορβηγία",
  EE: "στην Εσθονία",
  HU: "στην Ουγγαρία",
  IE: "στην Ιρλανδία",
  IT: "στην Ιταλία",
  ES: "στην Ισπανία",
  PT: "στην Πορτογαλία",
  FR: "στη Γαλλία",
  BE: "στο Βέλγιο",
  DK: "στη Δανία",
  PL: "στην Πολωνία",
  AU: "στην Αυστραλία",
  NZ: "στη Νέα Ζηλανδία",
};

// Finnish inflects the country noun itself (inessive/adessive), so there
// is nothing to prepend and no default rule that is safe across names.
const FI_PLACES: Record<string, string> = {
  FI: "Suomessa",
  SE: "Ruotsissa",
  NO: "Norjassa",
  DK: "Tanskassa",
  EE: "Virossa",
  DE: "Saksassa",
  AT: "Itävallassa",
  CH: "Sveitsissä",
  NL: "Alankomaissa",
  BE: "Belgiassa",
  GB: "Isossa-Britanniassa",
  IE: "Irlannissa",
  US: "Yhdysvalloissa",
  CA: "Kanadassa",
  AU: "Australiassa",
  NZ: "Uudessa-Seelannissa",
  ES: "Espanjassa",
  IT: "Italiassa",
  FR: "Ranskassa",
  PT: "Portugalissa",
  PL: "Puolassa",
  GR: "Kreikassa",
  HU: "Unkarissa",
  CZ: "Tšekissä",
  LV: "Latviassa",
  LT: "Liettuassa",
  IS: "Islannissa",
  MT: "Maltalla",
  CY: "Kyproksella",
};

// Estonian: same principle (Eesti -> Eestis).
const ET_PLACES: Record<string, string> = {
  EE: "Eestis",
  LV: "Lätis",
  LT: "Leedus",
  FI: "Soomes",
  SE: "Rootsis",
  NO: "Norras",
  DK: "Taanis",
  DE: "Saksamaal",
  AT: "Austrias",
  CH: "Šveitsis",
  NL: "Madalmaades",
  BE: "Belgias",
  GB: "Ühendkuningriigis",
  IE: "Iirimaal",
  US: "Ameerika Ühendriikides",
  CA: "Kanadas",
  PL: "Poolas",
  GR: "Kreekas",
  HU: "Ungaris",
  CZ: "Tšehhis",
  ES: "Hispaanias",
  IT: "Itaalias",
  FR: "Prantsusmaal",
};

// Hungarian: superessive vs. inessive depends on the country name
// (Magyarországon vs. Németországban), which is exactly why this is a
// table and not a rule.
const HU_PLACES: Record<string, string> = {
  HU: "Magyarországon",
  AT: "Ausztriában",
  DE: "Németországban",
  CH: "Svájcban",
  SK: "Szlovákiában",
  RO: "Romániában",
  CZ: "Csehországban",
  PL: "Lengyelországban",
  NL: "Hollandiában",
  BE: "Belgiumban",
  GB: "az Egyesült Királyságban",
  US: "az Egyesült Államokban",
  CA: "Kanadában",
  SE: "Svédországban",
  FI: "Finnországban",
  NO: "Norvégiában",
  DK: "Dániában",
  EE: "Észtországban",
  GR: "Görögországban",
  ES: "Spanyolországban",
  IT: "Olaszországban",
  FR: "Franciaországban",
};

type PlaceRule = {
  table: Record<string, string>;
  // Applied to the Intl nominative for a market the table doesn't list.
  // Undefined where no default is safe (Greek's gendered contraction, and
  // every language that inflects the noun itself) — those fall back to the
  // dictionary's plain construction instead.
  fallbackTemplate?: string;
};

const PLACE_RULES: Record<string, PlaceRule> = {
  en: { table: {}, fallbackTemplate: "in {country}" },
  de: { table: DE_PLACES, fallbackTemplate: "in {country}" },
  nl: { table: NL_PLACES, fallbackTemplate: "in {country}" },
  sv: { table: {}, fallbackTemplate: "i {country}" },
  no: { table: {}, fallbackTemplate: "i {country}" },
  el: { table: EL_PLACES },
  fi: { table: FI_PLACES },
  et: { table: ET_PLACES },
  hu: { table: HU_PLACES },
};

export type LocalizedPlace = {
  text: string;
  // False when this is the plain "target market: Finland" wording rather
  // than a real locative — build-page-seo.ts uses a sentence template that
  // reads correctly with a bare noun in that case.
  inflected: boolean;
};

// The "in <country>" half of "for players in <country>", already carrying
// whatever article or case ending the language needs. Returns
// inflected: false when only the nominative could be established, so the
// caller can switch to plainer wording instead of dropping a bare
// nominative into a slot that grammatically demands a case form.
export function localizedPlace(locale: string, geo: string): LocalizedPlace | undefined {
  const name = countryName(locale, geo);
  if (!name) return undefined;

  const rule = PLACE_RULES[locale] ?? PLACE_RULES[locale.split("-")[0]] ?? PLACE_RULES.en;
  const fromTable = rule.table[geo];
  if (fromTable) return { text: fromTable, inflected: true };
  if (rule.fallbackTemplate) return { text: rule.fallbackTemplate.replace("{country}", name), inflected: true };
  return { text: name, inflected: false };
}
