import { test } from "node:test";
import assert from "node:assert/strict";
import type { PageType, ParsedSection, Skeleton, SiteData } from "schema";
import type { ContentEntry } from "./discover.js";
import type { EntryBlock } from "./parse-blocks.js";
import { composeContent, type ComposeContentInput } from "./compose-content.js";
import { legacySemanticMetadata } from "./semantic.js";

const LOCALE = "en-US";

// Mirrors what discover.ts actually produces for a plain-prose file (no
// table/list syntax): one "paragraphs" block equal to `paragraphs`. Tests
// that want a table/list entry pass `blocks` explicitly instead.
function entry(partial: Partial<ContentEntry> & Pick<ContentEntry, "id" | "component">): ContentEntry {
  const paragraphs = partial.paragraphs ?? [];
  const defaultBlocks: EntryBlock[] = paragraphs.length > 0 ? [{ type: "paragraphs", paragraphs }] : [];
  return {
    locale: LOCALE,
    requires: [],
    paragraphs,
    blocks: defaultBlocks,
    sourcePath: `${LOCALE}/${partial.component}/${partial.id}.md`,
    ...partial,
  };
}

const library: ContentEntry[] = [
  entry({ id: "intro-001", component: "intro", paragraphs: ["{{BRAND_NAME}} welcomes new players."] }),
  entry({ id: "intro-002", component: "intro", paragraphs: ["Join {{BRAND_NAME}} today."] }),
  entry({ id: "intro-003", component: "intro", paragraphs: ["Play now at {{BRAND_NAME}}."] }),

  entry({ id: "bonus-001", component: "bonus", requires: ["welcomeBonus"], paragraphs: ["Get {{WELCOME_BONUS}} bonus."] }),
  entry({ id: "bonus-002", component: "bonus", requires: ["welcomeBonus"], paragraphs: ["Claim your {{WELCOME_BONUS}} welcome offer."] }),

  entry({ id: "games-001", component: "games", requires: ["gameCount"], paragraphs: ["We have {{GAME_COUNT}} games."] }),

  entry({ id: "bonus-terms-001", component: "bonus-terms", requires: ["minimumDeposit"], paragraphs: ["Terms apply. Minimum deposit {{MINIMUM_DEPOSIT}}."] }),

  entry({ id: "faq-001", component: "faq", question: "Is this safe?", paragraphs: ["Yes, always."] }),
  entry({ id: "faq-002", component: "faq", requires: ["minimumDeposit"], question: "What is the minimum deposit?", paragraphs: ["It's {{MINIMUM_DEPOSIT}}."] }),
  entry({ id: "faq-003", component: "faq", question: "Can I play on mobile?", paragraphs: ["Yes."] }),
  entry({ id: "faq-004", component: "faq", requires: ["gameCount"], question: "How many games are there?", paragraphs: ["There are {{GAME_COUNT}}."] }),
  entry({ id: "faq-005", component: "faq", requires: ["paymentMethods"], question: "What payment methods are supported?", paragraphs: ["{{PAYMENT_METHODS}}."] }),

  entry({ id: "cta-001", component: "cta", paragraphs: ["Join now!"] }),
  entry({ id: "cta-002", component: "cta", paragraphs: ["Sign up today!"] }),

  entry({ id: "privacy-policy", component: "legal", paragraphs: ["We respect your privacy."] }),
  entry({ id: "terms-conditions", component: "legal", paragraphs: ["These are our terms."] }),
];

const skeletons: Skeleton[] = [
  { id: "standard", sections: ["intro", "bonus", "games", "faq", "cta"] },
  { id: "bonus-focused", sections: ["intro", "bonus", "bonus-terms", "faq", "cta"] },
  { id: "minimal", sections: ["intro"] },
  // No matching library entries for these three components on purpose —
  // mirrors the real content-library today (page-types.json references
  // them, no .md content authored yet), so no-deposit-bonus/free-spins/
  // promo-code correctly get "no eligible content" until that changes,
  // the same graceful-degradation every other page already has.
  { id: "no-deposit-focused", sections: ["intro", "no-deposit-bonus"] },
  { id: "free-spins-focused", sections: ["intro", "free-spins"] },
  { id: "promo-code-focused", sections: ["intro", "promo-code"] },
];

const pageTypes: PageType[] = [
  { id: "index", defaultSkeleton: "standard", allowedComponents: ["intro", "bonus", "games", "bonus-terms", "faq", "cta"] },
  { id: "review", defaultSkeleton: "standard", allowedComponents: ["intro", "bonus", "games", "bonus-terms", "faq", "cta"] },
  { id: "bonus", defaultSkeleton: "bonus-focused", allowedComponents: ["intro", "bonus", "bonus-terms", "faq", "cta"] },
  { id: "withdrawal", defaultSkeleton: "minimal", allowedComponents: ["intro"] },
  { id: "slots", defaultSkeleton: "minimal", allowedComponents: ["intro"] },
  { id: "login", defaultSkeleton: "minimal", allowedComponents: ["intro"] },
  { id: "application", defaultSkeleton: "minimal", allowedComponents: ["intro"] },
  { id: "no-deposit-bonus", defaultSkeleton: "no-deposit-focused", allowedComponents: ["intro", "no-deposit-bonus"] },
  { id: "free-spins", defaultSkeleton: "free-spins-focused", allowedComponents: ["intro", "free-spins"] },
  { id: "promo-code", defaultSkeleton: "promo-code-focused", allowedComponents: ["intro", "promo-code"] },
];

const FULL_SITE_DATA: SiteData = {
  brandName: "LuckySpin",
  welcomeBonus: { amount: 500, currency: "EUR", percentage: 100 },
  minimumDeposit: 10,
  gameCount: 2000,
  paymentMethods: ["Visa", "Mastercard"],
};

const MINIMAL_SITE_DATA: SiteData = { brandName: "LuckySpin" };

function baseInput(overrides: Partial<ComposeContentInput> = {}): ComposeContentInput {
  return {
    slug: "luckyspin",
    locale: LOCALE,
    siteData: FULL_SITE_DATA,
    contentVersion: "v1",
    library,
    skeletons,
    pageTypes,
    ...overrides,
  };
}

function textSection(page: { sections: ParsedSection[] }, id: string) {
  const section = page.sections.find((s) => s.id === id);
  assert.ok(section, `expected a "${id}" section`);
  assert.equal(section!.type, "text");
  return section as Extract<ParsedSection, { type: "text" }>;
}

test("composes every default + opportunistic-legal page when every fact is present", () => {
  const { content, issues } = composeContent(baseInput());
  assert.ok(content, `expected content, got issues: ${issues.join("; ")}`);
  const slugs = content!.pages.map((p) => p.slug).sort();
  // no-deposit-bonus/free-spins/promo-code still appear (intro-only —
  // their dedicated component has zero library entries in this fixture,
  // mirroring the real content-library today), same partial-success
  // posture as any page whose skeleton is only half-satisfied.
  assert.deepEqual(slugs, [
    "application",
    "bonus",
    "free-spins",
    "index",
    "login",
    "no-deposit-bonus",
    "privacy-policy",
    "promo-code",
    "registration",
    "review",
    "slots",
    "terms-conditions",
    "withdrawal",
  ]);
});

test("no-deposit-bonus/free-spins/promo-code pages only get their dedicated section once matching content and facts exist", () => {
  const extraLibrary: ContentEntry[] = [
    ...library,
    entry({ id: "no-deposit-bonus-001", component: "no-deposit-bonus", requires: ["noDepositBonus"], paragraphs: ["Claim {{NO_DEPOSIT_BONUS}} with no deposit."] }),
    entry({ id: "free-spins-001", component: "free-spins", requires: ["freeSpins"], paragraphs: ["Get {{FREE_SPINS_COUNT}} free spins."] }),
    entry({ id: "promo-code-001", component: "promo-code", requires: ["promoCode"], paragraphs: ["Enter code {{PROMO_CODE}} at signup."] }),
  ];
  const siteData: SiteData = {
    ...FULL_SITE_DATA,
    noDepositBonus: { amount: 20, currency: "EUR" },
    freeSpins: { count: 50 },
    promoCode: "WELCOME50",
  };

  const { content } = composeContent(baseInput({ library: extraLibrary, siteData }));

  const noDeposit = content!.pages.find((p) => p.slug === "no-deposit-bonus")!;
  assert.deepEqual(noDeposit.sections.map((s) => s.id).sort(), ["intro", "no-deposit-bonus"]);

  const freeSpins = content!.pages.find((p) => p.slug === "free-spins")!;
  assert.deepEqual(freeSpins.sections.map((s) => s.id).sort(), ["free-spins", "intro"]);

  const promoCode = content!.pages.find((p) => p.slug === "promo-code")!;
  assert.deepEqual(promoCode.sections.map((s) => s.id).sort(), ["intro", "promo-code"]);
});

test("no-deposit-bonus/free-spins/promo-code pages fall back to intro-only when their facts are absent", () => {
  const { content } = composeContent(baseInput({ siteData: MINIMAL_SITE_DATA }));
  for (const slug of ["no-deposit-bonus", "free-spins", "promo-code"]) {
    const page = content!.pages.find((p) => p.slug === slug)!;
    assert.deepEqual(page.sections.map((s) => s.id), ["intro"]);
  }
});

test("index and bonus pages get every skeleton section when data supports all of them", () => {
  const { content } = composeContent(baseInput());
  const index = content!.pages.find((p) => p.slug === "index")!;
  assert.deepEqual(index.sections.map((s) => s.id).sort(), ["bonus", "cta", "faq", "games", "intro"]);

  const bonus = content!.pages.find((p) => p.slug === "bonus")!;
  assert.deepEqual(bonus.sections.map((s) => s.id).sort(), ["bonus", "bonus-terms", "cta", "faq", "intro"]);
});

test("a legal page composes a single 'legal' text section", () => {
  const { content } = composeContent(baseInput());
  const privacy = content!.pages.find((p) => p.slug === "privacy-policy")!;
  assert.equal(privacy.sections.length, 1);
  assert.equal(privacy.sections[0].id, "legal");
});

test("a generic shared/intro entry is eligible for a real 'registration' page type", () => {
  // Mirrors what discover.ts actually produces for content-library/<locale>/
  // shared/intro/*.md: compatiblePageTypes falls back to legacySemanticMetadata
  // ("intro")'s ALL_PAGE_TYPES list, which must include every real page type
  // id ever added — "registration" was missing from it, silently starving
  // registration pages of the shared intro fallback whenever the topic
  // (login/registration) has no intro content of its own.
  const sharedIntro = entry({
    id: "intro-shared-001",
    component: "intro",
    topic: "shared",
    section: "intro",
    compatiblePageTypes: legacySemanticMetadata("intro").compatiblePageTypes,
    paragraphs: ["Welcome to {{BRAND_NAME}}."],
  });
  const registrationPageType: PageType = { id: "registration", defaultSkeleton: "minimal", allowedComponents: ["intro"] };

  const { content, issues } = composeContent(
    baseInput({ library: [...library, sharedIntro], pageTypes: [...pageTypes, registrationPageType] }),
  );

  assert.ok(content, `expected content, got issues: ${issues.join("; ")}`);
  const registration = content!.pages.find((p) => p.slug === "registration")!;
  assert.ok(registration, "expected a registration page");
  assert.deepEqual(registration.sections.map((s) => s.id), ["intro"]);
});

test("page and section titles are locale-aware (labels.ts), not hardcoded English humanizeSlug output", () => {
  const deLocale = "de-DE";
  const deLibrary: ContentEntry[] = [
    entry({ id: "de-intro-001", component: "intro", locale: deLocale, paragraphs: ["{{BRAND_NAME}} begrüßt neue Spieler."] }),
    entry({ id: "de-games-001", component: "games", locale: deLocale, requires: ["gameCount"], paragraphs: ["Wir haben {{GAME_COUNT}} Spiele."] }),
    entry({ id: "de-faq-001", component: "faq", locale: deLocale, question: "Ist das sicher?", paragraphs: ["Ja, immer."] }),
    entry({ id: "de-cta-001", component: "cta", locale: deLocale, paragraphs: ["Jetzt beitreten!"] }),
  ];

  const { content, issues } = composeContent(
    baseInput({ locale: deLocale, library: deLibrary, siteData: FULL_SITE_DATA }),
  );
  assert.ok(content, `expected content, got issues: ${issues.join("; ")}`);
  const index = content!.pages.find((p) => p.slug === "index")!;

  // Page title: humanizeSlug("index") would be English "Home".
  assert.equal(index.title, "Startseite");
  // Section title: humanizeSlug("games") would be English "Games".
  const games = textSection(index, "games");
  assert.equal(games.title, "Spiele");
});

test("skips components with missing facts instead of fabricating content, and still builds the page from what's eligible", () => {
  const { content, issues } = composeContent(baseInput({ siteData: MINIMAL_SITE_DATA }));
  assert.ok(content);

  const index = content!.pages.find((p) => p.slug === "index")!;
  // bonus and games both require facts MINIMAL_SITE_DATA doesn't have.
  assert.deepEqual(index.sections.map((s) => s.id).sort(), ["cta", "faq", "intro"]);
  assert.ok(issues.some((issue) => issue.includes('page "index"') && issue.includes('"bonus"')));
  assert.ok(issues.some((issue) => issue.includes('page "index"') && issue.includes('"games"')));
});

test("faq picks fewer than the target count when fewer entries are eligible", () => {
  const { content } = composeContent(baseInput({ siteData: MINIMAL_SITE_DATA }));
  const index = content!.pages.find((p) => p.slug === "index")!;
  const faq = index.sections.find((s) => s.id === "faq")! as Extract<ParsedSection, { type: "faq" }>;
  // Only faq-001 and faq-003 have no requires; faq-002/004/005 all need
  // facts MINIMAL_SITE_DATA doesn't supply.
  assert.equal(faq.items.length, 2);
});

test("faq caps at the eligible pool size when it's smaller than the target count (6)", () => {
  const { content } = composeContent(baseInput());
  const index = content!.pages.find((p) => p.slug === "index")!;
  const faq = index.sections.find((s) => s.id === "faq")! as Extract<ParsedSection, { type: "faq" }>;
  // The fixture library only has 5 faq entries total, all eligible under
  // FULL_SITE_DATA — fewer than FAQ_ITEM_COUNT (6), so all 5 get picked.
  assert.equal(faq.items.length, 5);
  assert.equal(new Set(faq.items.map((item) => item.question)).size, 5); // no repeats
});

test("faq caps at the target count (6) when more entries are eligible than that", () => {
  const extraLibrary: ContentEntry[] = [
    ...library,
    entry({ id: "faq-006", component: "faq", question: "Do you offer live dealer games?", paragraphs: ["Yes."] }),
    entry({ id: "faq-007", component: "faq", question: "Can I self-exclude my account?", paragraphs: ["Yes, at any time."] }),
  ];
  const { content } = composeContent(baseInput({ library: extraLibrary }));
  const index = content!.pages.find((p) => p.slug === "index")!;
  const faq = index.sections.find((s) => s.id === "faq")! as Extract<ParsedSection, { type: "faq" }>;
  // Now 7 eligible entries exist, more than FAQ_ITEM_COUNT (6) — capped at 6.
  assert.equal(faq.items.length, 6);
  assert.equal(new Set(faq.items.map((item) => item.question)).size, 6); // no repeats
});

test("never leaves an unresolved {{TOKEN}} anywhere in composed output", () => {
  const { content } = composeContent(baseInput());
  const allText = content!.pages
    .flatMap((page) => page.sections)
    .flatMap((section) => {
      if (section.type === "text") return section.paragraphs;
      if (section.type === "faq") return section.items.flatMap((item) => [item.question, item.answer]);
      return [];
    })
    .join("\n");
  assert.ok(!allText.includes("{{"), `found an unresolved placeholder: ${allText}`);
});

test("an entry with a table block composes a 'content' section, not 'text'", () => {
  const extraLibrary: ContentEntry[] = [
    ...library,
    entry({
      id: "bonus-terms-002",
      component: "bonus-terms",
      requires: ["minimumDeposit"],
      blocks: [
        { type: "paragraphs", paragraphs: ["Deposit terms at a glance:"] },
        { type: "table", columns: ["Tier", "Minimum"], rows: [["Standard", "{{MINIMUM_DEPOSIT}}"]] },
      ],
    }),
  ];
  // Force the deterministic pick onto our new table entry by making it the
  // only eligible "bonus-terms" candidate for this run.
  const tableOnlyLibrary = extraLibrary.filter((e) => e.component !== "bonus-terms" || e.id === "bonus-terms-002");

  const { content } = composeContent(baseInput({ library: tableOnlyLibrary, siteData: { ...FULL_SITE_DATA, pages: ["bonus"] } }));
  const bonusPage = content!.pages.find((p) => p.slug === "bonus")!;
  const section = bonusPage.sections.find((s) => s.id === "bonus-terms")!;

  assert.equal(section.type, "content");
  if (section.type !== "content") throw new Error("unreachable");
  assert.deepEqual(section.blocks[0], { type: "text", paragraphs: ["Deposit terms at a glance:"] });
  // FULL_SITE_DATA's minimumDeposit formats using welcomeBonus's currency (EUR).
  assert.deepEqual(section.blocks[1], { type: "table", columns: ["Tier", "Minimum"], rows: [["Standard", "€10"]] });
});

test("a table entry whose facts are missing is ineligible, same as any other component", () => {
  const extraLibrary: ContentEntry[] = [
    ...library,
    entry({
      id: "bonus-terms-002",
      component: "bonus-terms",
      requires: ["minimumDeposit"],
      blocks: [{ type: "table", columns: ["Tier", "Minimum"], rows: [["Standard", "{{MINIMUM_DEPOSIT}}"]] }],
    }),
  ];
  const { content } = composeContent(baseInput({ library: extraLibrary, siteData: MINIMAL_SITE_DATA, skeletons: [{ id: "bonus-focused", sections: ["intro", "bonus-terms"] }], pageTypes: [{ id: "bonus", defaultSkeleton: "bonus-focused", allowedComponents: ["intro", "bonus-terms"] }] }));
  const bonusPage = content!.pages.find((p) => p.slug === "bonus")!;
  assert.ok(!bonusPage.sections.some((s) => s.id === "bonus-terms"));
});

test("an entry with a list block composes a 'content' section with the list intact", () => {
  const extraLibrary: ContentEntry[] = [
    entry({ id: "intro-001", component: "intro", paragraphs: ["{{BRAND_NAME}} welcomes new players."] }),
    entry({
      id: "games-featured-001",
      component: "games-featured",
      blocks: [{ type: "list", title: "Popular categories", items: ["Slots", "Table games", "Live dealer"] }],
    }),
    entry({ id: "faq-001", component: "faq", question: "Is this safe?", paragraphs: ["Yes, always."] }),
    entry({ id: "cta-001", component: "cta", paragraphs: ["Join now!"] }),
  ];
  const listSkeletons: Skeleton[] = [{ id: "games-list", sections: ["intro", "games-featured", "faq", "cta"] }];
  const listPageTypes: PageType[] = [{ id: "index", defaultSkeleton: "games-list", allowedComponents: ["intro", "games-featured", "faq", "cta"] }];

  const { content } = composeContent(baseInput({ library: extraLibrary, skeletons: listSkeletons, pageTypes: listPageTypes, siteData: { ...FULL_SITE_DATA, pages: ["index"] } }));
  const index = content!.pages.find((p) => p.slug === "index")!;
  const section = index.sections.find((s) => s.id === "games-featured")!;

  assert.equal(section.type, "content");
  if (section.type !== "content") throw new Error("unreachable");
  assert.deepEqual(section.blocks, [{ type: "list", title: "Popular categories", items: ["Slots", "Table games", "Live dealer"] }]);
});

test("an entry with only plain paragraphs still composes a 'text' section, unchanged", () => {
  const { content } = composeContent(baseInput());
  const index = content!.pages.find((p) => p.slug === "index")!;
  const intro = textSection(index, "intro");
  assert.equal(intro.type, "text");
});

test("drops a page entirely (no issue-free empty page) when none of its sections have eligible content, but keeps composing the rest", () => {
  const vipSkeletons: Skeleton[] = [...skeletons, { id: "vip-only", sections: ["vip-perks"] }];
  const vipPageTypes: PageType[] = [...pageTypes, { id: "vip", defaultSkeleton: "vip-only", allowedComponents: ["vip-perks"] }];

  const { content, issues, report } = composeContent(
    baseInput({ siteData: { ...FULL_SITE_DATA, pages: ["index", "vip"] }, skeletons: vipSkeletons, pageTypes: vipPageTypes }),
  );

  assert.ok(content);
  assert.deepEqual(content!.pages.map((p) => p.slug), ["index"]);
  assert.ok(!report.some((r) => r.slug === "vip"));
  assert.ok(issues.some((issue) => issue.includes('page "vip"') && issue.includes("skipped")));
});

test("returns content: undefined when composition produces zero pages", () => {
  const vipSkeletons: Skeleton[] = [{ id: "vip-only", sections: ["vip-perks"] }];
  const vipPageTypes: PageType[] = [{ id: "vip", defaultSkeleton: "vip-only", allowedComponents: ["vip-perks"] }];

  const { content, issues } = composeContent(
    baseInput({ siteData: { ...FULL_SITE_DATA, pages: ["vip"] }, skeletons: vipSkeletons, pageTypes: vipPageTypes }),
  );

  assert.equal(content, undefined);
  assert.ok(issues.some((issue) => issue.includes("zero pages")));
});

test("legal pages are opportunistic only when siteData.pages is unset — explicit pages lists are taken literally", () => {
  const { content } = composeContent(baseInput({ siteData: { ...FULL_SITE_DATA, pages: ["index"] } }));
  assert.deepEqual(content!.pages.map((p) => p.slug), ["index"]);
});

test("an explicitly requested legal page with no matching library entry fails with an issue, not a silent skip", () => {
  const { content, issues } = composeContent(baseInput({ siteData: { ...FULL_SITE_DATA, pages: ["index", "betting-rules"] } }));
  assert.deepEqual(content!.pages.map((p) => p.slug), ["index"]);
  assert.ok(issues.some((issue) => issue.includes('page "betting-rules"') && issue.includes("no eligible legal content")));
});

test("each page's report includes a positive word count and a stable content hash", () => {
  const { report } = composeContent(baseInput());
  const index = report.find((r) => r.slug === "index")!;
  assert.ok(index.wordCount > 0);
  assert.match(index.contentHash, /^[0-9a-f]{64}$/);
});

test("two pages with different composed text get different content hashes", () => {
  const { report } = composeContent(baseInput());
  const index = report.find((r) => r.slug === "index")!;
  const withdrawal = report.find((r) => r.slug === "withdrawal")!;
  assert.notEqual(index.contentHash, withdrawal.contentHash);
});

test("composition is deterministic — identical input produces identical output", () => {
  const resultA = composeContent(baseInput());
  const resultB = composeContent(baseInput());
  assert.deepEqual(resultA, resultB);
});

test("semantic selection rejects unrelated Mobile and Payments blocks on a Slots page", () => {
  const semanticLibrary: ContentEntry[] = [
    entry({
      id: "slots-intro-001",
      component: "intro",
      topic: "slots",
      section: "intro",
      paragraphs: ["Slots-specific introduction."],
    }),
    entry({
      id: "mobile-intro-001",
      component: "intro",
      topic: "mobile",
      section: "intro",
      paragraphs: ["Mobile-specific introduction."],
    }),
    entry({
      id: "payments-intro-001",
      component: "intro",
      topic: "payments",
      section: "intro",
      paragraphs: ["Payments-specific introduction."],
    }),
  ];
  const result = composeContent(
    baseInput({
      library: semanticLibrary,
      siteData: { brandName: "LuckySpin", pages: ["slots"] },
      skeletons: [{ id: "slots-semantic", sections: ["intro"] }],
      pageTypes: [{ id: "slots", defaultSkeleton: "slots-semantic", allowedComponents: ["intro"], requiredSections: ["intro"] }],
    }),
  );

  assert.ok(result.content);
  const intro = result.content!.pages[0].sections[0];
  assert.equal(intro.type, "text");
  if (intro.type === "text") assert.deepEqual(intro.paragraphs, ["Slots-specific introduction."]);
});

test("a cross-topic block is accepted only when explicitly marked compatible", () => {
  const compatible = entry({
    id: "mobile-slots-intro-001",
    component: "intro",
    topic: "mobile",
    section: "intro",
    compatiblePageTypes: ["slots"],
    paragraphs: ["Mobile slots introduction."],
  });
  const result = composeContent(
    baseInput({
      library: [compatible],
      siteData: { brandName: "LuckySpin", pages: ["slots"] },
      skeletons: [{ id: "slots-semantic", sections: ["intro"] }],
      pageTypes: [{ id: "slots", defaultSkeleton: "slots-semantic", allowedComponents: ["intro"] }],
    }),
  );
  assert.ok(result.content);
  const section = result.content!.pages[0].sections[0];
  assert.equal(section.type, "text");
  if (section.type === "text") assert.deepEqual(section.paragraphs, ["Mobile slots introduction."]);
});

test("a Login page receives Login-specific content and rejects a Payments block", () => {
  const result = composeContent(
    baseInput({
      library: [
        entry({
          id: "login-intro-001",
          component: "intro",
          topic: "shared",
          section: "intro",
          compatiblePageTypes: ["login"],
          paragraphs: ["Login overview."],
        }),
        entry({
          id: "login-access-001",
          component: "account-access",
          topic: "login",
          section: "account-access",
          paragraphs: ["How to access your account."],
        }),
        entry({
          id: "payments-access-001",
          component: "account-access",
          topic: "payments",
          section: "account-access",
          paragraphs: ["Payment access details."],
        }),
      ],
      siteData: { brandName: "LuckySpin", pages: ["login"] },
      skeletons: [{ id: "login-semantic", sections: ["intro", "account-access"] }],
      pageTypes: [{ id: "login", defaultSkeleton: "login-semantic", allowedComponents: ["intro", "account-access"], requiredSections: ["intro"] }],
    }),
  );

  assert.ok(result.content);
  const login = result.content!.pages[0];
  assert.deepEqual(login.sections.map((section) => section.id), ["intro", "account-access"]);
  const access = login.sections[1];
  assert.equal(access.type, "text");
  if (access.type === "text") assert.deepEqual(access.paragraphs, ["How to access your account."]);
});

test("a different contentVersion can select different content (statistical check across several versions)", () => {
  const picks = new Set<string>();
  for (const version of ["v1", "v2", "v3", "v4", "v5", "v6"]) {
    const { content } = composeContent(baseInput({ contentVersion: version }));
    const index = content!.pages.find((p) => p.slug === "index")!;
    const intro = textSection(index, "intro");
    picks.add(intro.paragraphs[0]);
  }
  assert.ok(picks.size > 1, "expected at least two different intro variants across 6 content versions");
});

test("the selection report's chosen id matches what's actually in the composed section", () => {
  const { content, report } = composeContent(baseInput());
  const index = content!.pages.find((p) => p.slug === "index")!;
  const indexReport = report.find((r) => r.slug === "index")!;
  const cta = textSection(index, "cta");

  const pickedId = indexReport.components.cta[0];
  const expectedText: Record<string, string> = { "cta-001": "Join now!", "cta-002": "Sign up today!" };
  assert.equal(cta.paragraphs[0], expectedText[pickedId]);
  assert.equal(indexReport.skeleton, "standard");
});
