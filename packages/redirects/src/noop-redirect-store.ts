import type { RedirectStore } from "./redirect-store.js";

// Backs --dry-run and tests: records what would have been written without
// making a real KV call, and reports it back via getRedirect() so callers
// can assert on it.
export class NoopRedirectStore implements RedirectStore {
  #written = new Map<string, string>();

  async setRedirect(slug: string, affiliateUrl: string): Promise<void> {
    this.#written.set(slug, affiliateUrl);
  }

  async getRedirect(slug: string): Promise<string | null> {
    return this.#written.get(slug) ?? null;
  }
}
