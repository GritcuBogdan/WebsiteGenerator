import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverContentLibrary } from "./discover.js";

let rootDir: string;

async function writeEntry(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

before(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "content-library-test-"));

  await writeEntry(
    "en-US/intro/intro-001.md",
    ["---", "id: intro-001", "component: intro", "---", "{{BRAND_NAME}} welcomes new players."].join("\n"),
  );
  await writeEntry(
    "en-US/bonus/bonus-001.md",
    [
      "---",
      "id: bonus-001",
      "component: bonus",
      "requires: [welcomeBonus, minimumDeposit]",
      "---",
      "Get {{WELCOME_BONUS}} when you deposit at least {{MINIMUM_DEPOSIT}}.",
    ].join("\n"),
  );
  await writeEntry(
    "en-US/faq/faq-001.md",
    ["---", "id: faq-001", "component: faq", "requires: [minimumDeposit]", "question: What is the minimum deposit?", "---", "It's {{MINIMUM_DEPOSIT}}."].join(
      "\n",
    ),
  );
  // No frontmatter at all — still discoverable, id falls back to the filename.
  await writeEntry("en-US/cta/cta-001.md", "Claim your bonus now.");
  // Two-paragraph body, to check paragraph splitting.
  await writeEntry("en-US/games/games-001.md", ["First paragraph about games.", "", "Second paragraph about games."].join("\n"));

  // Bad entries the fixtures are specifically designed to exercise:
  await writeEntry("en-US/games/games-002.md", ""); // empty file
  await writeEntry("en-US/games/games-003.md", ["---", "id: games-dup", "---", "First with this id."].join("\n"));
  await writeEntry("en-US/games/games-004b.md", ["---", "id: games-dup", "---", "Second with this id."].join("\n")); // duplicate of games-003's id
  await writeEntry(
    "en-US/games/games-004.md",
    ["---", "component: bonus", "---", "Mislabeled component."].join("\n"),
  ); // component mismatch
  await writeEntry("en-US/faq/faq-002.md", ["---", "id: faq-002", "component: faq", "---", "No question field."].join("\n")); // faq missing question

  // A table + list, to check the full file-to-blocks pipeline (parse-blocks.ts's
  // own unit tests cover the parsing logic in isolation).
  await writeEntry(
    "en-US/payments/payments-001.md",
    [
      "---",
      "id: payments-001",
      "requires: [paymentMethods]",
      "---",
      "Available options:",
      "| Method | Fee |",
      "| --- | --- |",
      "| {{PAYMENT_METHODS}} | None |",
    ].join("\n"),
  );

  // A second locale, to check multi-locale discovery.
  await writeEntry(
    "de-DE/intro/intro-001.md",
    ["---", "id: intro-001", "component: intro", "---", "{{BRAND_NAME}} begrüßt neue Spieler."].join("\n"),
  );

  // Page-first layout: topic and section come from the directories, while
  // compatibility is opt-in in frontmatter for a cross-topic block.
  await writeEntry(
    "en-US/slots/intro/slots-intro-001.md",
    ["---", "id: slots-intro-001", "---", "How slots work at {{BRAND_NAME}}."].join("\n"),
  );
  await writeEntry(
    "en-US/mobile/payments/mobile-payments-001.md",
    ["---", "id: mobile-payments-001", "compatibleWith: [payments]", "---", "Mobile payment details."].join("\n"),
  );

  // Reserved top-level dirs must never be treated as locales.
  await writeEntry("skeletons/standard.json", "{}");
});

after(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

test("discovers every well-formed entry across components and locales", async () => {
  const { entries } = await discoverContentLibrary(rootDir);
  const ids = entries.map((entry) => `${entry.locale}/${entry.component}/${entry.id}`).sort();
  assert.deepEqual(ids, [
    "de-DE/intro/intro-001",
    "en-US/bonus/bonus-001",
    "en-US/cta/cta-001",
    "en-US/faq/faq-001",
    "en-US/games/games-001",
    "en-US/games/games-dup",
    "en-US/intro/intro-001",
    "en-US/intro/slots-intro-001",
    "en-US/payments/mobile-payments-001",
    "en-US/payments/payments-001",
  ]);
});

test("a body mixing prose and a table parses into blocks in order, and paragraphs stays prose-only", async () => {
  const { entries } = await discoverContentLibrary(rootDir);
  const payments = entries.find((entry) => entry.id === "payments-001")!;
  assert.deepEqual(payments.blocks, [
    { type: "paragraphs", paragraphs: ["Available options:"] },
    { type: "table", columns: ["Method", "Fee"], rows: [["{{PAYMENT_METHODS}}", "None"]] },
  ]);
  // paragraphs only reflects the prose block — the table's cells (even
  // though one holds a placeholder) never leak into it.
  assert.deepEqual(payments.paragraphs, ["Available options:"]);
});

test("skips reserved top-level directories like skeletons/", async () => {
  const { entries } = await discoverContentLibrary(rootDir);
  assert.ok(!entries.some((entry) => entry.locale === "skeletons"));
});

test("falls back to the filename (minus extension) as id when frontmatter omits it", async () => {
  const { entries } = await discoverContentLibrary(rootDir);
  const cta = entries.find((entry) => entry.sourcePath === "en-US/cta/cta-001.md");
  assert.equal(cta?.id, "cta-001");
});

test("splits body into paragraphs on blank lines", async () => {
  const { entries } = await discoverContentLibrary(rootDir);
  const games = entries.find((entry) => entry.id === "games-001");
  assert.deepEqual(games?.paragraphs, ["First paragraph about games.", "Second paragraph about games."]);
});

test("captures requires from frontmatter as a string array", async () => {
  const { entries } = await discoverContentLibrary(rootDir);
  const bonus = entries.find((entry) => entry.id === "bonus-001");
  assert.deepEqual(bonus?.requires, ["welcomeBonus", "minimumDeposit"]);
});

test("discovers page-first topic/section metadata and explicit cross-topic compatibility", async () => {
  const { entries } = await discoverContentLibrary(rootDir);
  const slotsIntro = entries.find((entry) => entry.id === "slots-intro-001")!;
  assert.equal(slotsIntro.topic, "slots");
  assert.equal(slotsIntro.section, "intro");
  assert.deepEqual(slotsIntro.compatiblePageTypes, []);
  assert.equal(slotsIntro.legacy, false);

  const mobilePayment = entries.find((entry) => entry.id === "mobile-payments-001")!;
  assert.equal(mobilePayment.topic, "mobile");
  assert.equal(mobilePayment.section, "payments");
  assert.deepEqual(mobilePayment.compatiblePageTypes, ["payments"]);
});

test("a faq entry carries its question separately from the answer paragraphs", async () => {
  const { entries } = await discoverContentLibrary(rootDir);
  const faq = entries.find((entry) => entry.component === "faq" && entry.id === "faq-001");
  assert.equal(faq?.question, "What is the minimum deposit?");
  assert.deepEqual(faq?.paragraphs, ["It's {{MINIMUM_DEPOSIT}}."]);
});

test("flags an empty file as an issue and excludes it from entries", async () => {
  const { entries, issues } = await discoverContentLibrary(rootDir);
  assert.ok(!entries.some((entry) => entry.sourcePath === "en-US/games/games-002.md"));
  assert.ok(issues.some((issue) => issue.includes("games-002.md") && issue.includes("empty")));
});

test("flags a duplicate id within the same locale/component and keeps only the first", async () => {
  const { entries, issues } = await discoverContentLibrary(rootDir);
  const dupEntries = entries.filter((entry) => entry.component === "games" && entry.id === "games-dup");
  assert.equal(dupEntries.length, 1);
  assert.equal(dupEntries[0].sourcePath, "en-US/games/games-003.md"); // first one wins
  assert.ok(issues.some((issue) => issue.includes('duplicate id "games-dup"')));
});

test("flags frontmatter whose component contradicts its directory", async () => {
  const { entries, issues } = await discoverContentLibrary(rootDir);
  assert.ok(!entries.some((entry) => entry.sourcePath === "en-US/games/games-004.md"));
  assert.ok(issues.some((issue) => issue.includes("games-004.md") && issue.includes("does not match its directory")));
});

test("flags a faq entry with no question field", async () => {
  const { entries, issues } = await discoverContentLibrary(rootDir);
  assert.ok(!entries.some((entry) => entry.sourcePath === "en-US/faq/faq-002.md"));
  assert.ok(issues.some((issue) => issue.includes("faq-002.md") && issue.includes("question")));
});

test("an entry with no frontmatter has an empty requires array", async () => {
  const { entries } = await discoverContentLibrary(rootDir);
  const cta = entries.find((entry) => entry.id === "cta-001");
  assert.deepEqual(cta?.requires, []);
});

test("returns an issue (not a throw) when the root directory doesn't exist", async () => {
  const result = await discoverContentLibrary(path.join(rootDir, "does-not-exist"));
  assert.deepEqual(result.entries, []);
  assert.equal(result.issues.length, 1);
});
