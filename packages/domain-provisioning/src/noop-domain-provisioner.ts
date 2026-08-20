import type { DeployTarget } from "deploy";
import type { DomainProvisioner } from "./domain-provisioner.js";

export class NoopDomainProvisioner implements DomainProvisioner {
  #domains = new Set<string>();
  #routes = new Map<string, string>();

  async ensureCustomDomain(domain: string, _target: DeployTarget): Promise<void> {
    this.#domains.add(domain);
  }

  async ensureRedirectWorkerRoute(domain: string): Promise<{ routeId: string }> {
    const existing = this.#routes.get(domain);
    if (existing) return { routeId: existing };
    const routeId = `noop-route-${domain}`;
    this.#routes.set(domain, routeId);
    return { routeId };
  }
}
