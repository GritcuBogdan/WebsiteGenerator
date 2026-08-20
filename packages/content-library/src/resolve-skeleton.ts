import type { PageType, Skeleton, SiteData } from "schema";
import { pageTypeMatchesSlug } from "./semantic.js";

export type SkeletonResolution = { ok: true; skeleton: Skeleton; pageType: PageType } | { ok: false; issue: string };

const GENERIC_PAGE_TYPE_ID = "_generic";
const GENERIC_PAGE_TYPE: PageType = { id: GENERIC_PAGE_TYPE_ID, defaultSkeleton: "_generic", allowedComponents: ["intro"] };
const GENERIC_SKELETON: Skeleton = { id: "_generic", sections: ["intro"] };

export type PageTypeResolution = { pageType: PageType; recognized: boolean };

// Page type resolution is separate from skeleton resolution so callers and
// tests can reason about intent without also loading a skeleton. Aliases make
// the semantic model compatible with existing URL slugs (index/withdrawal).
export function resolvePageType(slug: string, pageTypes: readonly PageType[]): PageTypeResolution {
  const pageType = pageTypes.find((entry) => pageTypeMatchesSlug(entry, slug));
  return pageType ? { pageType, recognized: true } : { pageType: GENERIC_PAGE_TYPE, recognized: false };
}

// Resolves which skeleton applies to a given page slug.
//
// - An explicit data.json `skeleton` override (site-data.ts) applies only
//   to the site's primary "index" page — it's a single site-wide value,
//   not a per-page map, and "index" is the flagship page a site is most
//   likely to want to hand-pick a structure for. Every other recognized
//   page slug always uses its page type's defaultSkeleton.
// - A slug with no matching page type (an unrecognized/custom page) falls
//   back to a built-in generic single-section page type rather than
//   failing outright — still buildable, just minimally, from a single
//   "intro"-labeled content-library entry.
export function resolveSkeleton(
  slug: string,
  pageTypes: readonly PageType[],
  skeletons: readonly Skeleton[],
  siteData: SiteData,
): SkeletonResolution {
  const { pageType } = resolvePageType(slug, pageTypes);

  const skeletonId = slug === "index" && siteData.skeleton ? siteData.skeleton : pageType.defaultSkeleton;

  const skeleton =
    pageType.id === GENERIC_PAGE_TYPE_ID && skeletonId === GENERIC_SKELETON.id
      ? GENERIC_SKELETON
      : skeletons.find((entry) => entry.id === skeletonId);

  if (!skeleton) {
    return { ok: false, issue: `page "${slug}": skeleton "${skeletonId}" not found` };
  }

  // Only enforced against a real, explicitly-authored page type — the
  // synthetic generic fallback's allowedComponents is just a minimal
  // safety net for an unrecognized slug, not a meaningful allow-list to
  // validate a real skeleton (or an explicit siteData.skeleton override)
  // against.
  const disallowed =
    pageType.id === GENERIC_PAGE_TYPE_ID
      ? []
      : skeleton.sections.filter((section) => !pageType.allowedComponents.includes(section));
  if (disallowed.length > 0) {
    return {
      ok: false,
      issue: `page "${slug}": skeleton "${skeleton.id}" includes section(s) [${disallowed.join(", ")}] not allowed for page type "${pageType.id}"`,
    };
  }

  const requiredSections = pageType.requiredSections ?? [];
  const missingRequired = requiredSections.filter((section) => !skeleton.sections.includes(section));
  if (missingRequired.length > 0) {
    return {
      ok: false,
      issue: `page "${slug}": skeleton "${skeleton.id}" is missing required section(s) [${missingRequired.join(", ")}] for page type "${pageType.id}"`,
    };
  }

  return { ok: true, skeleton, pageType };
}
