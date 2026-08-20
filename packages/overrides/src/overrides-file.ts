import { z } from "zod";
import { textBlockSchema, tableBlockSchema, listBlockSchema } from "schema";

// sites/<slug>/overrides[.<locale>].json — a hand-maintained patch on top
// of what casinoParser.py extracted, for the cases it gets wrong (a mangled
// section title, a bad FAQ split). Committed to git, unlike
// .generated/content, so it survives regeneration.
//
// Deliberately keyed by page slug / section id (an object), not shaped
// exactly like ParsedDocxContent's page/section arrays: keying by id is
// what lets deep-merge target one page or section without having to
// restate every other one (see deep-merge.ts's array-replace rule — if
// "pages" were itself an array here, overriding one page would require
// supplying the entire pages array).
//
// Every section-override field is optional and .strict() rejects unknown
// keys, so a typo (e.g. "paragraph" instead of "paragraphs") fails loudly
// at load time instead of silently doing nothing.
export const sectionOverrideSchema = z
  .object({
    title: z.string().optional(),
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
    blocks: z.array(z.discriminatedUnion("type", [textBlockSchema, tableBlockSchema, listBlockSchema])).optional(),
    items: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string(),
        }),
      )
      .optional(),
  })
  .strict();
export type SectionOverride = z.infer<typeof sectionOverrideSchema>;

export const pageOverrideSchema = z
  .object({
    title: z.string().optional(),
    navLabel: z.string().optional(),
    meta: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        h1: z.string().optional(),
      })
      .strict()
      .optional(),
    // Per-page banner overrides for templates that synthesize a banner the
    // docx doesn't supply (casino-v1's applyCasinoV1Rules) - a docx has no
    // "use this image/headline/button label for this page" concept, so this
    // is the only way to set them per page rather than site-wide. `image`
    // is a filename (or filename minus extension) matched against the same
    // processed-images manifest every other image reference uses, not a
    // literal path.
    banner: z
      .object({
        image: z.string().optional(),
        text: z.string().optional(),
        buttonText: z.string().optional(),
      })
      .strict()
      .optional(),
    sections: z.record(z.string(), sectionOverrideSchema).optional(),
  })
  .strict();
export type PageOverride = z.infer<typeof pageOverrideSchema>;

export const overridesFileSchema = z
  .object({
    pages: z.record(z.string(), pageOverrideSchema),
  })
  .strict();
export type OverridesFile = z.infer<typeof overridesFileSchema>;
