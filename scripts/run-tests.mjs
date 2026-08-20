#!/usr/bin/env node
// Node's/tsx's `--test <dir>` recursive discovery only matches
// .js/.mjs/.cjs, never .ts, even with a TS loader registered — so package
// "test" scripts call this instead of relying on that discovery. Every
// workspace package sits two levels below the repo root
// (apps/templates/<name> or packages/<name>), which is what the relative
// path back to tsx below assumes.
import { spawnSync } from "node:child_process";
import { glob } from "node:fs/promises";

const files = [];
for await (const file of glob("src/**/*.test.ts")) {
  files.push(file);
}

if (files.length === 0) {
  console.log("No test files found (src/**/*.test.ts).");
  process.exit(0);
}

const result = spawnSync("npx", ["tsx", "--test", ...files], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
