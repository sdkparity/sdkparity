#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  "packages/core",
  "packages/config",
  "packages/security",
  "packages/openapi",
  "packages/manifest",
  "packages/compat",
  "packages/mcp",
  "packages/reports",
  "packages/runner-protocol",
  "apps/cli",
];

const tempRoot = mkdtempSync(join(tmpdir(), "sdkparity-pack-smoke-"));
const packDir = join(tempRoot, "tarballs");
const appDir = join(tempRoot, "app");

try {
  await mkdir(packDir, { recursive: true });
  await mkdir(appDir, { recursive: true });
  const tarballs = packages.map((packageDir) => {
    const stdout = execFileSync("npm", ["pack", "--pack-destination", packDir], {
      cwd: join(root, packageDir),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
    return join(packDir, stdout.trim().split(/\r?\n/).at(-1));
  });

  execFileSync("npm", ["init", "-y"], { cwd: appDir, stdio: "ignore" });
  execFileSync("npm", ["install", "--no-audit", "--no-fund", ...tarballs], {
    cwd: appDir,
    stdio: "inherit",
  });

  writeFileSync(
    join(appDir, "smoke.mjs"),
    [
      "import { contentHash } from '@sdkparity/core';",
      "import { normalizeOpenApiDocument } from '@sdkparity/openapi';",
      "import { summarizeManifest } from '@sdkparity/manifest/summary';",
      "import { diffManifests } from '@sdkparity/compat';",
      "import { generateMcpManifest } from '@sdkparity/mcp';",
      "import { createAgentReadinessReport } from '@sdkparity/reports';",
      "if (typeof contentHash({ ok: true }) !== 'string') throw new Error('core import failed');",
      "const spec = normalizeOpenApiDocument({ openapi: '3.1.0', info: { title: 'Smoke', version: '1.0.0' }, paths: { '/health': { get: { operationId: 'getHealth', responses: { '200': { description: 'OK' } } } } } });",
      "const mcpManifest = generateMcpManifest(spec);",
      "const manifest = { version: '0.1', package: { name: 'smoke', language: 'typescript', rootDir: '.' }, symbols: [], capabilities: [], diagnostics: [], hash: 'hash' };",
      "summarizeManifest(manifest);",
      "diffManifests(manifest, manifest);",
      "createAgentReadinessReport({ generatedSdks: [], snippets: [], mcpManifest, codeModeTypes: '', codeModeDryRun: { ok: true, dryRun: true, calls: [{ operationId: 'getHealth', method: 'GET', path: '/health', dryRun: true }], diagnostics: [], output: 'Dry run planned 1 call.' }, spec });",
    ].join("\n"),
  );
  execFileSync("node", ["smoke.mjs"], { cwd: appDir, stdio: "inherit" });
  execFileSync(join(appDir, "node_modules/.bin/sdkparity"), ["--help"], {
    cwd: appDir,
    stdio: "inherit",
  });
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
