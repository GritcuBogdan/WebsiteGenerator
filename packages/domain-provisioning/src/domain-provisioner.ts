import type { DeployTarget } from "deploy";

// Runs as part of promoting to production — a preview deployment uses a
// *.pages.dev URL and needs neither of these.
export interface DomainProvisioner {
  ensureCustomDomain(domain: string, target: DeployTarget): Promise<void>;
  // Every casino domain needs its own route into the shared redirect
  // Worker, since /go/<slug> is served relative to whichever domain the
  // visitor is on.
  ensureRedirectWorkerRoute(domain: string): Promise<{ routeId: string }>;
}
