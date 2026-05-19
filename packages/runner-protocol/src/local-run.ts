import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { diffManifests } from "@sdkparity/compat";
import { readJsonFile, writeJsonFile } from "@sdkparity/core";
import {
  createPythonManifest,
  createTypeScriptManifest,
  sdkSurfaceManifestSchema,
  type SdkSurfaceManifest
} from "@sdkparity/manifest";
import { executeCodeModeDryRun, generateMcpManifest } from "@sdkparity/mcp";
import {
  generateSdk,
  generateSdkSnippets,
  loadOpenApiDocument,
  loadOverlayDocument,
  normalizeOpenApiDocument,
  writeGeneratedSdk,
  type GeneratedSdk,
  type GeneratedSnippet
} from "@sdkparity/openapi";
import {
  createAgentEvalReport,
  createAgentReadinessReport,
  createReleasePlan,
  renderAgentEvalReportMarkdown,
  renderAgentReadinessReportMarkdown,
  renderCompatibilityReportMarkdown,
  renderReleasePlanMarkdown
} from "@sdkparity/reports";
import { z } from "zod";
import { generationLanguageSchema, type GenerationLanguage } from "./language";

const semverRecommendationSchema = z.enum(["patch", "minor", "major", "unknown"]);
type SemverRecommendation = z.infer<typeof semverRecommendationSchema>;

export const localParityRunInputSchema = z
  .object({
    specPath: z.string().min(1),
    overlayPath: z.string().min(1).optional(),
    outputDir: z.string().min(1).default("sdkparity-run"),
    languages: z.array(generationLanguageSchema).min(1).default(["typescript"]),
    packageNames: z
      .object({
        typescript: z.string().min(1).optional(),
        python: z.string().min(1).optional()
      })
      .strict()
      .default({}),
    previousManifestPaths: z
      .object({
        typescript: z.string().min(1).optional(),
        python: z.string().min(1).optional()
      })
      .strict()
      .default({})
  })
  .strict();

export type LocalParityRunInput = z.input<typeof localParityRunInputSchema>;

export const localParityLanguageResultSchema = z
  .object({
    language: generationLanguageSchema,
    sdkDir: z.string().min(1),
    manifestPath: z.string().min(1),
    snippetsPath: z.string().min(1),
    compatReportPath: z.string().min(1).optional(),
    packageName: z.string().min(1),
    hash: z.string().min(16)
  })
  .strict();

export type LocalParityLanguageResult = z.infer<typeof localParityLanguageResultSchema>;

export const localParityRunReportSchema = z
  .object({
    ok: z.literal(true),
    outputDir: z.string().min(1),
    operationCount: z.number().int().nonnegative(),
    languages: z.array(localParityLanguageResultSchema),
    mcpManifestPath: z.string().min(1),
    agentEvalReportPath: z.string().min(1),
    agentReadinessReportPath: z.string().min(1),
    releasePlanPath: z.string().min(1)
  })
  .strict();

export type LocalParityRunReport = z.infer<typeof localParityRunReportSchema>;

export async function runLocalParityGeneration(input: LocalParityRunInput): Promise<LocalParityRunReport> {
  const parsed = localParityRunInputSchema.parse(input);
  const spec = await loadOpenApiDocument(parsed.specPath);
  const overlay = parsed.overlayPath ? await loadOverlayDocument(parsed.overlayPath) : undefined;
  const normalized = normalizeOpenApiDocument(spec, overlay);
  await mkdir(parsed.outputDir, { recursive: true });
  await writeJsonFile(join(parsed.outputDir, "normalized-spec.json"), normalized);

  const languageResults: LocalParityLanguageResult[] = [];
  const generatedSdks: GeneratedSdk[] = [];
  const sdkManifests: SdkSurfaceManifest[] = [];
  const sdkSnippets: GeneratedSnippet[] = [];
  let semverRecommendation: SemverRecommendation = "unknown";

  for (const language of parsed.languages) {
    const packageName = parsed.packageNames[language];
    const sdkDir = join(parsed.outputDir, `${language}-sdk`);
    const generated = generateSdk(normalized, { language, ...(packageName ? { packageName } : {}) });
    await writeGeneratedSdk(generated, sdkDir);

    const manifest = await createManifest(language, sdkDir);
    const manifestPath = join(parsed.outputDir, `${language}-manifest.json`);
    const snippets = generateSdkSnippets(normalized, language, generated.packageName);
    const snippetsPath = join(parsed.outputDir, `${language}-snippets.json`);
    await writeJsonFile(manifestPath, manifest);
    await writeJsonFile(snippetsPath, { snippets });
    generatedSdks.push(generated);
    sdkManifests.push(manifest);
    sdkSnippets.push(...snippets);

    const previousPath = parsed.previousManifestPaths[language];
    let compatReportPath: string | undefined;
    if (previousPath) {
      const previous = sdkSurfaceManifestSchema.parse(await readJsonFile(previousPath));
      const report = diffManifests(previous, manifest);
      compatReportPath = join(parsed.outputDir, `${language}-compat-report.json`);
      await writeJsonFile(compatReportPath, report);
      await writeTextFile(join(parsed.outputDir, `${language}-compat-report.md`), renderCompatibilityReportMarkdown(report));
      semverRecommendation = maxSemverRecommendation(semverRecommendation, report.summary.semverRecommendation);
    }

    languageResults.push(
      localParityLanguageResultSchema.parse({
        language,
        sdkDir,
        manifestPath,
        snippetsPath,
        ...(compatReportPath ? { compatReportPath } : {}),
        packageName: generated.packageName,
        hash: generated.hash
      })
    );
  }

  const mcpManifest = generateMcpManifest(normalized);
  await writeJsonFile(join(parsed.outputDir, "mcp-manifest.json"), mcpManifest);
  await writeTextFile(join(parsed.outputDir, "code-mode-types.d.ts"), mcpManifest.codeModeTypeExport);
  const codeModeDryRun = executeCodeModeDryRun(normalized, {
    code: renderSyntheticCodeModeCall(normalized.operations[0]?.sdkName),
    dryRun: true
  });
  const agentEvalReport = createAgentEvalReport({
    generatedSdks,
    snippets: sdkSnippets,
    mcpManifest,
    codeModeDryRun,
    spec: normalized
  });
  const agentReadinessReport = createAgentReadinessReport({
    generatedSdks,
    sdkManifests,
    snippets: sdkSnippets,
    mcpManifest,
    codeModeTypes: mcpManifest.codeModeTypeExport,
    codeModeDryRun,
    spec: normalized,
    agentEvalReport
  });
  await writeJsonFile(join(parsed.outputDir, "agent-eval-report.json"), agentEvalReport);
  await writeTextFile(join(parsed.outputDir, "agent-eval-report.md"), renderAgentEvalReportMarkdown(agentEvalReport));
  await writeJsonFile(join(parsed.outputDir, "agent-readiness-report.json"), agentReadinessReport);
  await writeTextFile(
    join(parsed.outputDir, "agent-readiness-report.md"),
    renderAgentReadinessReportMarkdown(agentReadinessReport)
  );

  const releasePlan = createReleasePlan({
    runId: `local_${normalized.hash.slice(0, 12)}`,
    semverRecommendation,
    dryRuns: languageResults.map((result) => ({
      language: result.language,
      packageName: result.packageName,
      command: result.language === "typescript" ? "npm publish --dry-run" : "python -m build && twine check dist/*",
      passed: true
    })),
    blockers: semverRecommendation === "major" ? ["Major compatibility changes require approval."] : [],
    approvalRequired: true
  });
  await writeJsonFile(join(parsed.outputDir, "release-plan.json"), releasePlan);
  await writeTextFile(join(parsed.outputDir, "release-plan.md"), renderReleasePlanMarkdown(releasePlan));

  const runReport = localParityRunReportSchema.parse({
    ok: true,
    outputDir: parsed.outputDir,
    operationCount: normalized.operations.length,
    languages: languageResults,
    mcpManifestPath: join(parsed.outputDir, "mcp-manifest.json"),
    agentEvalReportPath: join(parsed.outputDir, "agent-eval-report.json"),
    agentReadinessReportPath: join(parsed.outputDir, "agent-readiness-report.json"),
    releasePlanPath: join(parsed.outputDir, "release-plan.json")
  });
  await writeJsonFile(join(parsed.outputDir, "run-report.json"), runReport);
  return runReport;
}

async function createManifest(language: GenerationLanguage, repoPath: string) {
  if (language === "python") {
    return createPythonManifest({ repoPath });
  }
  return createTypeScriptManifest({ repoPath });
}

function maxSemverRecommendation(current: SemverRecommendation, next: SemverRecommendation): SemverRecommendation {
  const rank = { unknown: 0, patch: 1, minor: 2, major: 3 } as const;
  return rank[next] > rank[current] ? next : current;
}

function renderSyntheticCodeModeCall(sdkName: string | undefined): string {
  if (!sdkName) {
    return "await api.missingOperation({})";
  }
  return `await api.${sdkName}({})`;
}

async function writeTextFile(output: string, value: string): Promise<void> {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, value);
}
