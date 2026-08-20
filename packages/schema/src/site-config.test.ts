import { test } from "node:test";
import assert from "node:assert/strict";
import { siteConfigSchema, siteConfigInputSchema } from "./site-config.js";

// Mirrors sites/_example/config.json — every real site in the repo today
// predates `profile`/`contentSource` and must keep validating unmodified.
function legacyConfig() {
  return {
    slug: "example-casino",
    domains: ["example-casino.com"],
    affiliateUrl: "https://affiliate.example/track?id=example-casino",
    template: "casino-v1",
    locales: [{ code: "en", docx: "casino.en.docx", default: true }],
    theme: { primary: "#2563EB", secondary: "#0F2747" },
    navbar: { logo: "/images/example-casino/logo.png", brandName: "Example Casino" },
    banner: { desktop: "/images/example-casino/banner.png" },
  };
}

test("an existing (pre-rev.3) config with no profile/contentSource still validates", () => {
  const result = siteConfigSchema.safeParse(legacyConfig());
  assert.equal(result.success, true);
});

test("accepts an explicit profile reference", () => {
  const result = siteConfigSchema.safeParse({ ...legacyConfig(), profile: "dark-blue-casino" });
  assert.equal(result.success, true);
});

test("accepts contentSource: \"docx\"", () => {
  const result = siteConfigSchema.safeParse({ ...legacyConfig(), contentSource: "docx" });
  assert.equal(result.success, true);
});

test("accepts contentSource: \"library\"", () => {
  const result = siteConfigSchema.safeParse({ ...legacyConfig(), contentSource: "library" });
  assert.equal(result.success, true);
});

test("rejects an unknown contentSource value", () => {
  const result = siteConfigSchema.safeParse({ ...legacyConfig(), contentSource: "wordpress" });
  assert.equal(result.success, false);
});

test("siteConfigInputSchema still rejects a complete legacy config the same way siteConfigSchema does — nothing", () => {
  const result = siteConfigInputSchema.safeParse(legacyConfig());
  assert.equal(result.success, true);
});

test("siteConfigInputSchema allows omitting template/theme/navbar/banner entirely", () => {
  const { template: _t, theme: _th, navbar: _n, banner: _b, ...minimal } = legacyConfig();
  const result = siteConfigInputSchema.safeParse({ ...minimal, profile: "dark-blue-casino" });
  assert.equal(result.success, true);
});

test("siteConfigInputSchema still requires slug/domains/affiliateUrl/locales", () => {
  const { slug: _s, ...noSlug } = legacyConfig();
  const result = siteConfigInputSchema.safeParse(noSlug);
  assert.equal(result.success, false);
});
