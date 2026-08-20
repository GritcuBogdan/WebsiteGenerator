import { z } from "zod";

export const deploymentRecordSchema = z.object({
  id: z.string().min(1),
  environment: z.enum(["preview", "production"]),
  url: z.string().min(1),
  timestamp: z.string().min(1), // ISO 8601
  status: z.enum(["success", "failed"]),
});
export type DeploymentRecord = z.infer<typeof deploymentRecordSchema>;

// Outcome states for the Hostinger -> Cloudflare nameserver handoff
// (packages/domain-provisioning's HostingerDomainHandoffService). Mirrors
// that service's own DomainHandoffState, plus "FAILED" for when the
// service threw and pipeline.ts caught it — the service itself never
// returns FAILED (it throws DomainHandoffError instead), but this record
// is written either way so a failed attempt is still visible here.
//
// This is deliberately a *record* of the last outcome, not state the
// service reads back to decide what to do next (see that service's own
// doc comment) — every field here is for observability/debugging (Phase
// 11) and manual triage, never an input to provisionDomain() itself.
export const domainProvisioningStateSchema = z.enum([
  "SKIPPED_NOT_ON_HOSTINGER",
  "SKIPPED_NOT_CONFIGURED",
  "HOSTINGER_NAMESERVERS_UPDATED",
  "NAMESERVERS_PROPAGATING",
  "CLOUDFLARE_AUTHORITY_CONFIRMED",
  "FAILED",
]);
export type DomainProvisioningState = z.infer<typeof domainProvisioningStateSchema>;

export const domainProvisioningRecordSchema = z.object({
  domain: z.string().min(1),
  state: domainProvisioningStateSchema,
  cloudflareZoneId: z.string().optional(),
  cloudflareNameServers: z.array(z.string()).optional(),
  lastError: z.object({ stage: z.string(), message: z.string(), retryable: z.boolean().optional() }).optional(),
  updatedAt: z.string(), // ISO 8601
});
export type DomainProvisioningRecord = z.infer<typeof domainProvisioningRecordSchema>;

export const siteRegistryEntrySchema = z.object({
  slug: z.string().min(1),
  domains: z.array(z.string().min(1)),
  templateId: z.string().min(1),
  templateVersion: z.string().min(1),
  cloudflare: z.object({
    projectName: z.string().min(1),
    projectId: z.string().optional(),
    branch: z.string().min(1), // production branch/alias for this site within its project
    workerRouteIds: z.array(z.string()),
  }),
  deployments: z.array(deploymentRecordSchema),
  // One entry per domain (a site can have more than one). Optional/
  // defaulted so every sites.json entry written before this field existed
  // still parses as-is — additive, not a breaking schema change.
  domainProvisioning: z.array(domainProvisioningRecordSchema).default([]),
  lastGeneratedAt: z.string().optional(),
  lastDeployedAt: z.string().optional(),
});
export type SiteRegistryEntry = z.infer<typeof siteRegistryEntrySchema>;
