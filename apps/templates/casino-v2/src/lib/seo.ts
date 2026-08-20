import type { Casino, CasinoPage } from "schema";
import { getPagePath } from "./site";

function absoluteUrl(path: string | undefined, site?: URL) {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return site ? new URL(path, site).toString() : path;
}

export function buildCasinoJsonLd(casino: Casino, page: CasinoPage, site?: URL) {
  const canonical = absoluteUrl(
    page.seo.canonical ?? getPagePath(casino, page.slug),
    site,
  );
  const homeUrl = absoluteUrl(getPagePath(casino, "index"), site);
  const faqSection = page.sections.find((section) => section.type === "faq");
  const casinoName = casino.name || casino.footer.casinoName || casino.slug;
  const isHome = page.slug === "index";

  // Stable per-site ids (not per-page) so every page's JSON-LD describes
  // the *same* Organization/WebSite entity rather than minting a fresh
  // anonymous one each time - search engines otherwise have no way to tell
  // "Organization on /bonus/" and "Organization on /review/" are the same
  // business, which weakens rather than reinforces the entity association.
  const siteRoot = site?.toString();
  const organizationId = siteRoot ? `${siteRoot}#organization` : undefined;
  const websiteId = siteRoot ? `${siteRoot}#website` : undefined;

  const graph: Array<Record<string, unknown>> = [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: casinoName,
      // The organization's own URL is always the site root, independent of
      // which page happens to be rendering this JSON-LD - it was
      // previously set to the current page's canonical, which made the
      // "same" entity claim a different URL on every page.
      url: homeUrl,
      logo: absoluteUrl(casino.navbar.logo, site),
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      name: casinoName,
      url: homeUrl,
      publisher: organizationId ? { "@id": organizationId } : undefined,
    },
    {
      "@type": "WebPage",
      "@id": canonical ? `${canonical}#webpage` : undefined,
      url: canonical,
      name: page.seo.title,
      description: page.seo.description,
      isPartOf: websiteId ? { "@id": websiteId } : undefined,
      about: organizationId ? { "@id": organizationId } : undefined,
    },
  ];

  // A breadcrumb trail on the home page itself is meaningless (every item
  // would resolve to the same URL - a validation error, not just clutter),
  // and this site has no category depth beyond "home -> page", so the
  // trail is always exactly two levels, never a redundant middle node
  // repeating the brand name over the same home URL.
  if (!isHome) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: homeUrl,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: page.title,
          item: canonical,
        },
      ],
    });
  }

  if (faqSection?.type === "faq" && faqSection.items.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faqSection.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
