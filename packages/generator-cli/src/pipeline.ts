import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  siteConfigInputSchema,
  siteDataSchema,
  type Casino,
  type ParsedDocxContent,
  type SiteConfig,
  type SiteConfigInput,
  type SiteData,
} from "schema";
import { parseDocx } from "docx-parser";
import { applyOverrides, loadOverridesFile } from "overrides";
import {
  applyCasinoV1Rules,
  assembleSite,
  buildLanguageOptions,
  resolveDefaultLocale,
  validateSite,
  writeSiteContent,
  writeSeoAssets,
} from "codegen";
import { processImages, generateFavicon, type ImageManifestEntry } from "image-pipeline";
import { composeContent, loadContentLibrary, type LoadedContentLibrary } from "content-library";
import type { DeployTarget } from "deploy";
import type { DomainHandoffResult } from "domain-provisioning";
import { Logger } from "./logger.js";
import { PipelineError } from "./pipeline-error.js";
import { resolveTemplateAdapter } from "./template-adapter.js";
import { resolveContentSource } from "./resolve-content-source.js";
import { resolveSiteConfig } from "./resolve-site-config.js";
import { buildProviders, type Providers } from "./providers.js";
import { verifyUrl, type VerifyResult } from "./verify-url.js";
import { runProvisionDomainStage } from "./provision-domain-stage.js";

// A dedicated favicon.* file at the top level of sites/<slug>/images/ is
// preferred as the favicon source when one exists (a client-provided
// square mark tends to work better at 16x16 than a shrunk full logo);
// falls back to logo.* otherwise. Either way it's still run through
// generateFavicon() for proper multi-size .ico/.png output, and only
// applies when config.json doesn't already specify a favicon explicitly.
const FAVICON_SOURCE_BASENAMES = [
  "favicon.png",
  "favicon.jpg",
  "favicon.jpeg",
  "favicon.webp",
  "logo.png",
  "logo.jpg",
  "logo.jpeg",
  "logo.webp",
];

// A dedicated logo.* file at the top level of sites/<slug>/images/, used
// the same opt-in way as the favicon fallback above: only applies when
// config.json doesn't already set navbar.logo, and only ever points at the
// processed output (never the raw source). process-images preserves a
// plain top-level basename like "logo" as-is (only content-hash-derived
// hero filenames get slugified/deduped) - see process-images.ts's
// dedupeName - so the output path is always predictable without needing
// to search the manifest for it.
const LOGO_SOURCE_BASENAMES = ["logo.png", "logo.jpg", "logo.jpeg", "logo.webp"];

// applyCasinoV1Rules (packages/codegen/src/casino-v1-rules.ts) encodes the
// mandatory casino site *content* contract (fixed navbar order, forced
// login/registration/slots sections, the 6 fixed footer links, UI-chrome
// translations) - not casino-v1's visuals. Every template sharing that
// content contract runs it, despite the "v1" name (kept as-is to avoid
// renaming churn across that file/its tests).
const TEMPLATES_WITH_MANDATORY_CASINO_RULES = new Set(["casino-v1", "casino-v2"]);

const ALL_STAGES = [
  "load-config",
  "parse-docx",
  "apply-overrides",
  "process-images",
  "assemble-site",
  "validate-site",
  "generate-content",
  "generate-seo-assets",
  "build",
  "resolve-deployment-target",
  "deploy-preview",
  "verify-preview",
  "provision-domain",
  "promote-to-production",
  "update-redirect",
  "verify-deployment",
] as const;
export type StageName = (typeof ALL_STAGES)[number];

export type GenerateOptions = {
  // Per the architecture plan, local stages (1-9) always run for real
  // during a dry run — only these remote stages (10+) get stubbed, via
  // Noop* providers (see providers.ts), which need no real credentials.
  dryRun?: boolean;
  // Stops after verify-preview: no domain/route provisioning, no
  // production deploy, no KV redirect write.
  previewOnly?: boolean;
  // Skips every remote stage (10-16) entirely, including
  // resolve-deployment-target — stays fully local, touches neither
  // Cloudflare nor the registry.
  skipDeploy?: boolean;
  // Restricts execution to the named stages — a debugging escape hatch
  // (e.g. re-run just "build" against already-generated .generated/
  // content), not a general dependency-aware stage selector.
  only?: StageName[];
  verbose?: boolean;
  // Suppresses per-stage step/info logging (Logger.step/info) — warn/error
  // still print. For a bulk runner generating many sites concurrently,
  // where 15 stages × N sites of unprefixed console output would be
  // unreadable and could interleave across sites; a single-site run never
  // sets this.
  quiet?: boolean;
  // Defaults to process.cwd() — `generate` is meant to be run from the
  // repo root, same convention astro.config.mjs's SITE_DIR resolution
  // relies on.
  repoRoot?: string;
  // Overrides the composition root's provider selection — mainly for
  // tests; real usage lets buildProviders() pick based on dryRun.
  providers?: Providers;
  // Pre-loaded content-library/skeletons/page-types (content-library's
  // loadContentLibrary()) — lets a future bulk runner load it once and
  // pass it into every site's generate() call instead of each call
  // re-reading disk (architecture doc §52/§53). A single-site run (the
  // CLI's normal `generate <site-dir>` path) omits this and the
  // "library" contentSource branch below loads it fresh itself. Unused
  // entirely for contentSource: "docx" sites.
  contentLibrary?: LoadedContentLibrary;
};

export type GenerateResult = {
  slug: string;
  siteDir: string;
  dryRun: boolean;
  locales: string[];
  pageCounts: Record<string, number>;
  imagesProcessed: number;
  faviconGenerated: boolean;
  buildDurationMs: number;
  distDir: string;
  warnings: string[];
  previewUrl?: string;
  productionUrl?: string;
  domainsProvisioned: string[];
  domainHandoff: DomainHandoffResult[];
  redirectSet: boolean;
  verifyPreview?: VerifyResult;
  verifyProduction?: VerifyResult;
  verifyRedirect?: VerifyResult;
};

function shouldRun(stage: StageName, only: StageName[] | undefined): boolean {
  return !only || only.includes(stage);
}

function readTemplateVersion(templateDir: string): string {
  const pkgPath = path.join(templateDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

// Orchestrates the full pipeline (load-config through verify-deployment)
// for one site directory. Stops on the first failure, wrapping the
// underlying error in a PipelineError that names the stage it happened in.
//
// Deviates from the architecture doc's stage *numbering* in one way,
// deliberately: process-images runs before assemble-site/validate-site
// rather than after, because (a) validate-site's "referenced images exist"
// check is meaningless before images have been processed, and (b)
// automatic favicon generation needs to resolve before assemble-site so
// the generated path can be embedded in the assembled Casino.
//
// Preview and production are both real deployments in Cloudflare Pages'
// model (there's no separate "promote this exact build" operation) — see
// packages/deploy's DeploymentProvider for how deployPreview/promote map
// onto that.
export async function generate(siteDir: string, options: GenerateOptions = {}): Promise<GenerateResult> {
  const logger = new Logger(options.verbose ?? false, options.quiet ?? false);
  const repoRoot = options.repoRoot ?? process.cwd();
  const only = options.only;
  const warnings: string[] = [];
  const generatedDir = path.join(siteDir, ".generated");
  // Unconditional, regardless of contentSource or which stages run: the
  // "library" branch below also creates this (to write content-report.json)
  // but the "docx" path never did on its own — a docx site with no images/
  // directory (so process-images never creates it either) would otherwise
  // crash writing summary.json at the very end, after every real stage had
  // already succeeded (found via the Phase 10 regression pass).
  mkdirSync(generatedDir, { recursive: true });

  logger.step("load-config");
  const configPath = path.join(siteDir, "config.json");
  if (!existsSync(configPath)) {
    throw new PipelineError("load-config", new Error(`Missing config.json at ${configPath}`));
  }
  let rawConfig: SiteConfigInput;
  try {
    rawConfig = siteConfigInputSchema.parse(JSON.parse(readFileSync(configPath, "utf-8")));
  } catch (error) {
    throw new PipelineError("load-config", error);
  }

  // Resolves config.json against profiles/_base.json + a named profile
  // (architecture doc §35) before anything else ever sees it — a site
  // that omits template/theme/navbar/banner entirely because a profile
  // supplies them looks, to every later stage, identical to one that
  // wrote those fields out by hand. See resolve-site-config.ts.
  const profilesDir = path.join(repoRoot, "profiles");
  const configResolution = resolveSiteConfig(rawConfig, profilesDir);
  if (!configResolution.ok) {
    throw new PipelineError("load-config", new Error(configResolution.issue));
  }
  let config: SiteConfig = configResolution.config;
  logger.info(`  "${config.slug}", ${config.locales.length} locale(s): ${config.locales.map((l) => l.code).join(", ")}`);

  // sites/<slug>/data.json — the site's verified facts. Loaded HERE, before
  // the parse-docx stage's contentSource branch, rather than inside that
  // branch's "library" arm where it used to live: a docx-sourced site's
  // pages need exactly the same brandName/geo/welcomeBonus facts for their
  // SEO title and description as a library-composed site's do, and a docx
  // supplies none of them. Absent is fine for a docx site (every field is
  // optional, and nothing downstream invents a fact the file doesn't
  // state); the "library" arm below still requires it, since content
  // composition has nothing to compose from without it. Malformed content
  // — including a `geo` that isn't an uppercase ISO 3166-1 alpha-2 code —
  // now fails at load-config, before any stage does real work.
  const dataPath = path.join(siteDir, "data.json");
  let siteData: SiteData | undefined;
  if (existsSync(dataPath)) {
    try {
      siteData = siteDataSchema.parse(JSON.parse(readFileSync(dataPath, "utf-8")));
    } catch (error) {
      throw new PipelineError("load-config", error);
    }
  }

  // "parse-docx" is a legacy name kept as-is (avoiding stage-name churn
  // for the CLI's --only= surface) even though it now covers both input
  // modes — see the architecture doc's §00/§09: composeContent() and
  // parseDocx() are two producers of the exact same ParsedDocxContent
  // shape, so everything from apply-overrides onward neither knows nor
  // cares which one ran.
  const parsedByLocale = new Map<string, ParsedDocxContent>();
  if (shouldRun("parse-docx", only)) {
    logger.step("parse-docx");

    const contentSourceResolution = resolveContentSource(config, siteDir);
    if (!contentSourceResolution.ok) {
      throw new PipelineError("parse-docx", new Error(contentSourceResolution.issue));
    }

    if (contentSourceResolution.contentSource === "docx") {
      for (const localeConfig of config.locales) {
        if (!localeConfig.docx) {
          throw new PipelineError(
            "parse-docx",
            new Error(`Locale "${localeConfig.code}" has contentSource "docx" but no "docx" filename set in config.json.`),
          );
        }
        const docxPath = path.join(siteDir, localeConfig.docx);
        try {
          const parsed = await parseDocx(docxPath, localeConfig.code);
          parsedByLocale.set(localeConfig.code, parsed);
          logger.info(`  ${localeConfig.code}: ${parsed.pages.length} page(s) from ${localeConfig.docx}`);
        } catch (error) {
          throw new PipelineError("parse-docx", error);
        }
      }
    } else {
      // "library": data.json + content-library/ replace the docx as this
      // site's input. The file itself was already read and validated above
      // (it is not library-only any more) — only its presence still has to
      // be enforced here, where it is genuinely mandatory.
      if (!siteData) {
        throw new PipelineError(
          "parse-docx",
          new Error(`Missing data.json at ${dataPath} — a "library" site composes its pages from it.`),
        );
      }

      const library = options.contentLibrary ?? (await loadContentLibrary(path.join(repoRoot, "content-library")));
      if (library.issues.length > 0) {
        warnings.push(...library.issues.map((issue) => `content library: ${issue}`));
      }

      const contentVersion = siteData.contentVersion ?? "v1";
      const reportByLocale: Record<string, { pages: unknown; issues: string[] }> = {};

      for (const localeConfig of config.locales) {
        const result = composeContent({
          slug: config.slug,
          locale: localeConfig.code,
          siteData,
          contentVersion,
          library: library.entries,
          skeletons: library.skeletons,
          pageTypes: library.pageTypes,
        });

        if (!result.content) {
          throw new PipelineError(
            "parse-docx",
            new Error(`Content composition produced no pages for locale "${localeConfig.code}":\n${result.issues.join("\n")}`),
          );
        }
        if (result.issues.length > 0) {
          warnings.push(...result.issues.map((issue) => `${localeConfig.code}: ${issue}`));
        }

        parsedByLocale.set(localeConfig.code, result.content);
        reportByLocale[localeConfig.code] = { pages: result.report, issues: result.issues };
        logger.info(`  ${localeConfig.code}: ${result.content.pages.length} page(s) composed from content library`);
      }

      // The content-generation report (architecture doc §28) — which
      // skeleton/variant/FAQ ids were chosen, and why anything was
      // skipped. Written eagerly here (not deferred to generate-content)
      // since it's a byproduct of composition, not of the Casino
      // assembly that comes later. (generatedDir already exists — created
      // unconditionally near the top of this function.)
      writeFileSync(
        path.join(generatedDir, "content-report.json"),
        `${JSON.stringify({ slug: config.slug, contentVersion, locales: reportByLocale }, null, 2)}\n`,
        "utf-8",
      );
    }
  }

  if (shouldRun("apply-overrides", only)) {
    logger.step("apply-overrides");
    for (const localeConfig of config.locales) {
      const content = parsedByLocale.get(localeConfig.code);
      if (!content) continue;

      const overridesPath = path.join(siteDir, `overrides.${localeConfig.code}.json`);
      try {
        const overridesFile = await loadOverridesFile(overridesPath);
        if (overridesFile) {
          parsedByLocale.set(localeConfig.code, applyOverrides(content, overridesFile));
          logger.info(`  ${localeConfig.code}: applied overrides.${localeConfig.code}.json`);
        }
      } catch (error) {
        throw new PipelineError("apply-overrides", error);
      }
    }
  }

  let effectiveConfig = config;
  let imagesProcessed = 0;
  let faviconGenerated = false;
  let manifest: ImageManifestEntry[] = [];
  if (shouldRun("process-images", only)) {
    logger.step("process-images");
    const inputImagesDir = path.join(siteDir, "images");
    const outputImagesDir = path.join(generatedDir, "public", "images", config.slug);

    if (existsSync(inputImagesDir)) {
      try {
        manifest = await processImages(inputImagesDir, outputImagesDir);
        imagesProcessed = manifest.length;
        logger.info(`  optimized ${manifest.length} image(s)`);

        if (!config.favicon) {
          const faviconSource = FAVICON_SOURCE_BASENAMES.map((name) => path.join(inputImagesDir, name)).find(
            existsSync,
          );
          if (faviconSource) {
            await generateFavicon(faviconSource, outputImagesDir);
            effectiveConfig = { ...effectiveConfig, favicon: `/images/${config.slug}/favicon.ico` };
            faviconGenerated = true;
            logger.info(`  generated favicon.ico from ${path.basename(faviconSource)}`);
          }
        }

        if (!config.navbar.logo) {
          const logoBasename = LOGO_SOURCE_BASENAMES.find((name) => existsSync(path.join(inputImagesDir, name)));
          if (logoBasename) {
            effectiveConfig = {
              ...effectiveConfig,
              navbar: { ...effectiveConfig.navbar, logo: `/images/${config.slug}/${logoBasename}` },
            };
            logger.info(`  using ${logoBasename} as navbar logo`);
          }
        }
      } catch (error) {
        throw new PipelineError("process-images", error);
      }
    } else {
      const warning = `No images/ directory at ${inputImagesDir} — skipping image processing.`;
      warnings.push(warning);
      logger.warn(warning);
    }
  }

  const casinoByLocale = new Map<string, Casino>();
  if (shouldRun("assemble-site", only)) {
    logger.step("assemble-site");
    for (const localeConfig of config.locales) {
      const content = parsedByLocale.get(localeConfig.code);
      if (!content) continue;
      try {
        let casino = assembleSite(content, effectiveConfig, { siteData });
        if (TEMPLATES_WITH_MANDATORY_CASINO_RULES.has(effectiveConfig.template)) {
          casino = applyCasinoV1Rules(casino, effectiveConfig, manifest, content.pages);
        }
        casinoByLocale.set(localeConfig.code, casino);
      } catch (error) {
        throw new PipelineError("assemble-site", error);
      }
    }
  }

  if (shouldRun("validate-site", only)) {
    logger.step("validate-site");
    const imagesDir = path.join(generatedDir, "public", "images");
    for (const [locale, casino] of casinoByLocale) {
      try {
        validateSite(casino, { imagesDir: existsSync(imagesDir) ? imagesDir : undefined });
        logger.info(`  ${locale}: valid (${casino.pages.length} page(s))`);
      } catch (error) {
        throw new PipelineError("validate-site", error);
      }
    }
  }

  const orderedCasinos = () =>
    config.locales.map((l) => casinoByLocale.get(l.code)).filter((casino): casino is Casino => Boolean(casino));

  if (shouldRun("generate-content", only) && orderedCasinos().length > 0) {
    logger.step("generate-content");
    try {
      await writeSiteContent(
        orderedCasinos(),
        buildLanguageOptions(effectiveConfig),
        resolveDefaultLocale(effectiveConfig),
        path.join(generatedDir, "content", "site.ts"),
      );
      logger.info(`  wrote .generated/content/site.ts`);
    } catch (error) {
      throw new PipelineError("generate-content", error);
    }
  }

  if (shouldRun("generate-seo-assets", only) && orderedCasinos().length > 0) {
    logger.step("generate-seo-assets");
    try {
      await writeSeoAssets(orderedCasinos(), config.domains[0], path.join(generatedDir, "public"));
      logger.info(`  wrote sitemap.xml and robots.txt`);
    } catch (error) {
      throw new PipelineError("generate-seo-assets", error);
    }
  }

  let buildDurationMs = 0;
  const distDir = path.join(generatedDir, "dist");
  if (shouldRun("build", only)) {
    logger.step("build");
    const adapter = resolveTemplateAdapter(config.template, repoRoot);
    // shell: true is required on Windows — npm there is a .cmd shim, which
    // the OS refuses to spawn directly without going through a shell
    // (EINVAL, not just a Node quirk). Node flags shell: true as risky
    // because shell-interpreted arguments can enable injection, but that
    // risk requires untrusted input reaching the command/args; both are
    // hardcoded literals here ("npm", ["run", "build"]), never anything
    // derived from config.json, a docx, or other site input.
    const start = Date.now();
    const result = spawnSync("npm", ["run", "build"], {
      cwd: adapter.templateDir,
      env: {
        ...process.env,
        SITE_DIR: siteDir,
        SITE_URL: `https://${config.domains[0]}`,
      },
      stdio: options.verbose ? "inherit" : "pipe",
      shell: process.platform === "win32",
    });
    buildDurationMs = Date.now() - start;

    if (result.error) {
      // The process never started at all (e.g. npm not on PATH) — status
      // is null in this case, so it must be checked separately from a
      // real (non-zero) exit code.
      throw new PipelineError("build", result.error);
    }
    if (result.status !== 0) {
      if (!options.verbose) {
        if (result.stdout) logger.error(result.stdout.toString());
        if (result.stderr) logger.error(result.stderr.toString());
      }
      throw new PipelineError("build", new Error(`astro build exited with code ${result.status}`));
    }
    logger.info(`  built in ${buildDurationMs}ms`);
  }

  let previewUrl: string | undefined;
  let productionUrl: string | undefined;
  const domainsProvisioned: string[] = [];
  const domainHandoff: DomainHandoffResult[] = [];
  let redirectSet = false;
  let verifyPreview: VerifyResult | undefined;
  let verifyProduction: VerifyResult | undefined;
  let verifyRedirect: VerifyResult | undefined;

  if (!options.skipDeploy) {
    const providers = options.providers ?? buildProviders({ dryRun: options.dryRun ?? false, repoRoot });
    let target: DeployTarget | undefined;

    if (shouldRun("resolve-deployment-target", only)) {
      logger.step("resolve-deployment-target");
      try {
        const adapter = resolveTemplateAdapter(config.template, repoRoot);
        const existing = providers.registry.get(config.slug);
        target = providers.strategy.resolveTarget(config.slug, existing);

        providers.registry.upsert({
          slug: config.slug,
          domains: config.domains,
          templateId: config.template,
          templateVersion: readTemplateVersion(adapter.templateDir),
          cloudflare: {
            projectName: target.projectName,
            projectId: existing?.cloudflare.projectId,
            branch: target.productionBranch,
            workerRouteIds: existing?.cloudflare.workerRouteIds ?? [],
          },
          deployments: existing?.deployments ?? [],
          domainProvisioning: existing?.domainProvisioning ?? [],
          lastGeneratedAt: new Date().toISOString(),
        });
        await providers.deploymentProvider.ensureProject(target);
        logger.info(`  project: ${target.projectName} (production branch: ${target.productionBranch})`);
      } catch (error) {
        throw new PipelineError("resolve-deployment-target", error);
      }
    }

    if (target && shouldRun("deploy-preview", only)) {
      logger.step("deploy-preview");
      try {
        const result = await providers.deploymentProvider.deployPreview({ target, distDir });
        previewUrl = result.url;
        providers.registry.recordDeployment(config.slug, {
          id: result.deploymentId,
          environment: "preview",
          url: result.url,
          timestamp: new Date().toISOString(),
          status: "success",
        });
        logger.info(`  ${result.url}`);
      } catch (error) {
        throw new PipelineError("deploy-preview", error);
      }
    }

    if (previewUrl && shouldRun("verify-preview", only)) {
      logger.step("verify-preview");
      if (options.dryRun) {
        // Noop providers hand back fake *.pages.dev URLs that will never
        // resolve — a real HTTP check here would always "fail" for a
        // reason that has nothing to do with the site, so dry-run reports
        // what would happen instead of actually checking.
        logger.info(`  (skipped: --dry-run) would check ${previewUrl}`);
      } else {
        verifyPreview = await verifyUrl(previewUrl);
        logger.info(`  ${verifyPreview.ok ? "OK" : `FAILED (${verifyPreview.error ?? verifyPreview.status})`}`);
      }
    }

    if (target && !options.previewOnly) {
      if (shouldRun("provision-domain", only)) {
        logger.step("provision-domain");
        const stageResult = await runProvisionDomainStage(config.slug, config.domains, providers.domainHandoff, providers.registry, logger);
        domainHandoff.push(...stageResult.results);
        warnings.push(...stageResult.warnings);
      }

      if (shouldRun("promote-to-production", only)) {
        logger.step("promote-to-production");
        try {
          const routeIds = new Set(providers.registry.get(config.slug)?.cloudflare.workerRouteIds ?? []);
          for (const domain of config.domains) {
            await providers.domainProvisioner.ensureCustomDomain(domain, target);
            const route = await providers.domainProvisioner.ensureRedirectWorkerRoute(domain);
            routeIds.add(route.routeId);
            domainsProvisioned.push(domain);
            logger.info(`  ${domain}: domain attached, /go/* route ${route.routeId}`);
          }

          // Record the routes as soon as they're confirmed, before the
          // deploy call below — if that fails, a re-run shouldn't have to
          // re-provision domains/routes that already exist.
          const beforeDeploy = providers.registry.get(config.slug);
          if (beforeDeploy) {
            providers.registry.upsert({
              ...beforeDeploy,
              cloudflare: { ...beforeDeploy.cloudflare, workerRouteIds: [...routeIds] },
            });
          }

          const result = await providers.deploymentProvider.promote({ target, distDir });
          productionUrl = result.url;
          providers.registry.recordDeployment(config.slug, {
            id: result.deploymentId,
            environment: "production",
            url: result.url,
            timestamp: new Date().toISOString(),
            status: "success",
          });
          logger.info(`  ${result.url}`);
        } catch (error) {
          throw new PipelineError("promote-to-production", error);
        }
      }

      if (shouldRun("update-redirect", only)) {
        logger.step("update-redirect");
        try {
          await providers.redirectStore.setRedirect(config.slug, config.affiliateUrl);
          redirectSet = true;
          logger.info(`  ${config.slug} -> ${config.affiliateUrl}`);
        } catch (error) {
          throw new PipelineError("update-redirect", error);
        }
      }

      if (productionUrl && shouldRun("verify-deployment", only)) {
        logger.step("verify-deployment");
        if (options.dryRun) {
          logger.info(`  (skipped: --dry-run) would check ${productionUrl} and /go/${config.slug}`);
        } else {
          verifyProduction = await verifyUrl(productionUrl);
          verifyRedirect = await verifyUrl(`https://${config.domains[0]}/go/${config.slug}`);
          logger.info(`  production: ${verifyProduction.ok ? "OK" : "FAILED"}`);
          logger.info(`  redirect:   ${verifyRedirect.ok ? "OK" : "FAILED"}`);
        }
      }
    }
  }

  const summary: GenerateResult = {
    slug: config.slug,
    siteDir,
    dryRun: options.dryRun ?? false,
    locales: [...casinoByLocale.keys()],
    pageCounts: Object.fromEntries(
      [...casinoByLocale.entries()].map(([locale, casino]) => [locale, casino.pages.length]),
    ),
    imagesProcessed,
    faviconGenerated,
    buildDurationMs,
    distDir,
    warnings,
    previewUrl,
    productionUrl,
    domainsProvisioned,
    domainHandoff,
    redirectSet,
    verifyPreview,
    verifyProduction,
    verifyRedirect,
  };

  writeFileSync(path.join(generatedDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf-8");

  return summary;
}
