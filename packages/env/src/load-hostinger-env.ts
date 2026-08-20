import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseDotenv } from "./parse-dotenv.js";
import { hostingerEnvSchema, type HostingerEnv } from "./hostinger-env.js";
import { MissingEnvError } from "./load-env.js";

export type LoadHostingerEnvOptions = {
  envPath?: string;
  env?: NodeJS.ProcessEnv;
};

// Same load/merge/validate shape as loadEnv() — every
// field in hostingerEnvSchema is optional/defaulted, so this never throws
// MissingEnvError itself; it always returns a value, and callers
// (providers.ts) check `.HOSTINGER_API_TOKEN` to decide whether Hostinger
// is actually configured for this run.
export function loadHostingerEnv(options: LoadHostingerEnvOptions = {}): HostingerEnv {
  const envPath = options.envPath ?? path.resolve(process.cwd(), ".env");
  const fileVars = existsSync(envPath) ? parseDotenv(readFileSync(envPath, "utf-8")) : {};
  const processVars = options.env ?? process.env;
  const merged = { ...fileVars, ...processVars };

  const result = hostingerEnvSchema.safeParse(merged);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new MissingEnvError(problems, envPath);
  }

  return result.data;
}
