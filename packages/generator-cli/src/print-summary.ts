import type { GenerateResult } from "./pipeline.js";
import type { VerifyResult } from "./verify-url.js";

function formatVerify(label: string, result: VerifyResult | undefined): string | undefined {
  if (!result) return undefined;
  return result.ok ? `${label}:        OK (${result.status})` : `${label}:        FAILED (${result.error ?? result.status})`;
}

export function formatSummary(result: GenerateResult): string {
  const lines: string[] = [];
  const rule = "=".repeat(60);

  lines.push("", rule);
  lines.push(`Site:              ${result.slug}`);
  lines.push(`Locales:           ${result.locales.join(", ") || "(none)"}`);
  for (const [locale, count] of Object.entries(result.pageCounts)) {
    lines.push(`  ${locale}: ${count} page(s)`);
  }
  lines.push(`Images optimized:  ${result.imagesProcessed}`);
  lines.push(`Favicon generated: ${result.faviconGenerated ? "yes" : "no"}`);
  lines.push(`Build time:        ${result.buildDurationMs}ms`);
  lines.push(`Output:            ${result.distDir}`);

  if (result.previewUrl) lines.push(`Preview:           ${result.previewUrl}`);
  const verifyPreviewLine = formatVerify("Verify preview", result.verifyPreview);
  if (verifyPreviewLine) lines.push(verifyPreviewLine);

  if (result.domainHandoff.length > 0) {
    lines.push("Domain handoff:");
    for (const outcome of result.domainHandoff) {
      const detail = outcome.cloudflareZoneId ? ` (zone ${outcome.cloudflareZoneId})` : "";
      lines.push(`  ${outcome.domain}: ${outcome.state}${detail}`);
    }
  }
  if (result.domainsProvisioned.length > 0) {
    lines.push(`Domains attached:  ${result.domainsProvisioned.join(", ")}`);
  }
  if (result.productionUrl) lines.push(`Production:        ${result.productionUrl}`);
  const verifyProductionLine = formatVerify("Verify production", result.verifyProduction);
  if (verifyProductionLine) lines.push(verifyProductionLine);

  lines.push(`Redirect set:      ${result.redirectSet ? "yes" : "no"}`);
  const verifyRedirectLine = formatVerify("Verify redirect", result.verifyRedirect);
  if (verifyRedirectLine) lines.push(verifyRedirectLine);

  if (result.dryRun) {
    lines.push("(--dry-run: deploy/domain/redirect stages ran against Noop providers — no real Cloudflare calls were made.)");
  }

  if (result.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of result.warnings) lines.push(`  - ${warning}`);
  }

  lines.push(rule);
  return lines.join("\n");
}
