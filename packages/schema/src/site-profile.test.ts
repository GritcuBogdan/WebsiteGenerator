import { test } from "node:test";
import assert from "node:assert/strict";
import { siteProfileSchema } from "./site-profile.js";

test("requires only an id", () => {
  const result = siteProfileSchema.safeParse({ id: "dark-blue-casino" });
  assert.equal(result.success, true);
});

test("rejects a profile with no id", () => {
  const result = siteProfileSchema.safeParse({ theme: { primary: "#111" } });
  assert.equal(result.success, false);
});

test("accepts a partial theme (no primary/secondary required)", () => {
  const result = siteProfileSchema.safeParse({ id: "gold-luxury", theme: { accent: "#FFD700" } });
  assert.equal(result.success, true);
});

test("accepts a partial banner with no desktop image set", () => {
  const result = siteProfileSchema.safeParse({ id: "neon", banner: { buttonColor: "#FF00FF" } });
  assert.equal(result.success, true);
});

test("accepts a full profile bundling theme/navbar/footer/banner/stickyBanner defaults", () => {
  const result = siteProfileSchema.safeParse({
    id: "dark-blue-casino",
    template: "casino-v1",
    theme: { primary: "#2563EB", secondary: "#0F2747" },
    navbar: { brandName: "Placeholder", showBrandName: true },
    footer: { copyright: "All rights reserved." },
    banner: { desktop: "/images/_profiles/dark-blue-casino/banner.png" },
    stickyBanner: { bullets: ["Fast payouts", "24/7 support"] },
    defaultSkeleton: "standard",
    images: { hero: "/images/_profiles/dark-blue-casino/hero.webp" },
  });
  assert.equal(result.success, true);
});
