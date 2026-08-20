# safe

**`.generated/content/site.ts` is a checked-in exception** to the usual
"`.generated/` is disposable and gitignored" rule: there's no docx yet for
this site, so there's nothing to regenerate it from. It was migrated from
the old hand-authored `src/content/casinos/safe/de.ts` (see the Phase 9
migration commit) — validated against `schema`'s `casinoSchema`, with the
old routing/slug-stripping logic reproduced exactly and every image
reference rewritten to match `image-pipeline`'s actual (slugified) output
filenames.

Once a real `casino.de.docx` exists here, running `npm run generate --
sites/safe` will overwrite this file with freshly parsed content, same as
any other site — at that point this note (and the `git add -f` needed to
track it) can go away.

`images/` and everything else under `.generated/` are **not** exceptions —
they're ordinary, fully regenerable pipeline output/input, same as any
site.
