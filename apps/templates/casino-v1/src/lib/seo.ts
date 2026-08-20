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
  const faqSection = page.sections.find((section) => section.type === "faq");
  const casinoName = casino.name || casino.footer.casinoName || casino.slug;

  const graph: Array<Record<string, unknown>> = [
    {
      "@type": "WebPage",
      "@id": canonical ? `${canonical}#webpage` : undefined,
      url: canonical,
      name: page.seo.title,
      description: page.seo.description,
      isPartOf: {
        "@type": "WebSite",
        name: casinoName,
        url: site?.toString(),
      },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: absoluteUrl("/", site),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: casinoName,
          item: absoluteUrl(getPagePath(casino, "index"), site),
        },
        {
          "@type": "ListItem",
          position: 3,
          name: page.title,
          item: canonical,
        },
      ],
    },
    {
      "@type": "Organization",
      name: casinoName,
      url: canonical,
      logo: absoluteUrl(casino.navbar.logo, site),
    },
  ];

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
