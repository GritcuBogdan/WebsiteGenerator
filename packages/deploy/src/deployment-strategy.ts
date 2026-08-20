import type { SiteRegistryEntry } from "registry";
import type { DeployTarget } from "./deployment-provider.js";

// Decides which underlying Cloudflare Pages project/branch a site maps to.
// The seam exists for when Cloudflare's projects-per-account limit becomes
// a real constraint at "hundreds of sites" scale (a future
// PooledProjectStrategy could pack multiple sites into fewer projects via
// branch-based custom domain aliasing) — not because a second strategy
// exists today.
export interface DeploymentStrategy {
  resolveTarget(slug: string, existing: SiteRegistryEntry | undefined): DeployTarget;
}

// The only strategy today: one Cloudflare Pages project per site. Reuses
// whatever's already in the registry rather than recomputing defaults, so
// a manually-adjusted project name/branch (e.g. after a slug collision)
// survives across runs.
export class PerSiteProjectStrategy implements DeploymentStrategy {
  resolveTarget(slug: string, existing: SiteRegistryEntry | undefined): DeployTarget {
    return {
      projectName: existing?.cloudflare.projectName ?? slug,
      productionBranch: existing?.cloudflare.branch ?? "production",
    };
  }
}
