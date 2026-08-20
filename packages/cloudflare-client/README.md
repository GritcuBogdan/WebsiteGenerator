# cloudflare-client

Shared low-level HTTP plumbing for `packages/deploy`, `packages/domain-
provisioning`, and `packages/redirects`: the `Authorization: Bearer`
header, Cloudflare's standard `{success, result, errors}` response
envelope, and `CloudflareApiError` formatting — so those three packages
aren't each reimplementing the same fetch wrapper.

```ts
import { CloudflareClient, CloudflareApiError } from "cloudflare-client";

const client = new CloudflareClient(apiToken);
const project = await client.get(`/accounts/${accountId}/pages/projects/${name}`);
await client.postJson(`/accounts/${accountId}/pages/projects`, { name, production_branch: "production" });
await client.putForm(`/accounts/${accountId}/storage/kv/namespaces/${ns}/values/${key}`, { value });
const raw = await client.getRawOrNull(`/accounts/${accountId}/storage/kv/namespaces/${ns}/values/${key}`); // KV reads aren't envelope-wrapped
```

`fetchImpl` is injectable on every method (constructor option) specifically
so callers can unit-test against a fake `fetch` instead of a real network
call — every test in this repo that touches the Cloudflare API does this.

Covers only endpoints independently verified against Cloudflare's current
public API docs. Notably **does not** cover uploading files to a Pages
project — that's not a documented public API (see `packages/deploy`'s
README for why it shells out to `wrangler` for that one operation
instead).
