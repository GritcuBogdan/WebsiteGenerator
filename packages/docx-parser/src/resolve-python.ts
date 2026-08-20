import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Resolution order: explicit option > PYTHON_PATH env var > this package's
// own .venv (see python/requirements.txt) if one has been set up > "python"
// on PATH. The .venv check exists so a dev who ran the documented setup
// doesn't also have to export PYTHON_PATH by hand every time.
export function resolvePythonPath(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;

  const venvPython =
    process.platform === "win32"
      ? path.join(packageRoot, ".venv", "Scripts", "python.exe")
      : path.join(packageRoot, ".venv", "bin", "python");

  if (existsSync(venvPython)) return venvPython;

  return "python";
}

export function resolveParserScriptPath(): string {
  return path.join(packageRoot, "python", "casinoParser.py");
}
