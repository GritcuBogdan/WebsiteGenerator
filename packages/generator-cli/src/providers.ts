import path from "node:path";
import { loadEnv, loadHostingerEnv } from "env";
import { JsonFileSiteRegistry, type SiteRegistry } from "registry";
import {
  PerSiteProjectStrategy,
  CloudflarePagesProvider,
  NoopDeploymentProvider,
  type DeploymentProvider,
  type DeploymentStrategy,
} from "deploy";
import {
  CloudflareDomainProvisioner,
  NoopDomainProvisioner,
  HostingerDomainHandoffService,
  NoopHostingerDomainHandoffService,
  type DomainProvisioner,
  type DomainHandoffService,
} from "domain-provisioning";
import { HostingerClient } from "hostinger-client";
import { CloudflareKVRedirectStore, NoopRedirectStore, type RedirectStore } from "redirects";

export type Providers = {
  registry: SiteRegistry;
  strategy: DeploymentStrategy;
  deploymentProvider: DeploymentProvider;
  domainProvisioner: DomainProvisioner;
  domainHandoff: DomainHandoffService;
  redirectStore: RedirectStore;
};

export type BuildProvidersOptions = {
  dryRun: boolean;
  repoRoot: string;
};

// The composition root: picks Noop* implementations for --dry-run (no
// credentials needed, no network calls) or the real Cloudflare
// implementations otherwise — pipeline code (pipeline.ts) only ever sees
// the interfaces, never these concrete classes directly.
export function buildProviders(options: BuildProvidersOptions): Providers {
  const registry = new JsonFileSiteRegistry(path.join(options.repoRoot, "registry", "sites.json"));
  const strategy = new PerSiteProjectStrategy();

  if (options.dryRun) {
    return {
      registry,
      strategy,
      deploymentProvider: new NoopDeploymentProvider(),
      domainProvisioner: new NoopDomainProvisioner(),
      domainHandoff: new NoopHostingerDomainHandoffService(),
      redirectStore: new NoopRedirectStore(),
    };
  }

  const env = loadEnv({ envPath: path.join(options.repoRoot, ".env") });
  const domainProvisioner = new CloudflareDomainProvisioner({
    apiToken: env.CLOUDFLARE_API_TOKEN,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    workerName: env.CLOUDFLARE_REDIRECT_WORKER_NAME,
  });

  // Hostinger is loaded independently of the (required) Cloudflare env —
  // a site whose domain isn't on Hostinger at all, or a repo that hasn't
  // configured Hostinger yet,
  // shouldn't be blocked from deploying to Cloudflare. Falls back to the
  // Noop handoff (skips the automated nameserver handoff, assumes DNS/
  // nameservers are already pointed at Cloudflare by other means) rather
  // than throwing, so this feature is additive, not a new hard
  // requirement for every existing deployment.
  const hostingerEnv = loadHostingerEnv({ envPath: path.join(options.repoRoot, ".env") });
  const domainHandoff = hostingerEnv.HOSTINGER_API_TOKEN
    ? new HostingerDomainHandoffService({
        hostingerClient: new HostingerClient(hostingerEnv.HOSTINGER_API_TOKEN, { baseUrl: hostingerEnv.HOSTINGER_API_BASE_URL }),
        cloudflareZones: domainProvisioner,
      })
    : new NoopHostingerDomainHandoffService();

  return {
    registry,
    strategy,
    deploymentProvider: new CloudflarePagesProvider({
      apiToken: env.CLOUDFLARE_API_TOKEN,
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
    }),
    domainProvisioner,
    domainHandoff,
    redirectStore: new CloudflareKVRedirectStore({
      apiToken: env.CLOUDFLARE_API_TOKEN,
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      namespaceId: env.CLOUDFLARE_KV_NAMESPACE_ID,
    }),
  };
}
