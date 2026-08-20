import path from "node:path";

// Intentionally thin per the architecture plan: no plugin registry, no
// dynamic loading, just a lookup table — the seam exists so a second
// template can be added later without changing pipeline code, not because
// this needs to be a general plugin system today.
export type TemplateAdapter = {
  id: string;
  templateDir: string;
};

const TEMPLATE_DIRS: Record<string, string> = {
  "casino-v1": path.join("apps", "templates", "casino-v1"),
  "casino-v2": path.join("apps", "templates", "casino-v2"),
};

export function resolveTemplateAdapter(templateId: string, repoRoot: string): TemplateAdapter {
  const relativeDir = TEMPLATE_DIRS[templateId];
  if (!relativeDir) {
    throw new Error(`Unknown template "${templateId}". Available: ${Object.keys(TEMPLATE_DIRS).join(", ")}`);
  }
  return { id: templateId, templateDir: path.join(repoRoot, relativeDir) };
}
