import { test } from "node:test";
import assert from "node:assert/strict";
import { siteRegistryEntrySchema, deploymentRecordSchema, domainProvisioningRecordSchema } from "./registry-entry.js";

test("accepts a well-formed entry", () => {
  const result = siteRegistryEntrySchema.safeParse({
    slug: "golisimo",
    domains: ["golisimogreece.com"],
    templateId: "casino-v1",
    templateVersion: "1.0.0",
    cloudflare: { projectName: "golisimo", branch: "production", workerRouteIds: [] },
    deployments: [],
  });
  assert.equal(result.success, true);
});

test("rejects an entry missing required fields", () => {
  const result = siteRegistryEntrySchema.safeParse({ slug: "golisimo" });
  assert.equal(result.success, false);
});

test("cloudflare.projectId is optional (a project may not exist yet)", () => {
  const result = siteRegistryEntrySchema.safeParse({
    slug: "golisimo",
    domains: ["golisimogreece.com"],
    templateId: "casino-v1",
    templateVersion: "1.0.0",
    cloudflare: { projectName: "golisimo", branch: "production", workerRouteIds: [] },
    deployments: [],
  });
  assert.equal(result.success, true);
});

test("deploymentRecordSchema rejects an unknown environment value", () => {
  const result = deploymentRecordSchema.safeParse({
    id: "dep-1",
    environment: "staging", // not "preview" | "production"
    url: "https://example.com",
    timestamp: "2026-01-01T00:00:00.000Z",
    status: "success",
  });
  assert.equal(result.success, false);
});

test("domainProvisioning defaults to [] when omitted — old sites.json entries written before this field existed still parse", () => {
  const result = siteRegistryEntrySchema.parse({
    slug: "golisimo",
    domains: ["golisimogreece.com"],
    templateId: "casino-v1",
    templateVersion: "1.0.0",
    cloudflare: { projectName: "golisimo", branch: "production", workerRouteIds: [] },
    deployments: [],
  });
  assert.deepEqual(result.domainProvisioning, []);
});

test("domainProvisioningRecordSchema accepts a full record and rejects an unknown state", () => {
  const valid = domainProvisioningRecordSchema.safeParse({
    domain: "golisimogreece.com",
    state: "CLOUDFLARE_AUTHORITY_CONFIRMED",
    cloudflareZoneId: "zone1",
    cloudflareNameServers: ["ns1.cloudflare.com", "ns2.cloudflare.com"],
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(valid.success, true);

  const invalid = domainProvisioningRecordSchema.safeParse({
    domain: "golisimogreece.com",
    state: "SOMETHING_MADE_UP",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(invalid.success, false);
});
