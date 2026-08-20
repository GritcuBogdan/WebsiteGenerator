import type { Casino } from "schema";
import { siteLocales, languageOptions, defaultLocale } from "virtual:site";

export { languageOptions, defaultLocale };

// Replaces the old CASINO env var + allCasinos aggregation: SITE_DIR
// already scopes a build to exactly one site's generated content, so
// there's no multi-site filtering left to do here — siteLocales *is* the
// build.
export function getBuildCasinos(): Casino[] {
  return siteLocales;
}

export function getCasinoLocales(slug: string): Casino[] {
  return siteLocales.filter((casino) => casino.slug === slug);
}

export function getSingleCasinoForLocale(
  locale: string,
  { required = false }: { required?: boolean } = {},
): Casino | undefined {
  const match = siteLocales.find((casino) => (casino.locale ?? defaultLocale) === locale);

  if (!match && required) {
    const available = siteLocales.map((casino) => casino.locale ?? defaultLocale).join(", ");
    throw new Error(`No generated content for locale "${locale}". Available: ${available}`);
  }

  return match;
}

// assemble-site already computes each page's correct, locale-prefixed
// canonical path (packages/codegen/src/assemble-site.ts's pagePath()), so
// this is just a lookup rather than a formula to keep in sync in two
// places.
export function getPagePath(casino: Casino, pageSlug: string): string {
  const page = casino.pages.find((candidate) => candidate.slug === pageSlug);
  if (page?.seo.canonical) return page.seo.canonical;
  return pageSlug === "index" ? "/" : `/${pageSlug}/`;
}

export function getAlternateLinks(casino: Casino, pageSlug: string): Array<{ lang: string; href: string }> {
  return getCasinoLocales(casino.slug)
    .map((variant) => {
      const page = variant.pages.find((candidate) => candidate.slug === pageSlug);
      if (!page) return null;

      return {
        lang: variant.locale ?? page.seo.lang ?? defaultLocale,
        href: getPagePath(variant, page.slug),
      };
    })
    .filter((link): link is { lang: string; href: string } => link !== null);
}
