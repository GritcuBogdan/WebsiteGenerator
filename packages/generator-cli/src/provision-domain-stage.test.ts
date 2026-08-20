import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { JsonFileSiteRegistry } from "registry";
import type { DomainHandoffResult, DomainHandoffService, ProvisionDomainOptions } from "domain-provisioning";
import { runProvisionDomainStage } from "./provision-domain-stage.js";
import { PipelineError } from "./pipeline-error.js";
import { Logger } from "./logger.js";

async function makeRegistry(): Promise<{ registry: JsonFileSiteRegistry; workDir: string }> {
  const workDir = await mkdtemp(path.join(tmpdir(), "provision-domain-stage-test-"));
  const registry = new JsonFileSiteRegistry(path.join(workDir, "sites.json"));
  registry.upsert({
    slug: "testcasino",
    domains: ["testcasino.example"],
    templateId: "casino-v1",
    templateVersion: "1.0.0",
    cloudflare: { projectName: "testcasino", branch: "production", workerRouteIds: [] },
    deployments: [],
    domainProvisioning: [],
  });
  return { registry, workDir };
}

class FakeDomainHandoff implements DomainHandoffService {
  #results: Map<string, DomainHandoffResult | Error>;
  calls: string[] = [];

  constructor(results: Record<string, DomainHandoffResult | Error>) {
    this.#results = new Map(Object.entries(results));
  }

  async provisionDomain(domain: string, options: ProvisionDomainOptions = {}): Promise<DomainHandoffResult> {
    this.calls.push(domain);
    options.logger?.info(`fake handoff for ${domain}`);
    const outcome = this.#results.get(domain);
    if (outcome instanceof Error) throw outcome;
    if (!outcome) throw new Error(`no fake outcome configured for ${domain}`);
    return outcome;
  }
}

const quietLogger = new Logger(false, true);

test("successful handoff: records CLOUDFLARE_AUTHORITY_CONFIRMED in the registry and returns it in results", async () => {
  const { registry, workDir } = await makeRegistry();
  const domainHandoff = new FakeDomainHandoff({
    "testcasino.example": { domain: "testcasino.example", state: "CLOUDFLARE_AUTHORITY_CONFIRMED", cloudflareZoneId: "zone1", cloudflareNameServers: ["ns1.cloudflare.com", "ns2.cloudflare.com"] },
  });

  const stageResult = await runProvisionDomainStage("testcasino", ["testcasino.example"], domainHandoff, registry, quietLogger);

  assert.equal(stageResult.results.length, 1);
  assert.equal(stageResult.results[0]!.state, "CLOUDFLARE_AUTHORITY_CONFIRMED");
  assert.equal(stageResult.warnings.length, 0);

  const persisted = registry.get("testcasino")!.domainProvisioning;
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]!.state, "CLOUDFLARE_AUTHORITY_CONFIRMED");
  assert.equal(persisted[0]!.cloudflareZoneId, "zone1");

  await rm(workDir, { recursive: true, force: true });
});

test("propagation timeout is not an error: adds a warning but does not throw", async () => {
  const { registry, workDir } = await makeRegistry();
  const domainHandoff = new FakeDomainHandoff({
    "testcasino.example": { domain: "testcasino.example", state: "NAMESERVERS_PROPAGATING", cloudflareZoneId: "zone1" },
  });

  const stageResult = await runProvisionDomainStage("testcasino", ["testcasino.example"], domainHandoff, registry, quietLogger);

  assert.equal(stageResult.results[0]!.state, "NAMESERVERS_PROPAGATING");
  assert.equal(stageResult.warnings.length, 1);
  assert.match(stageResult.warnings[0]!, /not yet propagated/);
  assert.equal(registry.get("testcasino")!.domainProvisioning[0]!.state, "NAMESERVERS_PROPAGATING");

  await rm(workDir, { recursive: true, force: true });
});

test("a real handoff failure records a FAILED entry and throws a PipelineError at stage provision-domain", async () => {
  const { registry, workDir } = await makeRegistry();
  const domainHandoff = new FakeDomainHandoff({
    "testcasino.example": new Error("Cloudflare unreachable"),
  });

  await assert.rejects(
    () => runProvisionDomainStage("testcasino", ["testcasino.example"], domainHandoff, registry, quietLogger),
    (error: unknown) => {
      assert.ok(error instanceof PipelineError);
      assert.equal(error.stage, "provision-domain");
      return true;
    },
  );

  const persisted = registry.get("testcasino")!.domainProvisioning;
  assert.equal(persisted[0]!.state, "FAILED");
  assert.match(persisted[0]!.lastError!.message, /Cloudflare unreachable/);

  await rm(workDir, { recursive: true, force: true });
});

test("multiple domains: each gets its own registry record, independent of the others", async () => {
  const { registry, workDir } = await makeRegistry();
  registry.upsert({ ...registry.get("testcasino")!, domains: ["testcasino.example", "testcasino.co"] });
  const domainHandoff = new FakeDomainHandoff({
    "testcasino.example": { domain: "testcasino.example", state: "CLOUDFLARE_AUTHORITY_CONFIRMED" },
    "testcasino.co": { domain: "testcasino.co", state: "SKIPPED_NOT_ON_HOSTINGER" },
  });

  const stageResult = await runProvisionDomainStage("testcasino", ["testcasino.example", "testcasino.co"], domainHandoff, registry, quietLogger);

  assert.equal(stageResult.results.length, 2);
  const persisted = registry.get("testcasino")!.domainProvisioning;
  assert.equal(persisted.find((r) => r.domain === "testcasino.example")!.state, "CLOUDFLARE_AUTHORITY_CONFIRMED");
  assert.equal(persisted.find((r) => r.domain === "testcasino.co")!.state, "SKIPPED_NOT_ON_HOSTINGER");

  await rm(workDir, { recursive: true, force: true });
});

test("rerun after a failure resumes cleanly: a second call overwrites the FAILED record with the new outcome", async () => {
  const { registry, workDir } = await makeRegistry();
  const failingHandoff = new FakeDomainHandoff({ "testcasino.example": new Error("transient") });
  await assert.rejects(() => runProvisionDomainStage("testcasino", ["testcasino.example"], failingHandoff, registry, quietLogger));
  assert.equal(registry.get("testcasino")!.domainProvisioning[0]!.state, "FAILED");

  const succeedingHandoff = new FakeDomainHandoff({
    "testcasino.example": { domain: "testcasino.example", state: "CLOUDFLARE_AUTHORITY_CONFIRMED", cloudflareZoneId: "zone1" },
  });
  const stageResult = await runProvisionDomainStage("testcasino", ["testcasino.example"], succeedingHandoff, registry, quietLogger);

  assert.equal(stageResult.results[0]!.state, "CLOUDFLARE_AUTHORITY_CONFIRMED");
  const persisted = registry.get("testcasino")!.domainProvisioning;
  assert.equal(persisted.length, 1); // replaced, not appended
  assert.equal(persisted[0]!.state, "CLOUDFLARE_AUTHORITY_CONFIRMED");

  await rm(workDir, { recursive: true, force: true });
});
