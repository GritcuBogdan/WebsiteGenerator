import type { ParsedDocxContent, SiteConfig } from "schema";

// Shared fixtures for this package's tests only (not itself a *.test.ts,
// so the test runner skips it).

export function sampleConfig(): SiteConfig {
  return {
    slug: "sample-casino",
    domains: ["sample-casino.example"],
    affiliateUrl: "https://affiliate.example/track?id=sample-casino",
    template: "casino-v1",
    locales: [
      { code: "en", docx: "casino.en.docx", default: true },
      { code: "el", docx: "casino.el.docx" },
    ],
    theme: { primary: "#111111", secondary: "#222222" },
    navbar: { logo: "/images/sample-casino/logo.png", brandName: "Sample Casino" },
    banner: { desktop: "/images/sample-casino/banner.png" },
    favicon: "/images/sample-casino/favicon.ico",
  };
}

export function sampleParsedContent(locale = "en"): ParsedDocxContent {
  return {
    locale,
    pages: [
      {
        slug: "index",
        title: "Sample Casino",
        navLabel: "Home",
        meta: { h1: "Sample Casino" },
        sections: [
          {
            type: "intro",
            id: "intro",
            title: "Sample Casino",
            paragraphs: ["Welcome to Sample Casino."],
            bannerText: "Get $500 today!",
          },
          {
            type: "faq",
            id: "faq-1",
            title: "FAQ",
            items: [{ question: "Is this safe?", answer: "Yes." }],
          },
        ],
      },
      {
        slug: "bonus",
        title: "Bonus",
        navLabel: "Bonus",
        meta: {},
        sections: [{ type: "text", id: "details", title: "Bonus Details", paragraphs: ["Details here."] }],
      },
      {
        slug: "login",
        title: "Login",
        navLabel: "Login",
        meta: {},
        sections: [{ type: "text", id: "how-to-login", title: "How to Login", paragraphs: ["Steps here."] }],
      },
      {
        slug: "privacy-policy",
        title: "Privacy Policy",
        navLabel: "Privacy Policy",
        meta: {},
        sections: [{ type: "text", id: "privacy", title: "Privacy", paragraphs: ["Our policy."] }],
      },
    ],
  };
}
