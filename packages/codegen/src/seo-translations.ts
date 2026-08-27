// Fixed phrases for the SEO title/description contract, one dictionary per
// language — the same maintenance pattern (and the same fallback posture)
// as casino-v1-translations.ts: exact locale code first, then the bare
// language subtag, then English. An unknown locale renders English rather
// than failing the build.
//
// This is deliberately a separate dictionary from casino-v1-translations.ts
// even though both are "UI strings per language": that one is template
// chrome (nav labels, form fields, the age gate), this one is search-result
// copy with a hard character budget. They shrink for different reasons and
// are edited by different people.
//
// Country names are NOT here — they come from Intl.DisplayNames plus the
// per-language grammar tables in seo-geo-names.ts. {place} below is that
// module's already-inflected locative ("in der Schweiz", "Suomessa"), and
// {country} is the plain nominative used by the geoPlain fallback sentence.

export type SeoDictionary = {
  // --- title fragments ---
  officialSite: string;
  onlineCasino: string;
  // Shorter casino term for when the full one does not fit.
  casinoShort: string;
  upTo: string;
  freeSpins: string;
  bonus: string;

  // --- description fragments ---
  // {brand} {currency} {geo}; {geo} is the geoPhrase below, already filled.
  introFull: string;
  introNoCurrency: string;
  introShort: string;
  // {place} — the inflected locative from seo-geo-names.ts.
  geoPhrase: string;
  // Used when only a nominative country name could be established (a market
  // missing from that language's case table). A separate sentence with the
  // bare noun, rather than a guessed inflection dropped into geoPhrase:
  // wrong grammar in a player's own language reads worse than plain wording.
  geoPlain: string;
  // {methods} {crypto}
  payments: string;
  paymentsGeneric: string;
  crypto: string;
  advice: string;
  adviceShort: string;
};

const en: SeoDictionary = {
  officialSite: "Official Site",
  onlineCasino: "Online Casino",
  casinoShort: "Casino",
  upTo: "Up to",
  freeSpins: "Free Spins",
  bonus: "Bonus",
  introFull: "{brand}: slots, live casino and fast payouts in {currency} {geo}.",
  introNoCurrency: "{brand}: slots, live casino and fast payouts {geo}.",
  introShort: "{brand}: slots and live casino {geo}.",
  geoPhrase: "for players {place}",
  geoPlain: "Target market: {country}.",
  payments: "Pay by {methods} or {crypto}.",
  paymentsGeneric: "Cards, e-wallets and crypto.",
  crypto: "crypto",
  advice: "Check games, bonuses, limits, and licensing information before you join.",
  adviceShort: "Check bonuses, limits and licensing before you join.",
};

const de: SeoDictionary = {
  officialSite: "Offizielle Seite",
  onlineCasino: "Online Casino",
  casinoShort: "Casino",
  upTo: "Bis zu",
  freeSpins: "Freispiele",
  bonus: "Bonus",
  introFull: "{brand}: Slots, Live Casino und schnelle Auszahlungen in {currency} {geo}.",
  introNoCurrency: "{brand}: Slots, Live Casino und schnelle Auszahlungen {geo}.",
  introShort: "{brand}: Slots und Live Casino {geo}.",
  geoPhrase: "für Spieler {place}",
  geoPlain: "Zielmarkt: {country}.",
  payments: "Zahlung per {methods} oder {crypto}.",
  paymentsGeneric: "Karten, E-Wallets und Krypto.",
  crypto: "Krypto",
  advice: "Prüfe Spiele, Boni, Limits und Lizenzinformationen, bevor du dich anmeldest.",
  adviceShort: "Prüfe Boni, Limits und Lizenz vor der Anmeldung.",
};

const nl: SeoDictionary = {
  officialSite: "Officiële site",
  onlineCasino: "Online Casino",
  casinoShort: "Casino",
  upTo: "Tot",
  freeSpins: "Gratis spins",
  bonus: "Bonus",
  introFull: "{brand}: slots, live casino en snelle uitbetalingen in {currency} {geo}.",
  introNoCurrency: "{brand}: slots, live casino en snelle uitbetalingen {geo}.",
  introShort: "{brand}: slots en live casino {geo}.",
  geoPhrase: "voor spelers {place}",
  geoPlain: "Doelmarkt: {country}.",
  payments: "Betaal met {methods} of {crypto}.",
  paymentsGeneric: "Kaarten, e-wallets en crypto.",
  crypto: "crypto",
  advice: "Bekijk games, bonussen, limieten en licentie-informatie voordat je meedoet.",
  adviceShort: "Bekijk bonussen, limieten en licentie voordat je meedoet.",
};

const fi: SeoDictionary = {
  officialSite: "Virallinen sivusto",
  onlineCasino: "Nettikasino",
  casinoShort: "Kasino",
  upTo: "Jopa",
  freeSpins: "ilmaiskierrosta",
  bonus: "Bonus",
  introFull: "{brand}: kolikkopelit, livekasino ja nopeat kotiutukset {currency}-valuutassa {geo}.",
  introNoCurrency: "{brand}: kolikkopelit, livekasino ja nopeat kotiutukset {geo}.",
  introShort: "{brand}: kolikkopelit ja livekasino {geo}.",
  geoPhrase: "{place} pelaaville",
  geoPlain: "Kohdemaa: {country}.",
  payments: "Maksutavat: {methods} ja {crypto}.",
  paymentsGeneric: "Kortit, verkkolompakot ja krypto.",
  crypto: "krypto",
  advice: "Tarkista pelit, bonukset, rajat ja lisenssitiedot ennen liittymistä.",
  adviceShort: "Tarkista bonukset, rajat ja lisenssi ennen liittymistä.",
};

const sv: SeoDictionary = {
  officialSite: "Officiell sida",
  onlineCasino: "Onlinecasino",
  casinoShort: "Casino",
  upTo: "Upp till",
  freeSpins: "free spins",
  bonus: "Bonus",
  introFull: "{brand}: slots, live casino och snabba uttag i {currency} {geo}.",
  introNoCurrency: "{brand}: slots, live casino och snabba uttag {geo}.",
  introShort: "{brand}: slots och live casino {geo}.",
  geoPhrase: "för spelare {place}",
  geoPlain: "Målmarknad: {country}.",
  payments: "Betala med {methods} eller {crypto}.",
  paymentsGeneric: "Kort, e-plånböcker och krypto.",
  crypto: "krypto",
  advice: "Kolla spel, bonusar, gränser och licensinformation innan du går med.",
  adviceShort: "Kolla bonusar, gränser och licens innan du går med.",
};

const no: SeoDictionary = {
  officialSite: "Offisiell side",
  onlineCasino: "Nettcasino",
  casinoShort: "Casino",
  upTo: "Opptil",
  freeSpins: "gratisspinn",
  bonus: "Bonus",
  introFull: "{brand}: spilleautomater, live casino og raske uttak i {currency} {geo}.",
  introNoCurrency: "{brand}: spilleautomater, live casino og raske uttak {geo}.",
  introShort: "{brand}: spilleautomater og live casino {geo}.",
  geoPhrase: "for spillere {place}",
  geoPlain: "Målmarked: {country}.",
  payments: "Betal med {methods} eller {crypto}.",
  paymentsGeneric: "Kort, e-lommebøker og krypto.",
  crypto: "krypto",
  advice: "Sjekk spill, bonuser, grenser og lisensinformasjon før du blir med.",
  adviceShort: "Sjekk bonuser, grenser og lisens før du blir med.",
};

const el: SeoDictionary = {
  officialSite: "Επίσημη σελίδα",
  onlineCasino: "Online Καζίνο",
  casinoShort: "Καζίνο",
  upTo: "Έως",
  freeSpins: "δωρεάν περιστροφές",
  bonus: "Μπόνους",
  introFull: "{brand}: φρουτάκια, live καζίνο και γρήγορες αναλήψεις σε {currency} {geo}.",
  introNoCurrency: "{brand}: φρουτάκια, live καζίνο και γρήγορες αναλήψεις {geo}.",
  introShort: "{brand}: φρουτάκια και live καζίνο {geo}.",
  geoPhrase: "για παίκτες {place}",
  geoPlain: "Αγορά-στόχος: {country}.",
  payments: "Πληρωμές με {methods} ή {crypto}.",
  paymentsGeneric: "Κάρτες, e-wallets και crypto.",
  crypto: "crypto",
  advice: "Δες παιχνίδια, μπόνους, όρια και πληροφορίες αδειοδότησης πριν εγγραφείς.",
  adviceShort: "Δες μπόνους, όρια και άδεια πριν εγγραφείς.",
};

// Estonian and Hungarian have no casino-v1-translations.ts entry yet (no
// site targets them), but they are exactly the languages whose grammar
// tables in seo-geo-names.ts exist — a dictionary here is what makes those
// tables reachable, and what makes an et/hu site's first build produce
// native SEO copy instead of English.
const et: SeoDictionary = {
  officialSite: "Ametlik veebisait",
  onlineCasino: "Online kasiino",
  casinoShort: "Kasiino",
  upTo: "Kuni",
  freeSpins: "tasuta spinni",
  bonus: "Boonus",
  introFull: "{brand}: mänguautomaadid, live-kasiino ja kiired väljamaksed valuutas {currency} {geo}.",
  introNoCurrency: "{brand}: mänguautomaadid, live-kasiino ja kiired väljamaksed {geo}.",
  introShort: "{brand}: mänguautomaadid ja live-kasiino {geo}.",
  geoPhrase: "{place} mängijatele",
  geoPlain: "Sihtturg: {country}.",
  payments: "Maksa {methods} või {crypto}.",
  paymentsGeneric: "Kaardid, e-rahakotid ja krüpto.",
  crypto: "krüpto",
  advice: "Vaata mänge, boonuseid, limiite ja litsentsiteavet enne liitumist.",
  adviceShort: "Vaata boonuseid, limiite ja litsentsi enne liitumist.",
};

const hu: SeoDictionary = {
  officialSite: "Hivatalos oldal",
  onlineCasino: "Online kaszinó",
  casinoShort: "Kaszinó",
  upTo: "Akár",
  freeSpins: "ingyenes pörgetés",
  bonus: "Bónusz",
  introFull: "{brand}: nyerőgépek, élő kaszinó és gyors kifizetések {currency} pénznemben {geo}.",
  introNoCurrency: "{brand}: nyerőgépek, élő kaszinó és gyors kifizetések {geo}.",
  introShort: "{brand}: nyerőgépek és élő kaszinó {geo}.",
  geoPhrase: "{place} játszóknak",
  geoPlain: "Célpiac: {country}.",
  payments: "Fizetés: {methods} vagy {crypto}.",
  paymentsGeneric: "Kártyák, e-pénztárcák és kripto.",
  crypto: "kripto",
  advice: "Nézd meg a játékokat, bónuszokat, limiteket és a licencinformációt csatlakozás előtt.",
  adviceShort: "Nézd meg a bónuszokat, limiteket és a licencet csatlakozás előtt.",
};

const dictionaries: Record<string, SeoDictionary> = { en, de, nl, fi, sv, no, el, et, hu };

export function seoDictionary(locale: string): SeoDictionary {
  const languageSubtag = locale.split("-")[0];
  return dictionaries[locale] ?? dictionaries[languageSubtag] ?? en;
}

// Fills {placeholders} and then repairs the spacing an empty placeholder
// leaves behind — a sentence whose {geo} slot is empty (no market could be
// established) must still read as a sentence, not as "payouts  ." with a
// hole in it.
export function fillTemplate(template: string, values: Record<string, string>): string {
  const filled = template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
  return filled
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}
