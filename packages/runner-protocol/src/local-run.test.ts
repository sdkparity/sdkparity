import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPythonManifest, createTypeScriptManifest } from "@sdkparity/manifest";
import { localParityRunInputSchema, runLocalParityGeneration } from "./local-run";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const specPath = join(repoRoot, "fixtures/synthetic/openapi/base.json");
const overlayPath = join(repoRoot, "fixtures/synthetic/openapi/overlay.json");
const oldSdkPath = join(repoRoot, "fixtures/synthetic/ts-sdk-old");
const oldPythonSdkPath = join(repoRoot, "fixtures/synthetic/python-sdk-old");

test("validates local parity run inputs with deterministic defaults", () => {
  expect(localParityRunInputSchema.parse({ specPath })).toMatchObject({
    specPath,
    outputDir: "sdkparity-run",
    languages: ["typescript"],
    packageNames: {},
    previousManifestPaths: {}
  });
  expect(() => localParityRunInputSchema.parse({ specPath, languages: [] })).toThrow();
});

test("runs TypeScript and Python parity generation from one Module", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "sdkparity-runner-local-"));
  const oldManifestPath = join(outputDir, "old-typescript.json");
  const oldPythonManifestPath = join(outputDir, "old-python.json");
  await writeFile(oldManifestPath, JSON.stringify(await createTypeScriptManifest({ repoPath: oldSdkPath }), null, 2));
  await writeFile(
    oldPythonManifestPath,
    JSON.stringify(await createPythonManifest({ repoPath: oldPythonSdkPath }), null, 2)
  );

  const report = await runLocalParityGeneration({
    specPath,
    overlayPath,
    outputDir,
    languages: ["typescript", "python"],
    packageNames: {
      typescript: "@example/synthetic-client",
      python: "synthetic-client"
    },
    previousManifestPaths: {
      typescript: oldManifestPath,
      python: oldPythonManifestPath
    }
  });

  expect(report).toMatchObject({ ok: true, outputDir, operationCount: 3 });
  expect(report.languages).toEqual([
    expect.objectContaining({
      language: "typescript",
      packageName: "@example/synthetic-client",
      compatReportPath: join(outputDir, "typescript-compat-report.json")
    }),
    expect.objectContaining({
      language: "python",
      packageName: "synthetic-client",
      compatReportPath: join(outputDir, "python-compat-report.json")
    })
  ]);
  expect(JSON.parse(await readFile(join(outputDir, "normalized-spec.json"), "utf8"))).toHaveProperty("hash");
  expect(JSON.parse(await readFile(join(outputDir, "typescript-snippets.json"), "utf8")).snippets).toHaveLength(3);
  expect(JSON.parse(await readFile(join(outputDir, "python-manifest.json"), "utf8"))).toMatchObject({
    package: { language: "python" }
  });
  expect(await readFile(join(outputDir, "agent-eval-report.md"), "utf8")).toContain("Agent Eval Report");
  expect(await readFile(join(outputDir, "agent-readiness-report.md"), "utf8")).toContain("Agent Readiness Report");
  expect(await readFile(join(outputDir, "release-plan.md"), "utf8")).toContain("Package Dry Runs");
  expect(JSON.parse(await readFile(join(outputDir, "run-report.json"), "utf8"))).toEqual(report);
});

test("records recoverable evidence when the spec has no operations", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "sdkparity-runner-empty-"));
  const emptySpecPath = join(outputDir, "empty-openapi.json");
  await writeFile(
    emptySpecPath,
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Empty API", version: "1.0.0" },
      paths: {}
    })
  );

  const report = await runLocalParityGeneration({
    specPath: emptySpecPath,
    outputDir,
    languages: ["typescript"]
  });

  expect(report).toMatchObject({ ok: true, operationCount: 0 });
  expect(JSON.parse(await readFile(join(outputDir, "agent-eval-report.json"), "utf8"))).toMatchObject({
    status: "fail",
    results: expect.arrayContaining([
      expect.objectContaining({ task: expect.objectContaining({ kind: "code-mode-dry-run" }) })
    ])
  });
  expect(JSON.parse(await readFile(join(outputDir, "release-plan.json"), "utf8"))).toMatchObject({
    semverRecommendation: "unknown",
    dryRuns: [expect.objectContaining({ language: "typescript", passed: true })]
  });
});
