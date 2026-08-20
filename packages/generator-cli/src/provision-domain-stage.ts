import { DomainHandoffError, type DomainHandoffResult, type DomainHandoffService } from "domain-provisioning";
import type { DomainProvisioningRecord, SiteRegistry } from "registry";
import { PipelineError } from "./pipeline-error.js";
import type { Logger } from "./logger.js";

export type ProvisionDomainStageResult = {
  results: DomainHandoffResult[];
  warnings: string[];
};

// Hands each of a site's domains off from Hostinger (registrar) to
// Cloudflare (DNS/Pages/Workers) — see packages/domain-provisioning's
// HostingerDomainHandoffService for the actual orchestration. Extracted
// out of pipeline.ts (matching resolve-site-config.ts/resolve-content-
// source.ts/verify-url.ts's existing pattern of small, independently
// tested helpers pipeline.ts calls into) mainly so this can be unit
// tested against a fake SiteRegistry/DomainHandoffService without
// needing a real Astro build — pipeline.ts's own tests never exercise
// the deploy stages at all (they all use skipDeploy: true), and this
// stage has no reason to be the first one that requires it.
//
// A domain not managed by Hostinger, or Hostinger not configured at all
// (NoopHostingerDomainHandoffService), is a normal, expected outcome —
// this generator has always supported domains already pointed at
// Cloudflare by other means. A genuine failure (Hostinger/Cloudflare
// unreachable, zone creation rejected, nameserver update rejected)
// aborts the site via PipelineError, same as every other pipeline
// stage — but a bounded propagation timeout (NAMESERVERS_PROPAGATING)
// does not: it's an expected outcome at this generator's volume, so
// it's returned as a warning and the pipeline is left to continue into
// promote-to-production regardless (Cloudflare's API accepts custom-
// domain/route/DNS calls against a still-pending zone; the domain
// simply won't resolve publicly until propagation finishes, which
// verify-deployment naturally reflects, and a later `generate` run
// re-checks and resumes).
export async function runProvisionDomainStage(
  slug: string,
  domains: string[],
  domainHandoff: DomainHandoffService,
  registry: SiteRegistry,
  logger: Logger,
): Promise<ProvisionDomainStageResult> {
  const results: DomainHandoffResult[] = [];
  const warnings: string[] = [];

  const before = registry.get(slug);
  const records = new Map<string, DomainProvisioningRecord>((before?.domainProvisioning ?? []).map((record) => [record.domain, record]));

  for (const domain of domains) {
    const domainLogger = { info: (message: string) => logger.info(`  ${domain}: ${message}`) };
    try {
      const result = await domainHandoff.provisionDomain(domain, { logger: domainLogger });
      results.push(result);
      records.set(domain, {
        domain,
        state: result.state,
        cloudflareZoneId: result.cloudflareZoneId,
        cloudflareNameServers: result.cloudflareNameServers,
        updatedAt: new Date().toISOString(),
      });

      if (result.state === "NAMESERVERS_PROPAGATING") {
        const warning = `${domain}: nameservers not yet propagated to Cloudflare — continuing deployment, will re-check on the next run`;
        warnings.push(warning);
        logger.warn(`  ${warning}`);
      }
    } catch (error) {
      const isHandoffError = error instanceof DomainHandoffError;
      records.set(domain, {
        domain,
        state: "FAILED",
        lastError: {
          stage: isHandoffError ? error.stage : "provision-domain",
          message: error instanceof Error ? error.message : String(error),
          retryable: isHandoffError ? error.retryable : undefined,
        },
        updatedAt: new Date().toISOString(),
      });

      // Persist what was learned before propagating the failure — the
      // caller is about to throw and stop, but a rerun should still see
      // this FAILED record rather than nothing at all.
      const current = registry.get(slug);
      if (current) registry.upsert({ ...current, domainProvisioning: [...records.values()] });
      throw new PipelineError("provision-domain", error);
    }
  }

  const after = registry.get(slug);
  if (after) registry.upsert({ ...after, domainProvisioning: [...records.values()] });

  return { results, warnings };
}
