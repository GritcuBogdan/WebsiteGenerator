import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadHostingerEnv } from "./load-hostinger-env.js";

let workDir: string;
before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "env-hostinger-test-"));
});
after(async () => {
  await rm(workDir, { recursive: true, force: true });
});

test("HOSTINGER_API_TOKEN may be omitted entirely — never throws just because Hostinger isn't configured", () => {
  const missingEnvPath = path.join(workDir, "does-not-exist.env");
  const result = loadHostingerEnv({ envPath: missingEnvPath, env: {} });
  assert.equal(result.HOSTINGER_API_TOKEN, undefined);
  assert.equal(result.HOSTINGER_API_BASE_URL, "https://developers.hostinger.com");
});

test("returns the configured token and base URL when both are set", () => {
  const missingEnvPath = path.join(workDir, "does-not-exist.env");
  const result = loadHostingerEnv({
    envPath: missingEnvPath,
    env: { HOSTINGER_API_TOKEN: "secret-token", HOSTINGER_API_BASE_URL: "https://staging.developers.hostinger.com" },
  });
  assert.equal(result.HOSTINGER_API_TOKEN, "secret-token");
  assert.equal(result.HOSTINGER_API_BASE_URL, "https://staging.developers.hostinger.com");
});

test("is independent of Cloudflare env — no Cloudflare vars required", () => {
  const missingEnvPath = path.join(workDir, "does-not-exist.env");
  assert.doesNotThrow(() => loadHostingerEnv({ envPath: missingEnvPath, env: { HOSTINGER_API_TOKEN: "t" } }));
});

test("falls back to values from the .env file when not set in env", async () => {
  const envPath = path.join(workDir, "fallback.env");
  await writeFile(envPath, "HOSTINGER_API_TOKEN=from-file-token");

  const result = loadHostingerEnv({ envPath, env: {} });
  assert.equal(result.HOSTINGER_API_TOKEN, "from-file-token");
});

test("a value in env overrides the same key from the .env file", async () => {
  const envPath = path.join(workDir, "override.env");
  await writeFile(envPath, "HOSTINGER_API_TOKEN=from-file-token");

  const result = loadHostingerEnv({ envPath, env: { HOSTINGER_API_TOKEN: "from-env-token" } });
  assert.equal(result.HOSTINGER_API_TOKEN, "from-env-token");
});
