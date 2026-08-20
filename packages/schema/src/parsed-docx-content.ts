import { z } from "zod";
import { textBlockSchema, tableBlockSchema, listBlockSchema, headingBlockSchema } from "./casino.js";

// The JSON contract between packages/docx-parser (Python, stdout) and the
// Node pipeline. Deliberately narrower than CasinoSection/Casino: this is
// pure extracted content only, no theme/navbar/footer/image paths — those
// come from config + template defaults in the assemble-site stage.

export const parsedPageMetaSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  h1: z.string().optional(),
});
export type ParsedPageMeta = z.infer<typeof parsedPageMetaSchema>;

export const parsedIntroSectionSchema = z.object({
  type: z.literal("intro"),
  id: z.string(),
  title: z.string(),
  paragraphs: z.array(z.string()).optional(),
  bannerText: z.string().optional(),
  navigation: z
    .array(
      z.object({
        title: z.string(),
        href: z.string(),
      }),
    )
    .optional(),
});
export type ParsedIntroSection = z.infer<typeof parsedIntroSectionSchema>;

export const parsedTextSectionSchema = z.object({
  type: z.literal("text"),
  id: z.string(),
  title: z.string(),
  paragraphs: z.array(z.string()),
});
export type ParsedTextSection = z.infer<typeof parsedTextSectionSchema>;

export const parsedContentSectionSchema = z.object({
  type: z.literal("content"),
  id: z.string(),
  title: z.string(),
  blocks: z.array(z.discriminatedUnion("type", [textBlockSchema, tableBlockSchema, listBlockSchema, headingBlockSchema])),
});
export type ParsedContentSection = z.infer<typeof parsedContentSectionSchema>;

export const parsedFaqSectionSchema = z.object({
  type: z.literal("faq"),
  id: z.string(),
  title: z.string(),
  items: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    }),
  ),
});
export type ParsedFaqSection = z.infer<typeof parsedFaqSectionSchema>;

export const parsedSectionSchema = z.discriminatedUnion("type", [
  parsedIntroSectionSchema,
  parsedTextSectionSchema,
  parsedContentSectionSchema,
  parsedFaqSectionSchema,
]);
export type ParsedSection = z.infer<typeof parsedSectionSchema>;

// Never produced by casinoParser.py itself (a docx has no way to say "use
// this image, this headline, this button label for this page's banner") -
// this only ever gets populated by an overrides.<locale>.json entry, for
// templates (like casino-v1) that synthesize a per-page banner the docx
// doesn't supply.
export const parsedPageBannerOverrideSchema = z.object({
  image: z.string().optional(),
  text: z.string().optional(),
  buttonText: z.string().optional(),
});
export type ParsedPageBannerOverride = z.infer<typeof parsedPageBannerOverrideSchema>;

export const parsedPageSchema = z.object({
  slug: z.string(),
  title: z.string(),
  navLabel: z.string().optional(),
  meta: parsedPageMetaSchema,
  sections: z.array(parsedSectionSchema),
  banner: parsedPageBannerOverrideSchema.optional(),
});
export type ParsedPage = z.infer<typeof parsedPageSchema>;

export const parsedDocxContentSchema = z.object({
  locale: z.string(),
  pages: z.array(parsedPageSchema).min(1),
});
export type ParsedDocxContent = z.infer<typeof parsedDocxContentSchema>;
