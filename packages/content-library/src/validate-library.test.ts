import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateContentLibrary } from "./validate-library.js";

let rootDir: string;

async function writeEntry(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

before(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "validate-library-test-"));

  await writeEntry(
    "en-US/intro/intro-001.md",
    ["---", "id: intro-001", "---", "{{BRAND_NAME}} welcomes new players."].join("\n"),
  );
  // An unknown placeholder — REGULATOR isn't a registered token.
  await writeEntry(
    "en-US/intro/intro-002.md",
    ["---", "id: intro-002", "---", "Licensed by {{REGULATOR}}, {{BRAND_NAME}} welcomes you."].join("\n"),
  );
  // A requires field that isn't a real SiteData field (typo).
  await writeEntry(
    "en-US/bonus/bonus-001.md",
    ["---", "id: bonus-001", "requires: [welcomBonus]", "---", "Get a bonus."].join("\n"),
  );
  // Two FAQ entries asking the same question (different casing/whitespace).
  await writeEntry(
    "en-US/faq/faq-001.md",
    ["---", "id: faq-001", "component: faq", "question: Is this safe?", "---", "Yes."].join("\n"),
  );
  await writeEntry(
    "en-US/faq/faq-002.md",
    ["---", "id: faq-002", "component: faq", "question: is this  safe?", "---", "Absolutely."].join("\n"),
  );
  // A component ("orphan") no skeleton ever references — fine, no issue expected for this one.
  await writeEntry("en-US/orphan/orphan-001.md", ["---", "id: orphan-001", "---", "Nobody uses this."].join("\n"));

  await writeEntry(
    "skeletons/standard.json",
    JSON.stringify({ id: "standard", sections: ["intro", "bonus", "games", "faq"] }),
  );
  await writeEntry(
    "page-types.json",
    JSON.stringify([
      { id: "index", defaultSkeleton: "standard", allowedComponents: ["intro", "bonus", "faq"] }, // "games" missing from allowedComponents but used by the skeleton
      { id: "review", defaultSkeleton: "does-not-exist", allowedComponents: ["intro"] },
    ]),
  );
});

after(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

test("reports basic counts", async () => {
  const result = await validateContentLibrary(rootDir);
  assert.equal(result.entryCount, 6);
  assert.equal(result.skeletonCount, 1);
  assert.equal(result.pageTypeCount, 2);
});

test("flags an unknown placeholder token", async () => {
  const { issues } = await validateContentLibrary(rootDir);
  assert.ok(issues.some((issue) => issue.includes("intro-002.md") && issue.includes("{{REGULATOR}}")));
});

test("flags a requires field that isn't a real data.json field", async () => {
  const { issues } = await validateContentLibrary(rootDir);
  assert.ok(issues.some((issue) => issue.includes("bonus-001.md") && issue.includes('"welcomBonus"')));
});

test("flags duplicate FAQ questions within the same locale, normalized for case/whitespace", async () => {
  const { issues } = await validateContentLibrary(rootDir);
  assert.ok(issues.some((issue) => issue.includes("duplicate FAQ question") && issue.includes("en-US")));
});

test("flags a page type whose defaultSkeleton doesn't exist", async () => {
  const { issues } = await validateContentLibrary(rootDir);
  assert.ok(issues.some((issue) => issue.includes('page type "review"') && issue.includes('"does-not-exist"')));
});

test("flags a skeleton section not present in its page type's allowedComponents", async () => {
  const { issues } = await validateContentLibrary(rootDir);
  assert.ok(issues.some((issue) => issue.includes('page type "index"') && issue.includes("games")));
});

test("flags a skeleton component with no matching library entries in any locale", async () => {
  const { issues } = await validateContentLibrary(rootDir);
  assert.ok(issues.some((issue) => issue.includes('component "games"') && issue.includes("no content-library entries")));
});

test("does not flag a component nothing references (orphan content is fine, unlike orphan skeleton references)", async () => {
  const { issues } = await validateContentLibrary(rootDir);
  assert.ok(!issues.some((issue) => issue.includes("orphan")));
});

test("a clean library produces zero issues", async () => {
  const cleanDir = await mkdtemp(path.join(tmpdir(), "validate-library-clean-"));
  const write = async (relativePath: string, content: string) => {
    const fullPath = path.join(cleanDir, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
  };
  await write("en-US/intro/intro-001.md", ["---", "id: intro-001", "---", "{{BRAND_NAME}} welcomes you."].join("\n"));
  await write("en-US/faq/faq-001.md", ["---", "id: faq-001", "component: faq", "question: Is this safe?", "---", "Yes."].join("\n"));
  await write("skeletons/minimal.json", JSON.stringify({ id: "minimal", sections: ["intro", "faq"] }));
  await write("page-types.json", JSON.stringify([{ id: "index", defaultSkeleton: "minimal", allowedComponents: ["intro", "faq"] }]));

  const result = await validateContentLibrary(cleanDir);
  assert.deepEqual(result.issues, []);

  await rm(cleanDir, { recursive: true, force: true });
});
