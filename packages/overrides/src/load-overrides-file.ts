import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { overridesFileSchema, type OverridesFile } from "./overrides-file.js";

// Returns undefined when the file simply doesn't exist (most sites won't
// need one) — any other problem (invalid JSON, schema violation) throws,
// since a broken overrides file should stop the pipeline, not be treated
// as "no overrides."
export async function loadOverridesFile(path: string): Promise<OverridesFile | undefined> {
  if (!existsSync(path)) return undefined;
  const raw = JSON.parse(await readFile(path, "utf-8"));
  return overridesFileSchema.parse(raw);
}
