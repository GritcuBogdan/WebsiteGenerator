import type { DeployTarget, DeployResult, DeploymentProvider } from "./deployment-provider.js";

// Backs --dry-run and tests: no network calls, no subprocess, just
// deterministic fake URLs so callers (verify-preview, the summary report)
// have something to work with.
export class NoopDeploymentProvider implements DeploymentProvider {
  #createdProjects = new Set<string>();

  async ensureProject(target: DeployTarget): Promise<{ created: boolean }> {
    if (this.#createdProjects.has(target.projectName)) return { created: false };
    this.#createdProjects.add(target.projectName);
    return { created: true };
  }

  async deployPreview({ target }: { target: DeployTarget; distDir: string }): Promise<DeployResult> {
    return { url: `https://preview.${target.projectName}.pages.dev`, deploymentId: `noop-preview-${Date.now()}` };
  }

  async promote({ target }: { target: DeployTarget; distDir: string }): Promise<DeployResult> {
    return { url: `https://${target.projectName}.pages.dev`, deploymentId: `noop-production-${Date.now()}` };
  }
}
