// @ts-check
import path from "node:path";
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
const site = process.env.SITE_URL;

// SITE_DIR (absolute path to sites/<slug>) is how this template stays
// stateless and reusable across every site and every parallel build:
// nothing is ever written into this package's own tree. publicDir/outDir
// point at that site's disposable .generated/ output, and the
// "virtual:site" alias resolves to its generated content module so
// src/lib/site.ts never needs to know which site it's building.
const siteDir = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : undefined;

export default defineConfig({
  site,
  publicDir: siteDir ? path.join(siteDir, ".generated/public") : "public",
  outDir: siteDir ? path.join(siteDir, ".generated/dist") : "dist",

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: siteDir
        ? {
            "virtual:site": path.join(siteDir, ".generated/content/site.ts"),
          }
        : {},
    },
  },
});
