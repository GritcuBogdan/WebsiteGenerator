import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assembleSite } from "./assemble-site.js";
import { validateSite, SiteValidationError } from "./validate-site.js";
import { sampleConfig, sampleParsedContent } from "./test-fixtures.js";

test("a well-formed site passes through unchanged", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  assert.equal(validateSite(casino), casino);
});

test("catches a duplicate page slug", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  casino.pages.push({ ...casino.pages[1] }); // duplicate the "bonus" page
  assert.throws(() => validateSite(casino), (error: unknown) => {
    assert.ok(error instanceof SiteValidationError);
    assert.ok(error.issues.some((issue) => issue.message.includes('duplicate page slug "bonus"')));
    return true;
  });
});

test("catches a nav menu link that doesn't resolve to any page", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  casino.navbar.menu!.push({ name: "Ghost Page", href: "/no-such-page/" });
  assert.throws(() => validateSite(casino), (error: unknown) => {
    assert.ok(error instanceof SiteValidationError);
    assert.ok(error.issues.some((issue) => issue.message.includes("Ghost Page")));
    return true;
  });
});

test("ignores anchor links and external links when checking nav/footer links", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  casino.navbar.menu!.push({ name: "Jump", href: "#somewhere" });
  casino.footer.links!.push({ label: "External", href: "https://example.com" });
  assert.doesNotThrow(() => validateSite(casino));
});

test("collects every issue rather than stopping at the first", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  casino.pages.push({ ...casino.pages[1] });
  casino.navbar.menu!.push({ name: "Ghost", href: "/nope/" });
  try {
    validateSite(casino);
    assert.fail("expected SiteValidationError");
  } catch (error) {
    assert.ok(error instanceof SiteValidationError);
    assert.ok(error.issues.length >= 2);
  }
});

let workDir: string;
before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "validate-site-test-"));
});
after(async () => {
  await rm(workDir, { recursive: true, force: true });
});

test("with imagesDir set, catches a referenced image that doesn't exist on disk", () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  assert.throws(() => validateSite(casino, { imagesDir: workDir }), (error: unknown) => {
    assert.ok(error instanceof SiteValidationError);
    assert.ok(error.issues.some((issue) => issue.path === "images"));
    return true;
  });
});

test("with imagesDir set, passes when every referenced image exists", async () => {
  const casino = assembleSite(sampleParsedContent(), sampleConfig());
  const imagePaths = [
    "sample-casino/logo.png",
    "sample-casino/banner.png",
    "sample-casino/favicon.ico",
  ];
  for (const relativePath of imagePaths) {
    const fullPath = path.join(workDir, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, "fake-image-bytes");
  }
  assert.doesNotThrow(() => validateSite(casino, { imagesDir: workDir }));
});
