import { CloudflareClient, type FetchLike } from "cloudflare-client";
import type { RedirectStore } from "./redirect-store.js";

export type CloudflareKVRedirectStoreOptions = {
  apiToken: string;
  accountId: string;
  namespaceId: string;
  fetchImpl?: FetchLike;
};

export class CloudflareKVRedirectStore implements RedirectStore {
  #client: CloudflareClient;
  #accountId: string;
  #namespaceId: string;

  constructor(options: CloudflareKVRedirectStoreOptions) {
    this.#client = new CloudflareClient(options.apiToken, { fetchImpl: options.fetchImpl });
    this.#accountId = options.accountId;
    this.#namespaceId = options.namespaceId;
  }

  async setRedirect(slug: string, affiliateUrl: string): Promise<void> {
    await this.#client.putForm(
      `/accounts/${this.#accountId}/storage/kv/namespaces/${this.#namespaceId}/values/${encodeURIComponent(slug)}`,
      { value: affiliateUrl },
    );
  }

  async getRedirect(slug: string): Promise<string | null> {
    return this.#client.getRawOrNull(
      `/accounts/${this.#accountId}/storage/kv/namespaces/${this.#namespaceId}/values/${encodeURIComponent(slug)}`,
    );
  }
}
