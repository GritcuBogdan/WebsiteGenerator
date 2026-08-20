# sites/_example

A documented reference for the `sites/<slug>/` convention — not read by
`new-site` at runtime (it generates its own scaffold programmatically); this
exists so a human can see a complete, realistic `config.json` in one place.

A real site directory looks like:

```
sites/<slug>/
├── config.json              # see this directory's config.json for every field
├── casino.<locale>.docx     # one per entry in config.json's "locales"
├── overrides.<locale>.json  # optional — hand-patches for content the docx parser got wrong
├── images/                  # raw, client-provided images
│   ├── logo.png             # top-level logo.(png|jpg|jpeg|webp) -> auto-generated favicon
│   └── ...
└── .generated/               # gitignored, fully disposable pipeline output
```

To create a new one: `npm run new-site -- <slug>` from the repo root, then
fill in the generated `config.json` and drop in the docx/images.

Generate (parse, validate, optimize images, build): `npm run generate --
sites/<slug>` from the repo root.
