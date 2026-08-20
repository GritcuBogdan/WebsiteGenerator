import { test } from "node:test";
import assert from "node:assert/strict";
import { PerSiteProjectStrategy } from "./deployment-strategy.js";
import type { SiteRegistryEntry } from "registry";

test("defaults projectName to the slug and productionBranch to 'production' when unregistered", () => {
  const strategy = new PerSiteProjectStrategy();
  const target = strategy.resolveTarget("golisimo", undefined);
  assert.deepEqual(target, { projectName: "golisimo", productionBranch: "production" });
});

test("reuses whatever's already registered rather than recomputing defaults", () => {
  const strategy = new PerSiteProjectStrategy();
  const existing: SiteRegistryEntry = {
    slug: "golisimo",
    domains: ["golisimogreece.com"],
    templateId: "casino-v1",
    templateVersion: "1.0.0",
    cloudflare: { projectName: "golisimo-eu", branch: "main", workerRouteIds: [] },
    deployments: [],
  };
  const target = strategy.resolveTarget("golisimo", existing);
  assert.deepEqual(target, { projectName: "golisimo-eu", productionBranch: "main" });
});
