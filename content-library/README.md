# Content library

The library is selected by page intent. Presentation components remain in the
Astro templates; Markdown entries describe semantic content.

## New entry layout

New content should use:

```text
content-library/<locale>/<page>/<component>/<variant>.md
```

For example:

```text
en-US/slots/rtp/slots-rtp-001.md
en-US/login/forgot-password/login-forgot-password-001.md
```

The directory supplies the page scope, component, locale, and variant. Internally
the page folder becomes the entry's `topic`; frontmatter may add
`requires`, `question` (for FAQ entries), and `compatibleWith` when a block is
intentionally valid for another page type:

```yaml
---
id: mobile-slots-001
compatibleWith: [slots]
---
```

An explicit compatibility target is required for cross-topic reuse. The
composer prefers exact topic matches, so a future `slots/faq` entry naturally
replaces the shared legacy FAQ fallback for Slots pages.

Production page types set `targetWordCount: 1200`. The composer selects one
variant for each skeleton section first, then adds additional unused variants
to those same semantic sections until the target is reached. This keeps the
page at eight or more meaningful sections while letting `contentVersion`
produce a different, deterministic combination. Markdown tables are preserved
as real content blocks, so comparison material can be added inside any
component folder.

## Migration compatibility

Reusable content belongs under `<locale>/shared/<component>/`; it remains
available as an explicit fallback for compatible pages. The existing
`<locale>/<component>/` files are still discovered during migration. Their
component names are classified by the migration map in
`packages/content-library/src/semantic.ts`, which supplies topic, section, and
the page types where that legacy entry is still valid. This keeps existing
sites buildable while new content is authored page-first. `conclusion` is no
longer present in any active skeleton and is never mandatory.

Page intent is defined in `page-types.json`; URL compatibility is represented
by `aliases` (for example `home` -> `index` and `withdrawals` -> `withdrawal`).
Skeletons list valid semantic section roles. Selection remains seeded by site,
locale, and content version, so changing the model does not make generation
nondeterministic.
