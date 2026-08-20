import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { PipelineError } from "./pipeline-error.js";

test("formats a ZodError as one readable path: message per issue, not raw JSON", () => {
  const schema = z.object({ domains: z.array(z.string()), affiliateUrl: z.string() });
  const result = schema.safeParse({});
  const error = new PipelineError("load-config", result.error);

  assert.match(error.message, /domains: Required/);
  assert.match(error.message, /affiliateUrl: Required/);
  assert.doesNotMatch(error.message, /"code":\s*"invalid_type"/); // not a raw JSON dump
});

test("formats a plain Error using its message", () => {
  const error = new PipelineError("build", new Error("astro build exited with code 1"));
  assert.match(error.message, /Pipeline failed at stage "build": astro build exited with code 1/);
});

test("formats a non-Error cause via String()", () => {
  const error = new PipelineError("parse-docx", "something went wrong");
  assert.match(error.message, /something went wrong/);
});

test("exposes the stage name and the original cause", () => {
  const cause = new Error("boom");
  const error = new PipelineError("assemble-site", cause);
  assert.equal(error.stage, "assemble-site");
  assert.equal(error.cause, cause);
});
