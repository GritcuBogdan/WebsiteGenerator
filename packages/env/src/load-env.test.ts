import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnv, MissingEnvError } from "./load-env.js";

const COMPLETE_ENV = {
  CLOUDFLARE_API_TOKEN: "token-123",
  CLOUDFLARE_ACCOUNT_ID: "account-123",
  CLOUDFLARE_KV_NAMESPACE_ID: "kv-123",
  CLOUDFLARE_REDIRECT_WORKER_NAME: "redirect-worker",
};

let workDir: string;
before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "env-test-"));
});
after(async () => {
  await rm(workDir, { recursive: true, force: true });
});

test("returns a typed CloudflareEnv when every var is present via injected env", () => {
  const missingEnvPath = path.join(workDir, "does-not-exist.env");
  const result = loadEnv({ envPath: missingEnvPath, env: COMPLETE_ENV });
  assert.deepEqual(result, COMPLETE_ENV);
});

test("throws MissingEnvError listing every missing variable, not just the first", () => {
  const missingEnvPath = path.join(workDir, "does-not-exist.env");
  try {
    loadEnv({ envPath: missingEnvPath, env: { CLOUDFLARE_API_TOKEN: "token-123" } });
    assert.fail("expected MissingEnvError");
  } catch (error) {
    assert.ok(error instanceof MissingEnvError);
    assert.equal(error.problems.length, 3);
    assert.ok(error.problems.some((p) => p.startsWith("CLOUDFLARE_ACCOUNT_ID")));
    assert.ok(error.problems.some((p) => p.startsWith("CLOUDFLARE_KV_NAMESPACE_ID")));
    assert.ok(error.problems.some((p) => p.startsWith("CLOUDFLARE_REDIRECT_WORKER_NAME")));
  }
});

test("treats an empty-string value as invalid, not present", () => {
  const missingEnvPath = path.join(workDir, "does-not-exist.env");
  assert.throws(
    () => loadEnv({ envPath: missingEnvPath, env: { ...COMPLETE_ENV, CLOUDFLARE_API_TOKEN: "" } }),
    MissingEnvError,
  );
});

test("falls back to values from the .env file when not set in env", async () => {
  const envPath = path.join(workDir, "fallback.env");
  await writeFile(
    envPath,
    Object.entries(COMPLETE_ENV)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );

  const result = loadEnv({ envPath, env: {} });
  assert.deepEqual(result, COMPLETE_ENV);
});

test("a value in env overrides the same key from the .env file", async () => {
  const envPath = path.join(workDir, "override.env");
  await writeFile(envPath, `CLOUDFLARE_API_TOKEN=from-file`);

  const result = loadEnv({
    envPath,
    env: { ...COMPLETE_ENV, CLOUDFLARE_API_TOKEN: "from-process-env" },
  });
  assert.equal(result.CLOUDFLARE_API_TOKEN, "from-process-env");
});

test("does not throw when the .env file simply doesn't exist, as long as env has everything", () => {
  const missingEnvPath = path.join(workDir, "still-does-not-exist.env");
  assert.doesNotThrow(() => loadEnv({ envPath: missingEnvPath, env: COMPLETE_ENV }));
});
