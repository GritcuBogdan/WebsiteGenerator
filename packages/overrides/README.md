# overrides

Hand-patches for `docx-parser`'s output. When the parser gets something
wrong — a mangled section title, a badly-split FAQ pair — the fix belongs
here, in `sites/<slug>/overrides[.<locale>].json`, not in
`.generated/content/site.ts`. That file is fully disposable and gets
overwritten every `generate`; this one is committed to git and survives it.

## File format

```json
{
  "pages": {
    "no-deposit-bonus": {
      "title": "Corrected page title",
      "sections": {
        "faq-1": {
          "items": [
            { "question": "Is this safe?", "answer": "Yes, fully licensed." }
          ]
        }
      }
    }
  }
}
```

Keyed by page `slug`, then by section `id` — both come from the parser's
output for that docx (run `parseDocx` and inspect the result, or check the
`.generated/content` output of a previous run, to find the right ids).

## Per-page banner (casino-v1 only)

For templates that synthesize a banner the docx can't describe (casino-v1's
`applyCasinoV1Rules` — every page other than the home page gets one built
from scratch, and even the home page's docx banner is usually just a page
title with no custom image/button label), a page-level `banner` field
controls it directly, independent of any section id:

```json
{
  "pages": {
    "bonus": {
      "banner": {
        "image": "bonus-hero.jpg",
        "text": "100% match up to $500",
        "buttonText": "Claim Now"
      }
    }
  }
}
```

- `image` is a filename dropped in `sites/<slug>/images/` (any name, not
  constrained to matching the page slug) — matched against the processed
  images the same way an auto-matched per-page banner is, so it still gets
  optimized/responsive variants. Omit it to keep the auto-matched-by-slug
  image (or the site-wide `config.json` banner if no image matches).
- `text` is the headline overlaid on the banner image. Omit it to keep the
  page title (the default when nothing else supplies one).
- `buttonText` is the banner's CTA button label. Omit it to keep the
  site-wide default for that locale.

Every field is optional and independent — set just the one you want to
change.

## Merge semantics

- **Objects merge key by key.** Setting `meta.description` in an override
  only changes `description`; `meta.title` and `meta.h1` from the parser
  are untouched.
- **Arrays are replaced wholesale, never merged item by item.** There's no
  reliable way to match "which FAQ item is this" between a docx and an
  override without guessing, so an override that touches `paragraphs`,
  `items`, `blocks`, or `navigation` must supply the complete corrected
  array, not just the one entry that was wrong.
- **Unknown fields are rejected**, and **a page slug or section id that
  doesn't match anything the parser actually produced throws** (collecting
  every mismatch into one error) rather than silently doing nothing. A
  typo in an override should fail loudly, not fail to apply.

Both are enforced in code: `overridesFileSchema` (`.strict()`, catches the
former at load time) and `applyOverrides` (catches the latter at merge
time).
