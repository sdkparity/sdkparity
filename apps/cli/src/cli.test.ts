import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli as executeCli } from "./index";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const specPath = join(repoRoot, "fixtures/synthetic/openapi/base.json");
const overlayPath = join(repoRoot, "fixtures/synthetic/openapi/overlay.json");
const oldSdkPath = join(repoRoot, "fixtures/synthetic/ts-sdk-old");
const newSdkPath = join(repoRoot, "fixtures/synthetic/ts-sdk-new");
const oldPythonSdkPath = join(repoRoot, "fixtures/synthetic/python-sdk-old");

test("prints command help", async () => {
  const result = await runCli(["--help"]);

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain("sdkparity spec normalize");
});

test("writes to process output by default", async () => {
  const originalWrite = process.stdout.write;
  let stdout = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;

  try {
    expect(await executeCli(["help"])).toBe(0);
  } finally {
    process.stdout.write = originalWrite;
  }

  expect(stdout).toContain("Commands:");
});

test("lints and normalizes OpenAPI specs", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "sdkparity-cli-spec-"));
  const outputPath = join(outputDir, "normalized.json");
  const warningSpecPath = join(outputDir, "warning-openapi.json");
  await writeFile(
    warningSpecPath,
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Warning", version: "1.0.0" },
      paths: { "/users": { get: { responses: { "200": { description: "OK" } } } } }
    })
  );

  const lint = await runCli(["spec", "lint", specPath]);
  expect(JSON.parse(lint.stdout)).toMatchObject({ ok: true, operationCount: 3 });
  expect(JSON.parse((await runCli(["spec", "lint", warningSpecPath])).stdout)).toMatchObject({
    ok: true,
    diagnostics: [expect.objectContaining({ code: "missing_operation_id" })]
  });

  const normalize = await runCli(["spec", "normalize", specPath, "--overlay", overlayPath, "--output", outputPath]);
  expect(normalize).toMatchObject({ exitCode: 0, stdout: "", stderr: "" });
  const normalized = JSON.parse(await readFile(outputPath, "utf8"));
  expect(
    normalized.operations.some(
      (operation: { operationId: string; sdkName: string }) =>
        operation.operationId === "listUsers" && operation.sdkName === "list"
    )
  ).toBe(true);
});

test("runs the MCP Code Mode dry-run command end to end", async () => {
  const { stdout } = await runCli([
    "mcp",
    "execute",
    "--spec",
    specPath,
    "--code",
    "await api.listUsers({ limit: 10 })"
  ]);
  expect(JSON.parse(stdout)).toMatchObject({
    ok: true,
    calls: [{ operationId: "listUsers" }]
  });
});

test("generates manifests and compatibility reports", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "sdkparity-cli-compat-"));
  const oldManifest = join(outputDir, "old.json");
  const newManifest = join(outputDir, "new.json");
  const pythonManifest = join(outputDir, "python.json");

  await expectOk(runCli(["manifest", "create", "--language", "typescript", "--repo", oldSdkPath, "--output", oldManifest]));
  await expectOk(runCli(["manifest", "create", "--language", "ts", "--repo", newSdkPath, "--output", newManifest]));
  await expectOk(runCli(["manifest", "create", "--language", "python", "--repo", oldPythonSdkPath, "--output", pythonManifest]));

  const json = await runCli(["compat", "diff", oldManifest, newManifest]);
  expect(JSON.parse(json.stdout)).toMatchObject({
    summary: { semverRecommendation: "minor" }
  });
  expect(JSON.parse(await readFile(pythonManifest, "utf8"))).toMatchObject({
    package: { language: "python" }
  });

  const markdown = await runCli(["compat", "diff", oldManifest, newManifest, "--format", "markdown"]);
  expect(markdown.stdout).toContain("SDK Compatibility Report");
});

test("generates Code Mode type surfaces", async () => {
  const result = await runCli(["mcp", "generate", specPath]);

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain("listUsers");

  const manifest = await runCli(["mcp", "manifest", "--spec", specPath]);
  expect(JSON.parse(manifest.stdout)).toMatchObject({
    tools: [expect.objectContaining({ id: "users.workflow" })]
  });
});

test("exposes agent schema introspection as JSON", async () => {
  const list = await runCli(["schema", "list"]);
  expect(JSON.parse(list.stdout).schemas).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "mcp.codeMode.execute.input" })])
  );

  const schema = await runCli(["schema", "get", "mcp.codeMode.execute.input"]);
  expect(JSON.parse(schema.stdout)).toMatchObject({
    id: "mcp.codeMode.execute.input",
    jsonSchema: { type: "object" }
  });
});

test("exposes agent capability discovery as JSON", async () => {
  const list = await runCli(["capability", "list"]);
  expect(JSON.parse(list.stdout).capabilities).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "mcp.codeMode.execute.dryRun" })])
  );

  const capability = await runCli(["capability", "get", "mcp.codeMode.execute.dryRun"]);
  expect(JSON.parse(capability.stdout)).toMatchObject({
    id: "mcp.codeMode.execute.dryRun",
    dryRunSupported: true,
    mutatesExternalState: false
  });
});

test("runs the local SDK parity workflow", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "sdkparity-cli-run-"));

  const result = await runCli(["run", "local", "--spec", specPath, "--sdk-repo", oldSdkPath, "--output-dir", outputDir]);

  expect(JSON.parse(result.stdout)).toMatchObject({
    ok: true,
    outputDir,
    operationCount: 3,
    symbolCount: 5
  });
  expect(JSON.parse(await readFile(join(outputDir, "normalized-spec.json"), "utf8"))).toHaveProperty("hash");
  expect(JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8"))).toHaveProperty("symbols");
});

test("generates TypeScript and Python SDK parity artifacts end to end", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "sdkparity-cli-generate-"));
  const oldManifest = join(outputDir, "old-ts.json");
  const oldPythonManifest = join(outputDir, "old-python.json");

  await expectOk(runCli(["manifest", "create", "--language", "ts", "--repo", oldSdkPath, "--output", oldManifest]));
  await expectOk(
    runCli(["manifest", "create", "--language", "python", "--repo", oldPythonSdkPath, "--output", oldPythonManifest])
  );

  const sdkOutputDir = join(outputDir, "single-python-sdk");
  const sdkResult = await runCli([
    "sdk",
    "generate",
    "--language",
    "python",
    "--spec",
    specPath,
    "--overlay",
    overlayPath,
    "--output-dir",
    sdkOutputDir
  ]);
  expect(JSON.parse(sdkResult.stdout)).toMatchObject({ ok: true, language: "python" });
  expect(await readFile(join(sdkOutputDir, "sdkparity_client/__init__.py"), "utf8")).toContain("class Client");

  const runOutputDir = join(outputDir, "run");
  const result = await runCli([
    "run",
    "generate",
    "--spec",
    specPath,
    "--overlay",
    overlayPath,
    "--languages",
    "typescript,python",
    "--previous-typescript-manifest",
    oldManifest,
    "--previous-python-manifest",
    oldPythonManifest,
    "--output-dir",
    runOutputDir
  ]);

  const report = JSON.parse(result.stdout);
  expect(report).toMatchObject({ ok: true, operationCount: 3 });
  expect(report.languages).toHaveLength(2);
  expect(JSON.parse(await readFile(join(runOutputDir, "typescript-manifest.json"), "utf8"))).toMatchObject({
    package: { language: "typescript" }
  });
  expect(JSON.parse(await readFile(join(runOutputDir, "python-manifest.json"), "utf8"))).toMatchObject({
    package: { language: "python" }
  });
  expect(await readFile(join(runOutputDir, "code-mode-types.d.ts"), "utf8")).toContain("list");
  expect(await readFile(join(runOutputDir, "release-plan.md"), "utf8")).toContain("Package Dry Runs");
});

test("returns structured errors for invalid commands and missing inputs", async () => {
  const unsupportedLanguage = await runCli(["manifest", "create", "--language", "ruby", "--repo", oldSdkPath]);
  expect(JSON.parse(unsupportedLanguage.stderr)).toMatchObject({
    code: "unexpected_error",
    message: expect.stringContaining("Invalid option")
  });

  const missingFlag = await runCli(["mcp", "execute", "--spec"]);
  expect(JSON.parse(missingFlag.stderr)).toMatchObject({
    code: "unexpected_error",
    message: "Missing --spec."
  });

  const missingPositional = await runCli(["spec", "normalize"]);
  expect(JSON.parse(missingPositional.stderr)).toMatchObject({
    code: "unexpected_error",
    message: "Missing spec path."
  });

  const missingSchema = await runCli(["schema", "get", "missing"]);
  expect(JSON.parse(missingSchema.stderr).message).toContain("Unknown schema: missing");

  const missingCapability = await runCli(["capability", "get", "missing"]);
  expect(JSON.parse(missingCapability.stderr).message).toContain("Unknown capability: missing");

  const unknownCommand = await runCli(["nope"]);
  expect(JSON.parse(unknownCommand.stderr)).toMatchObject({
    code: "unexpected_error",
    message: "Unknown command: nope"
  });

  for (const result of [
    unsupportedLanguage,
    missingFlag,
    missingPositional,
    missingSchema,
    missingCapability,
    unknownCommand
  ]) {
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
  }
});

async function expectOk(resultPromise: Promise<CliResult>): Promise<void> {
  const result = await resultPromise;
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
}

type CliResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

async function runCli(args: string[]) {
  let stdout = "";
  let stderr = "";
  const exitCode = await executeCli(args, {
    stdout: { write: (value) => (stdout += value) },
    stderr: { write: (value) => (stderr += value) }
  });

  return { stdout, stderr, exitCode };
}
