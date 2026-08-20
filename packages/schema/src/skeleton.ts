import { z } from "zod";

// content-library/skeletons/<id>.json — a named, valid page structure: the
// ordered list of semantic section ids that make up one page. `optionalSections`
// are valid future/migration slots: the composer reports them when content is
// not authored yet, but library validation does not treat them as dead refs.
// (architecture doc §8). Duplicate component ids are rejected here rather
// than left to produce two same-id sections on one page downstream (which
// would make overrides.<locale>.json's section targeting ambiguous).
export const skeletonSchema = z
  .object({
    id: z.string().min(1),
    sections: z.array(z.string().min(1)).min(1),
    optionalSections: z.array(z.string().min(1)).optional(),
  })
  .refine((skeleton) => new Set(skeleton.sections).size === skeleton.sections.length, {
    message: "sections must not contain duplicate component ids",
    path: ["sections"],
  })
  .refine(
    (skeleton) => (skeleton.optionalSections ?? []).every((section) => skeleton.sections.includes(section)),
    {
      message: "optionalSections must be included in sections",
      path: ["optionalSections"],
    },
  );
export type Skeleton = z.infer<typeof skeletonSchema>;

// content-library/page-types.json — maps a page intent/page type to its
// default skeleton and the sections actually valid there. `id` is the
// semantic page type (for example "slots" or "login"), while `aliases`
// keeps existing page slugs such as "index" and "withdrawal" working.
// `topic` is the content-library topic used for exact semantic matching;
// it defaults to `id` in the resolver for old definitions.
export const pageTypeSchema = z.object({
  id: z.string().min(1),
  defaultSkeleton: z.string().min(1),
  allowedComponents: z.array(z.string().min(1)).min(1),
  topic: z.string().min(1).optional(),
  aliases: z.array(z.string().min(1)).optional(),
  requiredSections: z.array(z.string().min(1)).optional(),
  targetWordCount: z.number().int().positive().optional(),
});
export type PageType = z.infer<typeof pageTypeSchema>;
