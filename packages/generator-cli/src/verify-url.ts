export type VerifyResult = { ok: boolean; status?: number; error?: string };

export type VerifyUrlOptions = {
  retries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  fetchImpl?: typeof fetch;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exponential backoff for Cloudflare's own propagation delay between a
// deployment/route/domain being created and it actually resolving —
// confirmed via a real deploy that this can meaningfully exceed 10
// seconds even after wrangler reports success, so a short fixed interval
// undercounts real-world propagation. Starts fast (most deploys resolve
// within the first couple of checks) and backs off up to maxDelayMs
// rather than hammering Cloudflare or making every failed check take as
// long as a slow success.
// redirect: "manual" so a 3xx (the /go/<slug> redirect check) counts as
// success without being silently followed.
export async function verifyUrl(url: string, options: VerifyUrlOptions = {}): Promise<VerifyResult> {
  const retries = options.retries ?? 8;
  const maxDelayMs = options.maxDelayMs ?? 15000;
  const fetchImpl = options.fetchImpl ?? fetch;
  let delay = options.initialDelayMs ?? 2000;
  let lastError: string | undefined;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, { method: "GET", redirect: "manual" });
      if (response.status >= 200 && response.status < 400) {
        return { ok: true, status: response.status };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (attempt < retries - 1) {
      await sleep(delay);
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }

  return { ok: false, error: lastError };
}
