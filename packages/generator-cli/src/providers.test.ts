import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildProviders } from "./providers.js";
import { NoopDeploymentProvider, CloudflarePagesProvider } from "deploy";
import { NoopDomainProvisioner, HostingerDomainHandoffService, NoopHostingerDomainHandoffService } from "domain-provisioning";
import { NoopRedirectStore } from "redirects";
import { MissingEnvError } from "env";

const CLOUDFLARE_ENV_KEYS = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_KV_NAMESPACE_ID",
  "CLOUDFLARE_REDIRECT_WORKER_NAME",
] as const;
const ENV_KEYS = [...CLOUDFLARE_ENV_KEYS, "HOSTINGER_API_TOKEN"] as const;

let workDir: string;
let savedEnv: Record<string, string | undefined>;

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "providers-test-"));
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});
after(async () => {
  await rm(workDir, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

test("dryRun: true selects Noop* providers and needs no credentials", () => {
  const providers = buildProviders({ dryRun: true, repoRoot: workDir });
  assert.ok(providers.deploymentProvider instanceof NoopDeploymentProvider);
  assert.ok(providers.domainProvisioner instanceof NoopDomainProvisioner);
  assert.ok(providers.domainHandoff instanceof NoopHostingerDomainHandoffService);
  assert.ok(providers.redirectStore instanceof NoopRedirectStore);
});

test("dryRun: false without configured credentials throws MissingEnvError, not a network error", () => {
  assert.throws(() => buildProviders({ dryRun: false, repoRoot: workDir }), MissingEnvError);
});

test("dryRun: false with credentials in process.env selects the real Cloudflare providers", () => {
  process.env.CLOUDFLARE_API_TOKEN = "t";
  process.env.CLOUDFLARE_ACCOUNT_ID = "a";
  process.env.CLOUDFLARE_KV_NAMESPACE_ID = "k";
  process.env.CLOUDFLARE_REDIRECT_WORKER_NAME = "w";

  const providers = buildProviders({ dryRun: false, repoRoot: workDir });
  assert.ok(providers.deploymentProvider instanceof CloudflarePagesProvider);
});

test("dryRun: false without HOSTINGER_API_TOKEN falls back to the Noop domain handoff — Hostinger stays optional", () => {
  process.env.CLOUDFLARE_API_TOKEN = "t";
  process.env.CLOUDFLARE_ACCOUNT_ID = "a";
  process.env.CLOUDFLARE_KV_NAMESPACE_ID = "k";
  process.env.CLOUDFLARE_REDIRECT_WORKER_NAME = "w";
  delete process.env.HOSTINGER_API_TOKEN;

  const providers = buildProviders({ dryRun: false, repoRoot: workDir });
  assert.ok(providers.domainHandoff instanceof NoopHostingerDomainHandoffService);
});

test("dryRun: false with HOSTINGER_API_TOKEN set selects the real Hostinger domain handoff", () => {
  process.env.CLOUDFLARE_API_TOKEN = "t";
  process.env.CLOUDFLARE_ACCOUNT_ID = "a";
  process.env.CLOUDFLARE_KV_NAMESPACE_ID = "k";
  process.env.CLOUDFLARE_REDIRECT_WORKER_NAME = "w";
  process.env.HOSTINGER_API_TOKEN = "h";

  const providers = buildProviders({ dryRun: false, repoRoot: workDir });
  assert.ok(providers.domainHandoff instanceof HostingerDomainHandoffService);
  delete process.env.HOSTINGER_API_TOKEN;
});
