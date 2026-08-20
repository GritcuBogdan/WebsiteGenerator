import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SiteConfigInput } from "schema";
import { resolveSiteConfig } from "./resolve-site-config.js";

let profilesDir: string;

function minimalRawConfig(overrides: Partial<SiteConfigInput> = {}): SiteConfigInput {
  return {
    slug: "luckyspin",
    domains: ["luckyspin.example"],
    affiliateUrl: "https://affiliate.example/track?id=luckyspin",
    locales: [{ code: "en", default: true }],
    ...overrides,
  };
}

before(async () => {
  profilesDir = await mkdtemp(path.join(tmpdir(), "resolve-site-config-test-"));
  await writeFile(
    path.join(profilesDir, "dark-blue-casino.json"),
    JSON.stringify({
      id: "dark-blue-casino",
      template: "casino-v1",
      theme: { primary: "#2563EB", secondary: "#0F2747" },
      navbar: { showBrandName: true },
      banner: { desktop: "/images/_profiles/dark-blue-casino/banner.png" },
      defaultSkeleton: "standard",
      images: { hero: "/images/_profiles/dark-blue-casino/hero.webp" },
    }),
  );
  await writeFile(
    path.join(profilesDir, "broken.json"),
    JSON.stringify({ id: "broken", theme: { primary: "#111" } }), // theme.secondary missing
  );
});

after(async () => {
  await rm(profilesDir, { recursive: true, force: true });
});

test("a complete legacy config with no profile resolves unchanged (backward compatible)", () => {
  const raw = minimalRawConfig({
    template: "casino-v1",
    theme: { primary: "#111111", secondary: "#222222" },
    navbar: {},
    banner: { desktop: "/images/luckyspin/banner.png" },
  });
  const result = resolveSiteConfig(raw, profilesDir);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.config.theme.primary, "#111111");
    assert.equal(result.config.banner.desktop, "/images/luckyspin/banner.png");
  }
});

test("a profile supplies template/theme/banner when the site's own config omits them", () => {
  const raw = minimalRawConfig({ profile: "dark-blue-casino" });
  const result = resolveSiteConfig(raw, profilesDir);
  assert.ok(result.ok, !result.ok ? result.issue : undefined);
  if (result.ok) {
    assert.equal(result.config.template, "casino-v1");
    assert.equal(result.config.theme.primary, "#2563EB");
    assert.equal(result.config.banner.desktop, "/images/_profiles/dark-blue-casino/banner.png");
  }
});

test("the site's own explicit fields win over the profile's", () => {
  const raw = minimalRawConfig({
    profile: "dark-blue-casino",
    theme: { primary: "#FF0000", secondary: "#0F2747" },
  });
  const result = resolveSiteConfig(raw, profilesDir);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.config.theme.primary, "#FF0000"); // site wins
    assert.equal(result.config.template, "casino-v1"); // still inherited from profile
  }
});

test("a profile's `id`/`defaultSkeleton`/`images` never leak into the resolved SiteConfig", () => {
  const raw = minimalRawConfig({ profile: "dark-blue-casino" });
  const result = resolveSiteConfig(raw, profilesDir);
  assert.ok(result.ok);
  if (result.ok) {
    assert.ok(!("defaultSkeleton" in result.config));
    assert.ok(!("images" in result.config));
  }
});

test("_base.json applies when it exists, and the named profile overrides it", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "resolve-site-config-base-"));
  await writeFile(
    path.join(dir, "_base.json"),
    JSON.stringify({ id: "_base", theme: { primary: "#000000", secondary: "#111111" }, footer: { copyright: "Base copyright." } }),
  );
  await writeFile(
    path.join(dir, "gold.json"),
    JSON.stringify({ id: "gold", theme: { primary: "#FFD700", secondary: "#111111" } }),
  );

  const raw = minimalRawConfig({ profile: "gold", template: "casino-v1", navbar: {}, banner: { desktop: "/b.png" } });
  const result = resolveSiteConfig(raw, dir);
  assert.ok(result.ok, !result.ok ? result.issue : undefined);
  if (result.ok) {
    assert.equal(result.config.theme.primary, "#FFD700"); // profile overrides base
    assert.equal(result.config.footer?.copyright, "Base copyright."); // base fills in what the profile didn't set
  }

  await rm(dir, { recursive: true, force: true });
});

test("fails loudly when a referenced profile doesn't exist", () => {
  const raw = minimalRawConfig({ profile: "does-not-exist" });
  const result = resolveSiteConfig(raw, profilesDir);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.issue, /not found/);
});

test("fails loudly when the referenced profile itself is malformed", () => {
  const raw = minimalRawConfig({ profile: "broken" });
  const result = resolveSiteConfig(raw, profilesDir);
  assert.equal(result.ok, false);
});

test("fails loudly, naming the missing field, when nothing in the chain supplies a required field", () => {
  const raw = minimalRawConfig(); // no profile, no theme/navbar/banner/template
  const result = resolveSiteConfig(raw, profilesDir);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.issue, /"luckyspin"/);
    assert.match(result.issue, /template/);
  }
});
