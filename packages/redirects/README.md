# redirects

The Worker serving `/go/<slug>` reads `slug -> affiliateUrl` from
Cloudflare Workers KV; this package is the write (and read-back) side.

```ts
import { CloudflareKVRedirectStore } from "redirects";

const store = new CloudflareKVRedirectStore({ apiToken, accountId, namespaceId });
await store.setRedirect("golisimo", "https://affiliate.example/track?id=golisimo");
await store.getRedirect("golisimo"); // -> the URL, or null if never set
```

KV writes/reads are naturally idempotent (`PUT` overwrites the value for a
key; there's nothing to check-then-create) — unlike `packages/deploy` and
`packages/domain-provisioning`, no extra logic is needed here for that.

Workers KV's value-read endpoint is the one Cloudflare API in this
codebase that doesn't use the standard `{success, result, errors}`
envelope — it returns the raw stored value as the response body, or 404 if
the key doesn't exist. `CloudflareClient.getRawOrNull()` (in
`cloudflare-client`) handles that directly rather than trying to force it
through the envelope-parsing path every other endpoint uses.

`NoopRedirectStore` backs `--dry-run` and tests.
