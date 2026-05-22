import { expect, test } from "bun:test";
import type { SdkSurfaceManifest } from "@sdkparity/manifest";
import type { CodeModeExecuteResult, McpManifest } from "@sdkparity/mcp";
import type { GeneratedSdk, GeneratedSnippet } from "@sdkparity/openapi";
import { createAgentReadinessReport, renderAgentReadinessReportMarkdown } from "./agent-readiness";

test("creates and renders passing agent readiness evidence", () => {
  const report = createAgentReadinessReport({
    generatedSdks: [generatedSdk("typescript"), generatedSdk("python")],
    sdkManifests: [manifest("typescript"), manifest("python")],
    snippets: [snippet("typescript"), snippet("python")],
    mcpManifest,
    codeModeTypes: "export type SdkParityApi = { listUsers(input: Record<string, unknown>): Promise<unknown>; };",
    codeModeDryRun
  });

  expect(report).toMatchObject({
    version: "0.1",
    status: "pass",
    score: 100,
    blockers: [],
    warnings: []
  });
  expect(report.hash).toHaveLength(64);
  expect(report.evalReport.status).toBe("pass");
  expect(renderAgentReadinessReportMarkdown(report)).toContain("Agent Readiness Report");
  expect(renderAgentReadinessReportMarkdown(report)).toContain("| MCP | 100% | pass |");
});

test("reports actionable blockers and warnings for incomplete agent surfaces", () => {
  const report = createAgentReadinessReport({
    generatedSdks: [generatedSdk("typescript", 0)],
    sdkManifests: [
      {
        ...manifest("typescript"),
        diagnostics: [{ code: "parse_failed", message: "Could not parse SDK", severity: "error" }]
      }
    ],
    snippets: [],
    mcpManifest: {
      ...mcpManifest,
      operationCount: 0,
      tools: [],
      tokenBudget: { directToolCount: 4, groupedToolCount: 6, codeModeToolCount: 2 }
    },
    codeModeTypes: "export type Missing = {};",
    codeModeDryRun: {
      ok: false,
      dryRun: true,
      calls: [],
      diagnostics: [{ code: "no_operation_calls_detected", message: "No calls" }]
    }
  });

  expect(report.status).toBe("fail");
  expect(report.score).toBeLessThan(60);
  expect(report.blockers).toEqual(
    expect.arrayContaining([
      "Generated SDK artifacts expose public operations.",
      "SDK manifests have no extraction errors.",
      "Docs snippets were generated.",
      "MCP manifest includes public operations.",
      "Code Mode TypeScript API surface was generated.",
      "Synthetic agent eval tasks passed."
    ])
  );
  expect(report.warnings).toContain("MCP token budget favors grouped tools over direct tool sprawl.");
  expect(renderAgentReadinessReportMarkdown(report)).toContain("Suggested fix:");
});

test("returns warning status when only non-blocking readiness checks fail", () => {
  const report = createAgentReadinessReport({
    generatedSdks: [generatedSdk("typescript"), generatedSdk("python")],
    sdkManifests: [manifest("typescript")],
    snippets: [snippet("typescript")],
    mcpManifest: {
      ...mcpManifest,
      tokenBudget: { directToolCount: 1, groupedToolCount: 2, codeModeToolCount: 2 }
    },
    codeModeTypes: "export type SdkParityApi = {};",
    codeModeDryRun
  });

  expect(report.status).toBe("warn");
  expect(report.evalReport.status).toBe("pass");
  expect(report.blockers).toEqual([]);
  expect(report.warnings).toEqual(
    expect.arrayContaining([
      "Generated SDK languages have matching surface manifests.",
      "Docs snippets cover every generated SDK language.",
      "SDK manifests expose typed errors and validation capability evidence.",
      "SDK manifests expose pagination capability evidence.",
      "SDK manifests expose request, response, and retry hook evidence.",
      "MCP token budget favors grouped tools over direct tool sprawl."
    ])
  );
});

test("requires SDK capability evidence per generated language", () => {
  const pythonManifest = {
    ...manifest("python"),
    capabilities: manifest("python").capabilities.map((capability) =>
      capability.id === "pagination.items" ? { ...capability, present: false, evidence: [], symbolIds: [] } : capability
    )
  };
  const report = createAgentReadinessReport({
    generatedSdks: [generatedSdk("typescript"), generatedSdk("python")],
    sdkManifests: [manifest("typescript"), pythonManifest],
    snippets: [snippet("typescript"), snippet("python")],
    mcpManifest,
    codeModeTypes: "export type SdkParityApi = { listUsers(input: Record<string, unknown>): Promise<unknown>; };",
    codeModeDryRun
  });

  expect(report.status).toBe("warn");
  expect(report.warnings).toContain("SDK manifests expose pagination capability evidence.");
});

function generatedSdk(language: GeneratedSdk["language"], operationCount = 1): GeneratedSdk {
  return {
    version: "0.1",
    language,
    packageName: language === "typescript" ? "@example/sdk" : "example-sdk",
    files: [{ path: language === "typescript" ? "src/index.ts" : "example_sdk/__init__.py", content: "export {};" }],
    operationCount,
    hash: `hash_${language}_${operationCount}`.padEnd(16, "0")
  };
}

function manifest(language: SdkSurfaceManifest["package"]["language"]): SdkSurfaceManifest {
  return {
    version: "0.1",
    package: { name: `${language}-sdk`, language, rootDir: "." },
    symbols: [
      {
        id: "Client.listUsers",
        name: "listUsers",
        kind: "method",
        namespace: "Client",
        signature: "listUsers(input)",
        parameters: [],
        returnType: "Promise<unknown>",
        deprecated: false,
        sourceFile: "src/index.ts",
        operationId: "listUsers",
        origin: "generated"
      }
    ],
    capabilities: [
      { id: "typedErrors", present: true, evidence: ["symbol:APIError"], symbolIds: ["APIError"] },
      { id: "validation", present: true, evidence: ["symbol:SDKValidationError"], symbolIds: ["SDKValidationError"] },
      { id: "pagination.items", present: true, evidence: ["symbol:Client.listUsersAutoPaging"], symbolIds: ["Client.listUsersAutoPaging"] },
      { id: "hooks.requests", present: true, evidence: ["source:client"], symbolIds: [] },
      { id: "hooks.responses", present: true, evidence: ["source:client"], symbolIds: [] },
      { id: "hooks.retries", present: true, evidence: ["source:client"], symbolIds: [] }
    ],
    diagnostics: [],
    hash: `manifest_${language}`.padEnd(16, "0")
  };
}

function snippet(language: GeneratedSnippet["language"]): GeneratedSnippet {
  return {
    operationId: "listUsers",
    language,
    code:
      language === "typescript"
        ? 'import { Client } from "@example/sdk";\nconst client = new Client();'
        : "from example_sdk import Client\nclient = Client()"
  };
}

const mcpManifest: McpManifest = {
  version: "0.1",
  title: "Example API",
  operationCount: 1,
  tools: [
    {
      id: "users.workflow",
      title: "Users workflow",
      description: "Curated users workflow.",
      resource: "users",
      operationIds: ["listUsers"],
      readOnly: true,
      dryRunSupported: true,
      inputSchemaId: "mcp.workflow.input"
    }
  ],
  codeModeTypeExport: "export type SdkParityApi = {};",
  tokenBudget: { directToolCount: 1, groupedToolCount: 1, codeModeToolCount: 2 },
  hash: "mcp_hash".padEnd(16, "0")
};

const codeModeDryRun: CodeModeExecuteResult = {
  ok: true,
  dryRun: true,
  calls: [{ operationId: "listUsers", method: "GET", path: "/users", dryRun: true }],
  diagnostics: [],
  output: "Dry run planned 1 call."
};
