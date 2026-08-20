import { readdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const releasesDir = path.join(root, "releases");

function removeIfExists(target) {
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`[cleanup-builds] Removed ${target}`);
  }
}

removeIfExists(distDir);
removeIfExists(releasesDir);

const staleRoots = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("dist-"))
  .map((entry) => path.join(root, entry.name));

for (const target of staleRoots) {
  removeIfExists(target);
}

console.log("[cleanup-builds] Cleanup complete.");
