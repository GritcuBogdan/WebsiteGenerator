import { test } from "node:test";
import assert from "node:assert/strict";
import { NoopDeploymentProvider } from "./noop-deployment-provider.js";
import type { DeployTarget } from "./deployment-provider.js";

const TARGET: DeployTarget = { projectName: "golisimo", productionBranch: "production" };

test("ensureProject reports created: true the first time, false after", async () => {
  const provider = new NoopDeploymentProvider();
  assert.deepEqual(await provider.ensureProject(TARGET), { created: true });
  assert.deepEqual(await provider.ensureProject(TARGET), { created: false });
});

test("deployPreview and promote return distinct fake URLs without any network/subprocess call", async () => {
  const provider = new NoopDeploymentProvider();
  const preview = await provider.deployPreview({ target: TARGET, distDir: "/tmp/dist" });
  const production = await provider.promote({ target: TARGET, distDir: "/tmp/dist" });

  assert.match(preview.url, /pages\.dev/);
  assert.match(production.url, /pages\.dev/);
  assert.notEqual(preview.url, production.url);
});
