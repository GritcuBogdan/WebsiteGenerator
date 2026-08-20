import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { siteProfileSchema, type SiteProfile } from "schema";

export type LoadProfileResult = { ok: true; profile: SiteProfile } | { ok: false; issue: string };

// Loads profiles/<id>.json (architecture doc §12/§35). The file's own
// `id` field must match the id it was requested by — a copy-pasted
// profile file with a stale id would otherwise silently apply under the
// wrong name, the same class of mistake discoverContentLibrary's
// component/locale cross-checks exist to catch.
export function loadProfile(profilesDir: string, id: string): LoadProfileResult {
  const filePath = path.join(profilesDir, `${id}.json`);
  if (!existsSync(filePath)) {
    return { ok: false, issue: `profile "${id}" not found (expected ${filePath})` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (error) {
    return { ok: false, issue: `profile "${id}": invalid JSON (${(error as Error).message})` };
  }

  const result = siteProfileSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, issue: `profile "${id}": ${result.error.message}` };
  }
  if (result.data.id !== id) {
    return { ok: false, issue: `profile "${id}": file's own "id" field is "${result.data.id}", expected "${id}"` };
  }

  return { ok: true, profile: result.data };
}
