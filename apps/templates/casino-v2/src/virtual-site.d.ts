// "virtual:site" is a Vite-only alias (see astro.config.mjs), resolved to
// SITE_DIR/.generated/content/site.ts at build time — TypeScript has no way
// to know that on its own, hence this ambient declaration.
declare module "virtual:site" {
  import type { Casino, LanguageOption } from "schema";

  export const siteLocales: Casino[];
  export const languageOptions: LanguageOption[];
  export const defaultLocale: string;
}
