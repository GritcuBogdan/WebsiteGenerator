# betovo

1. Put casino.<locale>.docx here for each locale listed in config.json's `locales`.
2. Put raw images in images/ — a top-level logo.png (or .jpg/.jpeg/.webp) becomes
   the source for an automatically generated favicon.
3. Fill in the real domain(s) and affiliateUrl in config.json.
4. From the repo root: npm run generate -- sites/betovo

To fix content the docx parser got wrong, add overrides.<locale>.json
instead of hand-editing generated output (see packages/overrides/README.md) —
generated content is fully disposable and gets overwritten on every run.
