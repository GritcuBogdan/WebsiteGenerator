# env

Loads and validates Cloudflare credentials once, in one place, instead of
scattering `process.env.X` reads across `packages/deploy`,
`packages/domain-provisioning`, and `packages/redirects`.

```ts
import { loadEnv, MissingEnvError } from "env";

const cloudflareEnv = loadEnv(); // throws MissingEnvError, listing every
                                  // missing/invalid var at once, if anything's wrong
```

`loadEnv()` reads `.env` (repo root, resolved against `process.cwd()`) if
present, then lets real `process.env` values override it — same precedence
as most `.env` tooling. `.env` is gitignored; copy `.env.example` to `.env`
and fill in real values.

Provider constructors (Phase 8) take a `CloudflareEnv` as a parameter
rather than calling `loadEnv()`/reading `process.env` themselves — that's
what makes them trivial to unit-test with fake credentials, and what keeps
credential loading a single, fail-fast step at CLI startup rather than
something that can fail deep inside a pipeline run.
