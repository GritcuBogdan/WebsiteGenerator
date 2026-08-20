import { test } from "node:test";
import assert from "node:assert/strict";
import { NoopDomainProvisioner } from "./noop-domain-provisioner.js";

test("ensureCustomDomain does not throw and requires no target", async () => {
  const provisioner = new NoopDomainProvisioner();
  await assert.doesNotReject(() => provisioner.ensureCustomDomain("golisimogreece.com", { projectName: "golisimo", productionBranch: "production" }));
});

test("ensureRedirectWorkerRoute returns a stable routeId across repeated calls for the same domain", async () => {
  const provisioner = new NoopDomainProvisioner();
  const first = await provisioner.ensureRedirectWorkerRoute("golisimogreece.com");
  const second = await provisioner.ensureRedirectWorkerRoute("golisimogreece.com");
  assert.equal(first.routeId, second.routeId);
});

test("different domains get different routeIds", async () => {
  const provisioner = new NoopDomainProvisioner();
  const a = await provisioner.ensureRedirectWorkerRoute("golisimogreece.com");
  const b = await provisioner.ensureRedirectWorkerRoute("safe-casino.com");
  assert.notEqual(a.routeId, b.routeId);
});
