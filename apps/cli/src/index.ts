import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { diffManifests } from "@sdkparity/compat";
import { normalizeLanguageAlias, parseLanguageList, type SdkparityLanguage } from "@sdkparity/config";
import { readJsonFile, toSdkParityError, writeJsonFile } from "@sdkparity/core";
import { createPythonManifest, createTypeScriptManifest, sdkSurfaceManifestSchema } from "@sdkparity/manifest";
import {
  executeCodeModeDryRun,
  generateCodeModeTypes,
  generateMcpManifest,
  getAgentCapability,
  getAgentSchema,
  listAgentCapabilities,
  listAgentSchemas
} from "@sdkparity/mcp";
import {
  generateSdk,
  generateSdkSnippets,
  loadOpenApiDocument,
  loadOverlayDocument,
  normalizeOpenApiDocument,
  writeGeneratedSdk
} from "@sdkparity/openapi";
import {
  createReleasePlan,
  renderCompatibilityReportMarkdown,
  renderReleasePlanMarkdown
} from "@sdkparity/reports";

type Args = {
  positionals: string[];
  flags: Map<string, string | true>;
};

type WritableOutput = {
  write(value: string): unknown;
};

type CliIo = {
  stdout: WritableOutput;
  stderr: WritableOutput;
};

const processIo: CliIo = {
  stdout: process.stdout,
  stderr: process.stderr
};

export async function runCli(rawArgs: string[], io: CliIo = processIo): Promise<number> {
  try {
    await executeCli(parseArgs(rawArgs), io);
    return 0;
  } catch (error) {
    const sdkError = toSdkParityError(error);
    io.stderr.write(`${JSON.stringify(sdkError.toJSON(), null, 2)}\n`);
    return 1;
  }
}

async function executeCli(args: Args, io: CliIo): Promise<void> {
  const [resource, action] = args.positionals;

  if (!resource || resource === "help" || resource === "--help") {
    printHelp(io);
    return;
  }

  if (resource === "spec" && action === "lint") {
    const source = requirePositional(args, 2, "spec path");
    const spec = await loadOpenApiDocument(source);
    const normalized = normalizeOpenApiDocument(spec);
    await writeOutput(args, io, {
      ok: normalized.diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      diagnostics: normalized.diagnostics,
      operationCount: normalized.operations.length
    });
    return;
  }

  if (resource === "spec" && action === "normalize") {
    const source = requirePositional(args, 2, "spec path");
    const overlayPath = getStringFlag(args, "overlay");
    const spec = await loadOpenApiDocument(source);
    const overlay = overlayPath ? await loadOverlayDocument(overlayPath) : undefined;
    const normalized = normalizeOpenApiDocument(spec, overlay);
    await writeOutput(args, io, normalized);
    return;
  }

  if (resource === "manifest" && action === "create") {
    const language = normalizeLanguageAlias(getStringFlag(args, "language") ?? "ts");
    const repoPath = getStringFlag(args, "repo") ?? ".";
    const manifest = await createManifest(language, repoPath);
    await writeOutput(args, io, manifest);
    return;
  }

  if (resource === "compat" && action === "diff") {
    const oldPath = requirePositional(args, 2, "previous manifest path");
    const newPath = requirePositional(args, 3, "candidate manifest path");
    const oldManifest = sdkSurfaceManifestSchema.parse(await readJsonFile(oldPath));
    const newManifest = sdkSurfaceManifestSchema.parse(await readJsonFile(newPath));
    const report = diffManifests(oldManifest, newManifest);
    const format = getStringFlag(args, "format") ?? "json";
    if (format === "markdown") {
      await writeTextOutput(args, io, renderCompatibilityReportMarkdown(report));
    } else {
      await writeOutput(args, io, report);
    }
    return;
  }

  if (resource === "mcp" && action === "generate") {
    const specPath = getStringFlag(args, "spec") ?? requirePositional(args, 2, "spec path");
    const spec = normalizeOpenApiDocument(await loadOpenApiDocument(specPath));
    const output = generateCodeModeTypes(spec);
    await writeTextOutput(args, io, output);
    return;
  }

  if (resource === "mcp" && action === "manifest") {
    const specPath = getStringFlag(args, "spec") ?? requirePositional(args, 2, "spec path");
    const spec = normalizeOpenApiDocument(await loadOpenApiDocument(specPath));
    await writeOutput(args, io, generateMcpManifest(spec));
    return;
  }

  if (resource === "mcp" && action === "execute") {
    const specPath = requireFlag(args, "spec");
    const code = requireFlag(args, "code");
    const spec = normalizeOpenApiDocument(await loadOpenApiDocument(specPath));
    await writeOutput(args, io, executeCodeModeDryRun(spec, { code, dryRun: true }));
    return;
  }

  if (resource === "schema" && action === "list") {
    await writeOutput(args, io, { schemas: listAgentSchemas() });
    return;
  }

  if (resource === "schema" && action === "get") {
    const schemaId = requirePositional(args, 2, "schema id");
    const schema = getAgentSchema(schemaId);
    if (!schema) {
      throw new Error(`Unknown schema: ${schemaId}. Run "sdkparity schema list" to inspect available schemas.`);
    }
    await writeOutput(args, io, schema);
    return;
  }

  if (resource === "capability" && action === "list") {
    await writeOutput(args, io, { capabilities: listAgentCapabilities() });
    return;
  }

  if (resource === "capability" && action === "get") {
    const capabilityId = requirePositional(args, 2, "capability id");
    const capability = getAgentCapability(capabilityId);
    if (!capability) {
      throw new Error(
        `Unknown capability: ${capabilityId}. Run "sdkparity capability list" to inspect available capabilities.`
      );
    }
    await writeOutput(args, io, capability);
    return;
  }

  if (resource === "run" && action === "local") {
    const specPath = requireFlag(args, "spec");
    const sdkRepo = requireFlag(args, "sdk-repo");
    const outputDir = getStringFlag(args, "output-dir") ?? "sdkparity-run";
    const normalized = normalizeOpenApiDocument(await loadOpenApiDocument(specPath));
    const manifest = await createTypeScriptManifest({ repoPath: sdkRepo });
    await mkdir(outputDir, { recursive: true });
    await writeJsonFile(join(outputDir, "normalized-spec.json"), normalized);
    await writeJsonFile(join(outputDir, "manifest.json"), manifest);
    await writeOutput(args, io, {
      ok: true,
      outputDir,
      operationCount: normalized.operations.length,
      symbolCount: manifest.symbols.length
    });
    return;
  }

  if (resource === "sdk" && action === "generate") {
    const specPath = requireFlag(args, "spec");
    const language = normalizeLanguageAlias(requireFlag(args, "language"));
    const outputDir = requireFlag(args, "output-dir");
    const overlayPath = getStringFlag(args, "overlay");
    const packageName = getStringFlag(args, "package-name");
    const spec = await loadOpenApiDocument(specPath);
    const overlay = overlayPath ? await loadOverlayDocument(overlayPath) : undefined;
    const generated = generateSdk(normalizeOpenApiDocument(spec, overlay), {
      language,
      ...(packageName ? { packageName } : {})
    });
    await writeGeneratedSdk(generated, outputDir);
    await writeOutput(args, io, {
      ok: true,
      language,
      outputDir,
      packageName: generated.packageName,
      fileCount: generated.files.length,
      hash: generated.hash
    });
    return;
  }

  if (resource === "run" && action === "generate") {
    const specPath = requireFlag(args, "spec");
    const outputDir = getStringFlag(args, "output-dir") ?? "sdkparity-run";
    const languages = parseLanguageList(getStringFlag(args, "languages"));
    const overlayPath = getStringFlag(args, "overlay");
    const spec = await loadOpenApiDocument(specPath);
    const overlay = overlayPath ? await loadOverlayDocument(overlayPath) : undefined;
    const normalized = normalizeOpenApiDocument(spec, overlay);
    await mkdir(outputDir, { recursive: true });
    await writeJsonFile(join(outputDir, "normalized-spec.json"), normalized);

    const languageResults = [];
    let semverRecommendation: "patch" | "minor" | "major" | "unknown" = "unknown";
    for (const language of languages) {
      const packageName = getStringFlag(args, `${language}-package-name`);
      const sdkDir = join(outputDir, `${language}-sdk`);
      const generated = generateSdk(normalized, { language, ...(packageName ? { packageName } : {}) });
      await writeGeneratedSdk(generated, sdkDir);
      const manifest = await createManifest(language, sdkDir);
      const manifestPath = join(outputDir, `${language}-manifest.json`);
      const snippets = generateSdkSnippets(normalized, language, generated.packageName);
      const snippetsPath = join(outputDir, `${language}-snippets.json`);
      await writeJsonFile(manifestPath, manifest);
      await writeJsonFile(snippetsPath, { snippets });

      const previousPath = getStringFlag(args, `previous-${language}-manifest`);
      let compatReportPath: string | undefined;
      if (previousPath) {
        const previous = sdkSurfaceManifestSchema.parse(await readJsonFile(previousPath));
        const report = diffManifests(previous, manifest);
        compatReportPath = join(outputDir, `${language}-compat-report.json`);
        await writeJsonFile(compatReportPath, report);
        await writeTextFile(join(outputDir, `${language}-compat-report.md`), renderCompatibilityReportMarkdown(report));
        semverRecommendation = maxSemverRecommendation(semverRecommendation, report.summary.semverRecommendation);
      }

      languageResults.push({
        language,
        sdkDir,
        manifestPath,
        snippetsPath,
        ...(compatReportPath ? { compatReportPath } : {}),
        packageName: generated.packageName,
        hash: generated.hash
      });
    }

    const mcpManifest = generateMcpManifest(normalized);
    await writeJsonFile(join(outputDir, "mcp-manifest.json"), mcpManifest);
    await writeTextFile(join(outputDir, "code-mode-types.d.ts"), mcpManifest.codeModeTypeExport);

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
    await writeJsonFile(join(outputDir, "release-plan.json"), releasePlan);
    await writeTextFile(join(outputDir, "release-plan.md"), renderReleasePlanMarkdown(releasePlan));
    const runReport = {
      ok: true,
      outputDir,
      operationCount: normalized.operations.length,
      languages: languageResults,
      mcpManifestPath: join(outputDir, "mcp-manifest.json"),
      releasePlanPath: join(outputDir, "release-plan.json")
    };
    await writeJsonFile(join(outputDir, "run-report.json"), runReport);
    await writeOutput(args, io, runReport);
    return;
  }

  throw new Error(`Unknown command: ${resource}${action ? ` ${action}` : ""}`);
}

function parseArgs(rawArgs: string[]): Args {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();

  for (let index = 0; index < rawArgs.length; index += 1) {
    const value = rawArgs[index];
    if (!value) {
      continue;
    }
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const flagName = value.slice(2);
    const next = rawArgs[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(flagName, true);
      continue;
    }
    flags.set(flagName, next);
    index += 1;
  }

  return { positionals, flags };
}

function requirePositional(args: Args, index: number, label: string): string {
  const value = args.positionals[index];
  if (!value) {
    throw new Error(`Missing ${label}.`);
  }
  return value;
}

function requireFlag(args: Args, flag: string): string {
  const value = getStringFlag(args, flag);
  if (!value) {
    throw new Error(`Missing --${flag}.`);
  }
  return value;
}

function getStringFlag(args: Args, flag: string): string | undefined {
  const value = args.flags.get(flag);
  return typeof value === "string" ? value : undefined;
}

async function writeOutput(args: Args, io: CliIo, value: unknown): Promise<void> {
  await writeTextOutput(args, io, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextOutput(args: Args, io: CliIo, value: string): Promise<void> {
  const output = getStringFlag(args, "output");
  if (!output) {
    io.stdout.write(value);
    return;
  }

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, value);
}

async function writeTextFile(output: string, value: string): Promise<void> {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, value);
}

async function createManifest(language: SdkparityLanguage, repoPath: string) {
  if (language === "python") {
    return createPythonManifest({ repoPath });
  }
  return createTypeScriptManifest({ repoPath });
}

function maxSemverRecommendation(
  current: "patch" | "minor" | "major" | "unknown",
  next: "patch" | "minor" | "major" | "unknown"
): "patch" | "minor" | "major" | "unknown" {
  const rank = { unknown: 0, patch: 1, minor: 2, major: 3 } as const;
  return rank[next] > rank[current] ? next : current;
}

function printHelp(io: CliIo): void {
  io.stdout.write(`sdkparity

Commands:
  sdkparity spec lint <openapi>
  sdkparity spec normalize <openapi> [--overlay file] [--output file]
  sdkparity manifest create --language ts --repo <path> [--output file]
  sdkparity compat diff <old-manifest> <new-manifest> [--format json|markdown] [--output file]
  sdkparity mcp generate --spec <openapi> [--output file]
  sdkparity mcp manifest --spec <openapi> [--output file]
  sdkparity mcp execute --spec <openapi> --code "await api.listUsers({})"
  sdkparity sdk generate --language typescript|python --spec <openapi> --output-dir <dir>
  sdkparity schema list
  sdkparity schema get <schema-id>
  sdkparity capability list
  sdkparity capability get <capability-id>
  sdkparity run local --spec <openapi> --sdk-repo <path> [--output-dir dir]
  sdkparity run generate --spec <openapi> --languages typescript,python [--output-dir dir]

All structured commands emit JSON by default.
`);
}
