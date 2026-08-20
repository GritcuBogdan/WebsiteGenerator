import { test } from "node:test";
import assert from "node:assert/strict";
import { CloudflarePagesProvider, type RunWranglerFn } from "./cloudflare-pages-provider.js";
import type { DeployTarget } from "./deployment-provider.js";

const TARGET: DeployTarget = { projectName: "golisimo", productionBranch: "production" };

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

test("ensureProject reports created: false when the project already exists (200)", async () => {
  const fetchImpl = fakeFetch(200, { success: true, result: { id: "proj1" }, errors: [], messages: [] });
  const provider = new CloudflarePagesProvider({ apiToken: "t", accountId: "acc", fetchImpl });

  assert.deepEqual(await provider.ensureProject(TARGET), { created: false });
});

test("ensureProject creates the project when a lookup 404s", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if ((init?.method ?? "GET") === "GET") {
      return new Response(JSON.stringify({ success: false, result: null, errors: [{ code: 8000007, message: "not found" }], messages: [] }), {
        status: 404,
      });
    }
    return new Response(JSON.stringify({ success: true, result: { id: "proj1" }, errors: [], messages: [] }), { status: 200 });
  }) as typeof fetch;

  const provider = new CloudflarePagesProvider({ apiToken: "t", accountId: "acc", fetchImpl });
  assert.deepEqual(await provider.ensureProject(TARGET), { created: true });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /^GET .*\/pages\/projects\/golisimo$/);
  assert.match(calls[1], /^POST .*\/pages\/projects$/);
});

test("ensureProject propagates a non-404 error instead of trying to create anyway", async () => {
  const fetchImpl = fakeFetch(500, { success: false, result: null, errors: [{ code: 1000, message: "internal error" }], messages: [] });
  const provider = new CloudflarePagesProvider({ apiToken: "t", accountId: "acc", fetchImpl });

  await assert.rejects(() => provider.ensureProject(TARGET));
});

test("deployPreview runs wrangler with the fixed 'preview' branch and returns the parsed URL", async () => {
  const calls: Array<{ args: string[]; env: NodeJS.ProcessEnv }> = [];
  const runWrangler: RunWranglerFn = (args, env) => {
    calls.push({ args, env });
    return { status: 0, stdout: "✨ Deployment complete! Take a peek over at https://abc123.golisimo.pages.dev\n", stderr: "" };
  };

  const provider = new CloudflarePagesProvider({ apiToken: "t", accountId: "acc", runWrangler });
  const result = await provider.deployPreview({ target: TARGET, distDir: "/tmp/dist" });

  assert.equal(result.url, "https://abc123.golisimo.pages.dev");
  assert.deepEqual(calls[0].args, ["pages", "deploy", "/tmp/dist", "--project-name", "golisimo", "--branch", "preview", "--commit-dirty=true"]);
  assert.equal(calls[0].env.CLOUDFLARE_API_TOKEN, "t");
  assert.equal(calls[0].env.CLOUDFLARE_ACCOUNT_ID, "acc");
});

test("promote runs wrangler with target.productionBranch, not 'preview'", async () => {
  const calls: string[][] = [];
  const runWrangler: RunWranglerFn = (args) => {
    calls.push(args);
    return { status: 0, stdout: "https://golisimo.pages.dev deployed", stderr: "" };
  };

  const provider = new CloudflarePagesProvider({ apiToken: "t", accountId: "acc", runWrangler });
  await provider.promote({ target: TARGET, distDir: "/tmp/dist" });

  assert.ok(calls[0].includes("--branch"));
  assert.equal(calls[0][calls[0].indexOf("--branch") + 1], "production");
});

test("throws when wrangler exits non-zero, including stderr in the message", async () => {
  const runWrangler: RunWranglerFn = () => ({ status: 1, stdout: "", stderr: "Error: not authenticated" });
  const provider = new CloudflarePagesProvider({ apiToken: "t", accountId: "acc", runWrangler });

  await assert.rejects(() => provider.deployPreview({ target: TARGET, distDir: "/tmp/dist" }), /not authenticated/);
});

test("throws when wrangler succeeds but no *.pages.dev URL is found in its output", async () => {
  const runWrangler: RunWranglerFn = () => ({ status: 0, stdout: "done, but no url printed", stderr: "" });
  const provider = new CloudflarePagesProvider({ apiToken: "t", accountId: "acc", runWrangler });

  await assert.rejects(() => provider.deployPreview({ target: TARGET, distDir: "/tmp/dist" }), /no \*\.pages\.dev URL/);
});

test("throws when the process fails to spawn at all", async () => {
  const runWrangler: RunWranglerFn = () => ({ status: null, stdout: "", stderr: "", error: new Error("ENOENT") });
  const provider = new CloudflarePagesProvider({ apiToken: "t", accountId: "acc", runWrangler });

  await assert.rejects(() => provider.deployPreview({ target: TARGET, distDir: "/tmp/dist" }), /ENOENT/);
});
