import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Casino } from "schema";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Hand-rolled rather than a crawl-based sitemap generator: we already know
// the exact page list from the assembled site, so this is deterministic
// and testable without a full Astro build.
export function buildSitemap(casinoLocales: Casino[], domain: string): string {
  const base = `https://${domain}`;
  const entries = casinoLocales.flatMap((casino) =>
    casino.pages.map((page) => ({
      loc: `${base}${page.seo.canonical ?? "/"}`,
      changefreq: page.slug === "index" ? "weekly" : "monthly",
      priority: page.slug === "index" ? "1.0" : "0.7",
    })),
  );

  const urls = entries
    .map(
      (entry) =>
        `  <url>\n` +
        `    <loc>${escapeXml(entry.loc)}</loc>\n` +
        `    <changefreq>${entry.changefreq}</changefreq>\n` +
        `    <priority>${entry.priority}</priority>\n` +
        `  </url>`,
    )
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );
}

// Disallows /go/* — the affiliate redirect path — which the old hand-rolled
// robots.txt.ts route didn't do; there's no reason for search engines to
// crawl or index outbound redirect links.
export function buildRobotsTxt(domain: string): string {
  return [`User-agent: *`, `Allow: /`, `Disallow: /go/`, ``, `Sitemap: https://${domain}/sitemap.xml`, ``].join(
    "\n",
  );
}

export async function writeSeoAssets(casinoLocales: Casino[], domain: string, outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "sitemap.xml"), buildSitemap(casinoLocales, domain), "utf-8");
  await writeFile(path.join(outputDir, "robots.txt"), buildRobotsTxt(domain), "utf-8");
}
