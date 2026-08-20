// Duck-typed rather than `instanceof ZodError`: this workspace's root
// node_modules ends up with zod v4 (pulled in transitively, likely by
// Astro's own toolchain), while every package here declares "zod":
// "^3.24.0" and gets its own locally-nested v3 copy — genuinely different
// major versions, not something npm dedupe can or should collapse. Across
// that boundary, `instanceof` against an imported ZodError class silently
// returns false even for a real Zod validation error, so this checks shape
// instead of identity.
type ZodErrorLike = { name: "ZodError"; issues: Array<{ path: Array<string | number>; message: string }> };

function isZodErrorLike(value: unknown): value is ZodErrorLike {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { name?: unknown }).name === "ZodError" &&
    Array.isArray((value as { issues?: unknown }).issues)
  );
}

function describeCause(cause: unknown): string {
  if (isZodErrorLike(cause)) {
    return cause.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
  }
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

export class PipelineError extends Error {
  readonly stage: string;

  constructor(stage: string, cause: unknown) {
    super(`Pipeline failed at stage "${stage}": ${describeCause(cause)}`, { cause });
    this.name = "PipelineError";
    this.stage = stage;
  }
}
