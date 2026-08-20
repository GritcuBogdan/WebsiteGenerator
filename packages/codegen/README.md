# codegen

Turns one site's parsed (and possibly overridden) docx content plus its
`config.json` branding into the generated artifacts a template actually
builds from:

- **assemble-site** — combines one locale's `ParsedDocxContent` with
  `SiteConfig` (theme, logo, banner image, footer boilerplate — everything
  a docx can't supply) into a full, schema-valid `Casino`. One call = one
  locale.
- **validate-site** — the hard gate before anything is written or deployed:
  full schema validation plus invariants a schema alone can't express
  (unique page slugs, nav/footer links that resolve to a real page, and —
  when an `imagesDir` is given — that every referenced image actually
  exists on disk).
- **generate-content** — writes `.generated/content/site.ts`: every
  locale's `Casino`, plus the language-switcher metadata and default-locale
  marker a template needs but no single `Casino` object carries. Fully
  disposable — this *is* how regenerating a site works, there's no separate
  code path.
- **generate-seo-assets** — hand-rolled `sitemap.xml`/`robots.txt` (not a
  crawl-based generator) written straight into `.generated/public`, since
  the exact page list is already known from the assembled site.

## Known gaps (by design, not oversight)

`assembleSite` only produces the four section types a docx can actually
produce (`intro`, `text`, `content`, `faq`); it treats every page's banner
identically (`config.banner.desktop`/`mobile`, one CTA button). Per-page
banners, forced login/registration/slots sections, and a slots grid sourced
from `images/slots/*` are all casino-v1-specific and live in
`casino-v1-rules.ts` instead (only runs when `config.template ===
"casino-v1"`) — see that file's own comments, and
`packages/overrides/README.md`'s "Per-page banner" section for how to
customize a given page's banner image/headline/button label by hand.

## Usage

```ts
import { assembleSite, validateSite, buildLanguageOptions, resolveDefaultLocale } from "codegen";
import { writeSiteContent, writeSeoAssets } from "codegen";

const casino = assembleSite(parsedContent, config); // one locale
validateSite(casino, { imagesDir: "sites/golisimo/.generated/public/images" });

await writeSiteContent(
  [casinoEn, casinoEl],
  buildLanguageOptions(config),
  resolveDefaultLocale(config),
  "sites/golisimo/.generated/content/site.ts",
);
await writeSeoAssets([casinoEn, casinoEl], config.domains[0], "sites/golisimo/.generated/public");
```
