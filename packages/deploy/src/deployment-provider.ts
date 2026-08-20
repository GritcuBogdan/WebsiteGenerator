export type DeployTarget = {
  projectName: string;
  productionBranch: string;
};

export type DeployResult = {
  url: string;
  deploymentId: string;
};

export interface DeploymentProvider {
  // Idempotent: creates the project only if it doesn't already exist.
  ensureProject(target: DeployTarget): Promise<{ created: boolean }>;

  // Cloudflare Pages has no separate "promote this exact build" operation
  // (unlike some platforms) — a preview deploy and a production deploy are
  // both just deployments, distinguished by which branch they target.
  // deployPreview() targets a fixed non-production branch; promote()
  // re-deploys the same distDir targeting target.productionBranch.
  deployPreview(input: { target: DeployTarget; distDir: string }): Promise<DeployResult>;
  promote(input: { target: DeployTarget; distDir: string }): Promise<DeployResult>;
}
