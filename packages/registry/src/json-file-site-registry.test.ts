import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { JsonFileSiteRegistry } from "./json-file-site-registry.js";
import type { SiteRegistryEntry } from "./registry-entry.js";

function sampleEntry(overrides: Partial<SiteRegistryEntry> = {}): SiteRegistryEntry {
  return {
    slug: "golisimo",
    domains: ["golisimogreece.com"],
    templateId: "casino-v1",
    templateVersion: "1.0.0",
    cloudflare: {
      projectName: "golisimo",
      branch: "production",
      workerRouteIds: [],
    },
    deployments: [],
    domainProvisioning: [],
    ...overrides,
  };
}

let workDir: string;
let filePath: string;

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "registry-test-"));
});
after(async () => {
  await rm(workDir, { recursive: true, force: true });
});

test("starts empty when the file doesn't exist yet", () => {
  filePath = path.join(workDir, "fresh", "sites.json");
  const registry = new JsonFileSiteRegistry(filePath);
  assert.equal(registry.get("golisimo"), undefined);
  assert.deepEqual(registry.list(), []);
});

test("upsert then get returns the same entry", () => {
  filePath = path.join(workDir, "basic.json");
  const registry = new JsonFileSiteRegistry(filePath);
  registry.upsert(sampleEntry());
  assert.deepEqual(registry.get("golisimo"), sampleEntry());
});

test("upsert with the same slug replaces in place, never duplicates", () => {
  filePath = path.join(workDir, "no-dupe.json");
  const registry = new JsonFileSiteRegistry(filePath);
  registry.upsert(sampleEntry());
  registry.upsert(sampleEntry({ domains: ["golisimogreece.com", "golisimo.gr"] }));
  assert.equal(registry.list().length, 1);
  assert.deepEqual(registry.get("golisimo")!.domains, ["golisimogreece.com", "golisimo.gr"]);
});

test("list() is sorted by slug", () => {
  filePath = path.join(workDir, "sorted.json");
  const registry = new JsonFileSiteRegistry(filePath);
  registry.upsert(sampleEntry({ slug: "zebra-casino", cloudflare: { projectName: "zebra-casino", branch: "production", workerRouteIds: [] } }));
  registry.upsert(sampleEntry({ slug: "alpha-casino", cloudflare: { projectName: "alpha-casino", branch: "production", workerRouteIds: [] } }));
  assert.deepEqual(
    registry.list().map((entry) => entry.slug),
    ["alpha-casino", "zebra-casino"],
  );
});

test("persists to disk immediately, readable without going through the class", async () => {
  filePath = path.join(workDir, "immediate.json");
  const registry = new JsonFileSiteRegistry(filePath);
  registry.upsert(sampleEntry());

  const raw = JSON.parse(await readFile(filePath, "utf-8"));
  assert.equal(raw.sites.length, 1);
  assert.equal(raw.sites[0].slug, "golisimo");
});

test("a new instance pointed at the same file loads previously-persisted data", () => {
  filePath = path.join(workDir, "round-trip.json");
  new JsonFileSiteRegistry(filePath).upsert(sampleEntry());

  const reloaded = new JsonFileSiteRegistry(filePath);
  assert.deepEqual(reloaded.get("golisimo"), sampleEntry());
});

test("recordDeployment appends and bumps lastDeployedAt", () => {
  filePath = path.join(workDir, "deployments.json");
  const registry = new JsonFileSiteRegistry(filePath);
  registry.upsert(sampleEntry());

  registry.recordDeployment("golisimo", {
    id: "dep-1",
    environment: "preview",
    url: "https://preview.pages.dev",
    timestamp: "2026-01-01T00:00:00.000Z",
    status: "success",
  });
  registry.recordDeployment("golisimo", {
    id: "dep-2",
    environment: "production",
    url: "https://golisimogreece.com",
    timestamp: "2026-01-02T00:00:00.000Z",
    status: "success",
  });

  const entry = registry.get("golisimo")!;
  assert.equal(entry.deployments.length, 2);
  assert.equal(entry.deployments[1].id, "dep-2");
  assert.equal(entry.lastDeployedAt, "2026-01-02T00:00:00.000Z");
});

test("recordDeployment throws for a site that was never registered", () => {
  filePath = path.join(workDir, "unknown-site.json");
  const registry = new JsonFileSiteRegistry(filePath);
  assert.throws(() =>
    registry.recordDeployment("never-registered", {
      id: "dep-1",
      environment: "preview",
      url: "https://x.pages.dev",
      timestamp: "2026-01-01T00:00:00.000Z",
      status: "success",
    }),
  );
});

test("throws on construction when the file on disk fails schema validation", async () => {
  filePath = path.join(workDir, "corrupt.json");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, JSON.stringify({ sites: [{ slug: "golisimo" }] })); // missing required fields
  assert.throws(() => new JsonFileSiteRegistry(filePath));
});
