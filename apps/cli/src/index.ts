#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { diffManifests } from "@sdkparity/compat";
import { readJsonFile, toSdkParityError, writeJsonFile } from "@sdkparity/core";
import { createTypeScriptManifest, sdkSurfaceManifestSchema } from "@sdkparity/manifest";
import { generateCodeModeTypes } from "@sdkparity/mcp";
import { loadOpenApiDocument, loadOverlayDocument, normalizeOpenApiDocument } from "@sdkparity/openapi";
import { renderCompatibilityReportMarkdown } from "@sdkparity/reports";

type Args = {
  positionals: string[];
  flags: Map<string, string | true>;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [resource, action] = args.positionals;

  if (!resource || resource === "help" || resource === "--help") {
    printHelp();
    return;
  }

  if (resource === "spec" && action === "lint") {
    const source = requirePositional(args, 2, "spec path");
    const spec = await loadOpenApiDocument(source);
    const normalized = normalizeOpenApiDocument(spec);
    await writeOutput(args, {
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
    await writeOutput(args, normalized);
    return;
  }

  if (resource === "manifest" && action === "create") {
    const language = getStringFlag(args, "language") ?? "ts";
    const repoPath = getStringFlag(args, "repo") ?? ".";
    if (language !== "ts" && language !== "typescript") {
      throw new Error("Only TypeScript manifest extraction is implemented in this release.");
    }
    const manifest = await createTypeScriptManifest({ repoPath });
    await writeOutput(args, manifest);
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
      await writeTextOutput(args, renderCompatibilityReportMarkdown(report));
    } else {
      await writeOutput(args, report);
    }
    return;
  }

  if (resource === "mcp" && action === "generate") {
    const specPath = getStringFlag(args, "spec") ?? requirePositional(args, 2, "spec path");
    const spec = normalizeOpenApiDocument(await loadOpenApiDocument(specPath));
    const output = generateCodeModeTypes(spec);
    await writeTextOutput(args, output);
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
    await writeOutput(args, {
      ok: true,
      outputDir,
      operationCount: normalized.operations.length,
      symbolCount: manifest.symbols.length
    });
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

async function writeOutput(args: Args, value: unknown): Promise<void> {
  await writeTextOutput(args, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextOutput(args: Args, value: string): Promise<void> {
  const output = getStringFlag(args, "output");
  if (!output) {
    process.stdout.write(value);
    return;
  }

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, value);
}

function printHelp(): void {
  process.stdout.write(`sdkparity

Commands:
  sdkparity spec lint <openapi>
  sdkparity spec normalize <openapi> [--overlay file] [--output file]
  sdkparity manifest create --language ts --repo <path> [--output file]
  sdkparity compat diff <old-manifest> <new-manifest> [--format json|markdown] [--output file]
  sdkparity mcp generate --spec <openapi> [--output file]
  sdkparity run local --spec <openapi> --sdk-repo <path> [--output-dir dir]

All structured commands emit JSON by default.
`);
}

main().catch((error) => {
  const sdkError = toSdkParityError(error);
  process.stderr.write(`${JSON.stringify(sdkError.toJSON(), null, 2)}\n`);
  process.exitCode = 1;
});
