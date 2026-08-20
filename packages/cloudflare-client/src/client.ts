// Shared low-level HTTP plumbing for packages/deploy, packages/domain-
// provisioning, and packages/redirects: auth header, the standard
// {success, result, errors} response envelope, and error formatting.
// Endpoints here are the ones independently verified against Cloudflare's
// current public API docs (unlike Pages' actual file-upload step, which
// isn't a documented public API — see packages/deploy's README for why
// that one shells out to wrangler instead).

export type CloudflareApiEnvelope<T> = {
  success: boolean;
  result: T;
  errors: Array<{ code: number; message: string }>;
  messages: unknown[];
};

export class CloudflareApiError extends Error {
  readonly status: number;
  readonly errors: Array<{ code: number; message: string }>;

  constructor(status: number, errors: Array<{ code: number; message: string }>) {
    const detail = errors.map((error) => `[${error.code}] ${error.message}`).join("; ") || "unknown error";
    super(`Cloudflare API error (HTTP ${status}): ${detail}`);
    this.name = "CloudflareApiError";
    this.status = status;
    this.errors = errors;
  }
}

export type FetchLike = typeof fetch;

export class CloudflareClient {
  #apiToken: string;
  #fetchImpl: FetchLike;
  #baseUrl: string;

  constructor(
    apiToken: string,
    options: { fetchImpl?: FetchLike; baseUrl?: string } = {},
  ) {
    this.#apiToken = apiToken;
    this.#fetchImpl = options.fetchImpl ?? fetch;
    this.#baseUrl = options.baseUrl ?? "https://api.cloudflare.com/client/v4";
  }

  async get<T>(path: string): Promise<T> {
    return this.#envelopeRequest<T>("GET", path);
  }

  async postJson<T>(path: string, json: unknown): Promise<T> {
    return this.#envelopeRequest<T>("POST", path, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    });
  }

  async putForm<T>(path: string, form: Record<string, string>): Promise<T> {
    const body = new FormData();
    for (const [key, value] of Object.entries(form)) body.append(key, value);
    return this.#envelopeRequest<T>("PUT", path, { body });
  }

  async deleteJson<T>(path: string): Promise<T> {
    return this.#envelopeRequest<T>("DELETE", path);
  }

  // Workers KV's value-read endpoint is the one exception to Cloudflare's
  // usual {success, result, errors} envelope: it returns the raw stored
  // value as the response body. Returns null on a 404 (key not found)
  // rather than throwing, since "no redirect set for this slug yet" is an
  // expected, non-error outcome for callers.
  async getRawOrNull(path: string): Promise<string | null> {
    const response = await this.#fetchImpl(`${this.#baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.#apiToken}` },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new CloudflareApiError(response.status, [{ code: response.status, message: await response.text() }]);
    }
    return response.text();
  }

  async #envelopeRequest<T>(
    method: string,
    path: string,
    init: { headers?: Record<string, string>; body?: BodyInit } = {},
  ): Promise<T> {
    const response = await this.#fetchImpl(`${this.#baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.#apiToken}`, ...init.headers },
      body: init.body,
    });

    const envelope = (await response.json()) as CloudflareApiEnvelope<T>;
    if (!response.ok || !envelope.success) {
      throw new CloudflareApiError(response.status, envelope.errors ?? []);
    }
    return envelope.result;
  }
}
