import { spawnSync } from "node:child_process";
import { CloudflareClient, CloudflareApiError, type FetchLike } from "cloudflare-client";
import type { DeployTarget, DeployResult, DeploymentProvider } from "./deployment-provider.js";

// Branch used for every preview deployment, distinct from
// target.productionBranch — Cloudflare Pages distinguishes preview vs.
// production purely by which branch a deployment targets.
const PREVIEW_BRANCH = "preview";

export type RunWranglerResult = { status: number | null; stdout: string; stderr: string; error?: Error };
export type RunWranglerFn = (args: string[], env: NodeJS.ProcessEnv) => RunWranglerResult;

function defaultRunWrangler(args: string[], env: NodeJS.ProcessEnv): RunWranglerResult {
  // shell: true is required on Windows — npx there is a .cmd shim the OS
  // refuses to spawn directly (see packages/generator-cli/src/pipeline.ts
  // for the same issue with npm). Safe here for the same reason: command
  // and args are built only from our own DeployTarget/distDir, never raw
  // site/docx content.
  const result = spawnSync("npx", ["wrangler", ...args], {
    env,
    encoding: "utf-8",
    shell: process.platform === "win32",
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error };
}

function extractPagesUrl(output: string): string | undefined {
  return output.match(/https:\/\/[a-zA-Z0-9.-]+\.pages\.dev\S*/)?.[0];
}

export type CloudflarePagesProviderOptions = {
  apiToken: string;
  accountId: string;
  fetchImpl?: FetchLike;
  runWrangler?: RunWranglerFn;
};

// Project creation, existence checks: Cloudflare's documented, stable
// public REST API. Actual file upload: wrangler pages deploy, run
// non-interactively via CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID env
// vars — Cloudflare's direct-upload asset flow (JWT upload tokens, an
// unpublished file-hashing scheme) is Wrangler's internal implementation,
// not a stable public API, so hand-rolling it would mean building on
// something that could silently break on a future Cloudflare release.
export class CloudflarePagesProvider implements DeploymentProvider {
  #client: CloudflareClient;
  #accountId: string;
  #apiToken: string;
  #runWrangler: RunWranglerFn;

  constructor(options: CloudflarePagesProviderOptions) {
    this.#client = new CloudflareClient(options.apiToken, { fetchImpl: options.fetchImpl });
    this.#accountId = options.accountId;
    this.#apiToken = options.apiToken;
    this.#runWrangler = options.runWrangler ?? defaultRunWrangler;
  }

  async ensureProject(target: DeployTarget): Promise<{ created: boolean }> {
    try {
      await this.#client.get(`/accounts/${this.#accountId}/pages/projects/${target.projectName}`);
      return { created: false };
    } catch (error) {
      if (!(error instanceof CloudflareApiError) || error.status !== 404) throw error;
    }

    await this.#client.postJson(`/accounts/${this.#accountId}/pages/projects`, {
      name: target.projectName,
      production_branch: target.productionBranch,
    });
    return { created: true };
  }

  async deployPreview(input: { target: DeployTarget; distDir: string }): Promise<DeployResult> {
    return this.#deploy(input.target, input.distDir, PREVIEW_BRANCH);
  }

  async promote(input: { target: DeployTarget; distDir: string }): Promise<DeployResult> {
    return this.#deploy(input.target, input.distDir, input.target.productionBranch);
  }

  #deploy(target: DeployTarget, distDir: string, branch: string): DeployResult {
    const result = this.#runWrangler(
      ["pages", "deploy", distDir, "--project-name", target.projectName, "--branch", branch, "--commit-dirty=true"],
      { ...process.env, CLOUDFLARE_API_TOKEN: this.#apiToken, CLOUDFLARE_ACCOUNT_ID: this.#accountId },
    );

    if (result.error) {
      throw new Error(`Failed to run "npx wrangler pages deploy": ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`wrangler pages deploy exited with code ${result.status}\n${result.stderr || result.stdout}`);
    }

    const url = extractPagesUrl(result.stdout);
    if (!url) {
      throw new Error(`wrangler pages deploy succeeded but no *.pages.dev URL was found in its output:\n${result.stdout}`);
    }

    return { url, deploymentId: `${target.projectName}-${branch}-${Date.now()}` };
  }
}
