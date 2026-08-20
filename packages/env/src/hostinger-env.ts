import { z } from "zod";

// The env-based knobs for the Hostinger domain handoff
// (packages/domain-provisioning's HostingerDomainHandoffService). Kept as
// its own schema/loader (see load-hostinger-env.ts), independent of
// cloudflareEnvSchema/loadEnv — a `--dry-run` run, or one for a site whose
// domain isn't on Hostinger at all, shouldn't need this token just because
// Cloudflare credentials happen to be required already.
//
// HOSTINGER_API_TOKEN is optional here (not required) — generator-cli's
// providers.ts is what decides whether its absence means "fall back to
// NoopHostingerDomainHandoffService" (dry-run, or Hostinger genuinely not
// configured yet), not this schema.
export const hostingerEnvSchema = z.object({
  HOSTINGER_API_TOKEN: z.string().min(1).optional(),
  HOSTINGER_API_BASE_URL: z.string().url().default("https://developers.hostinger.com"),
});
export type HostingerEnv = z.infer<typeof hostingerEnvSchema>;
