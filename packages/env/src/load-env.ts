import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseDotenv } from "./parse-dotenv.js";
import { cloudflareEnvSchema, type CloudflareEnv } from "./cloudflare-env.js";

export class MissingEnvError extends Error {
  readonly problems: string[];

  constructor(problems: string[], envPath?: string) {
    super(
      `Missing or invalid environment variables:\n${problems.map((problem) => `  - ${problem}`).join("\n")}\n` +
        (envPath ? `Checked ${envPath} and process.env. ` : "Checked process.env. ") +
        `See .env.example for the full list.`,
    );
    this.name = "MissingEnvError";
    this.problems = problems;
  }
}

export type LoadEnvOptions = {
  // Defaults to ".env" resolved against cwd — the pipeline CLI (Phase 7) is
  // meant to be run from the repo root, matching how most Node tooling
  // resolves a default .env path.
  envPath?: string;
  // Defaults to process.env; overridable so callers (and tests) can inject
  // a fake environment without mutating the real process.env.
  env?: NodeJS.ProcessEnv;
};

// Loads and validates Cloudflare credentials once, in one place, so every
// later stage that needs them (packages/deploy, packages/domain-
// provisioning, packages/redirects) receives an already-validated
// CloudflareEnv through its constructor instead of reading process.env
// itself — fails fast, before any pipeline stage runs, with every missing
// variable listed at once rather than one cryptic failure downstream.
export function loadEnv(options: LoadEnvOptions = {}): CloudflareEnv {
  const envPath = options.envPath ?? path.resolve(process.cwd(), ".env");
  const fileVars = existsSync(envPath) ? parseDotenv(readFileSync(envPath, "utf-8")) : {};
  const processVars = options.env ?? process.env;

  // process.env (real shell-exported vars, e.g. in CI) wins over .env file
  // defaults for any key present in both.
  const merged = { ...fileVars, ...processVars };

  const result = cloudflareEnvSchema.safeParse(merged);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new MissingEnvError(problems, envPath);
  }

  return result.data;
}
