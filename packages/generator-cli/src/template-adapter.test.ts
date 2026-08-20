import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveTemplateAdapter } from "./template-adapter.js";

test("resolves casino-v1 to apps/templates/casino-v1 under the given repo root", () => {
  const adapter = resolveTemplateAdapter("casino-v1", "/repo");
  assert.equal(adapter.id, "casino-v1");
  assert.equal(adapter.templateDir, path.join("/repo", "apps", "templates", "casino-v1"));
});

test("resolves casino-v2 to apps/templates/casino-v2 under the given repo root", () => {
  const adapter = resolveTemplateAdapter("casino-v2", "/repo");
  assert.equal(adapter.id, "casino-v2");
  assert.equal(adapter.templateDir, path.join("/repo", "apps", "templates", "casino-v2"));
});

test("throws a clear error for an unknown template id", () => {
  assert.throws(() => resolveTemplateAdapter("not-a-real-template", "/repo"), /Unknown template "not-a-real-template"/);
});
