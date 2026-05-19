import { expect, test } from "bun:test";
import type { CodeModeExecuteResult, McpManifest } from "@sdkparity/mcp";
import type { GeneratedSdk, GeneratedSnippet, NormalizedSpec } from "@sdkparity/openapi";
import { createAgentEvalReport, createSyntheticAgentEvalTasks, renderAgentEvalReportMarkdown } from "./agent-evals";

test("creates passing synthetic agent eval evidence across SDK docs MCP and Code Mode", () => {
  const report = createAgentEvalReport({
    generatedSdks: [generatedSdk("typescript"), generatedSdk("python")],
    snippets: [snippet("typescript", "listUsers"), snippet("python", "listUsers")],
    mcpManifest,
    codeModeDryRun,
    spec: normalizedSpec
  });

  expect(report).toMatchObject({
    version: "0.1",
    status: "pass",
    score: 100,
    taskCount: expect.any(Number),
    repairSuggestions: []
  });
  expect(report.hash).toHaveLength(64);
  expect(report.results.map((result) => result.task.kind)).toEqual(
    expect.arrayContaining([
      "install-import",
      "operation-call",
      "crud",
      "pagination",
      "retry-error",
      "file-transfer",
      "webhook-docs",
      "docs-lookup",
      "mcp-workflow",
      "code-mode-dry-run"
    ])
  );
  expect(renderAgentEvalReportMarkdown(report)).toContain("Agent Eval Report");
  expect(renderAgentEvalReportMarkdown(report)).toContain("Task success rate");
});

test("reports repair suggestions and quality metrics for failed synthetic evals", () => {
  const report = createAgentEvalReport({
    generatedSdks: [generatedSdk("typescript", 0)],
    snippets: [{ ...snippet("typescript", "listUsers"), code: "const client = {};" }],
    mcpManifest: {
      ...mcpManifest,
      tools: [{ ...mcpManifest.tools[0]!, dryRunSupported: false }]
    },
    codeModeDryRun: {
      ok: false,
      dryRun: true,
      calls: [],
      diagnostics: [{ code: "no_operation_calls_detected", message: "No calls" }]
    },
    spec: normalizedSpec
  });

  expect(report.status).toBe("fail");
  expect(report.score).toBeLessThan(100);
  expect(report.metrics.invalidPayloadRate).toBeGreaterThan(0);
  expect(report.metrics.wrongToolRate).toBeGreaterThan(0);
  expect(report.metrics.missingDocRate).toBeGreaterThan(0);
  expect(report.metrics.compileImportFailures).toBeGreaterThan(0);
  expect(report.repairSuggestions).toEqual(
    expect.arrayContaining([
      "Regenerate the SDK and verify install/import plus manifest extraction before release.",
      "Regenerate tested snippets or add docs coverage for the affected operation.",
      "Enable dry-run support on the curated MCP workflow tool.",
      "Run a Code Mode dry-run script that calls a public SDK operation."
    ])
  );
  expect(renderAgentEvalReportMarkdown(report)).toContain("Repair Suggestions");
});

test("generates a minimal Code Mode eval task when no other artifacts exist", () => {
  const tasks = createSyntheticAgentEvalTasks({
    generatedSdks: [],
    snippets: [],
    mcpManifest: {
      ...mcpManifest,
      tools: []
    },
    codeModeDryRun
  });

  expect(tasks).toEqual([
    expect.objectContaining({
      id: "code-mode.synthetic-dry-run",
      kind: "code-mode-dry-run"
    })
  ]);
});

test("uses MCP operation metadata when synthetic SDK tasks have no spec or snippets", () => {
  const report = createAgentEvalReport({
    generatedSdks: [generatedSdk("typescript")],
    snippets: [],
    mcpManifest,
    codeModeDryRun
  });

  expect(report.status).toBe("pass");
  expect(report.results).toContainEqual(
    expect.objectContaining({
      task: expect.objectContaining({
        kind: "operation-call",
        operationId: "listUsers"
      })
    })
  );
});

test("creates pagination eval tasks from common pagination query parameters", () => {
  const tasks = createSyntheticAgentEvalTasks({
    generatedSdks: [generatedSdk("typescript")],
    snippets: [],
    mcpManifest,
    codeModeDryRun,
    spec: {
      ...normalizedSpec,
      operations: [
        {
          ...normalizedSpec.operations[0]!,
          pagination: undefined,
          parameters: [{ name: "limit", in: "query", required: false }]
        }
      ]
    }
  });

  expect(tasks).toContainEqual(
    expect.objectContaining({
      kind: "pagination",
      operationId: "listUsers"
    })
  );
});

test("deduplicates repeated synthetic task ids", () => {
  const tasks = createSyntheticAgentEvalTasks({
    generatedSdks: [],
    snippets: [snippet("typescript", "listUsers"), snippet("typescript", "listUsers")],
    mcpManifest: {
      ...mcpManifest,
      tools: []
    },
    codeModeDryRun
  });

  expect(tasks.filter((evalTask) => evalTask.id === "docs.typescript.listUsers")).toHaveLength(1);
});

function generatedSdk(language: GeneratedSdk["language"], operationCount = 4): GeneratedSdk {
  return {
    version: "0.1",
    language,
    packageName: language === "typescript" ? "@example/sdk" : "example-sdk",
    files: [{ path: language === "typescript" ? "src/index.ts" : "example_sdk/__init__.py", content: "export {};" }],
    operationCount,
    hash: `hash_${language}_${operationCount}`.padEnd(16, "0")
  };
}

function snippet(language: GeneratedSnippet["language"], operationId: string): GeneratedSnippet {
  return {
    operationId,
    language,
    code:
      language === "typescript"
        ? 'import { Client } from "@example/sdk";\nconst client = new Client();'
        : "from example_sdk import Client\nclient = Client()"
  };
}

const normalizedSpec: NormalizedSpec = {
  version: "0.1",
  title: "Example API",
  apiVersion: "1.0.0",
  operations: [
    {
      id: "get:/users",
      method: "get",
      path: "/users",
      operationId: "listUsers",
      sdkName: "listUsers",
      resource: "users",
      pagination: { type: "cursor", cursorParam: "cursor", nextCursorField: "next_cursor" },
      summary: "List users",
      tags: ["users"],
      parameters: [{ name: "cursor", in: "query", required: false }],
      requestBodyContentTypes: [],
      responseStatusCodes: ["200"],
      authScopes: [],
      sdkVisibility: "public",
      mcpVisibility: "public",
      sourcePointer: "/paths/~1users/get"
    },
    {
      id: "post:/users",
      method: "post",
      path: "/users",
      operationId: "createUser",
      sdkName: "createUser",
      resource: "users",
      summary: "Create user",
      tags: ["users"],
      parameters: [],
      requestBodyContentTypes: ["application/json"],
      responseStatusCodes: ["201"],
      authScopes: [],
      sdkVisibility: "public",
      mcpVisibility: "public",
      sourcePointer: "/paths/~1users/post"
    },
    {
      id: "post:/files",
      method: "post",
      path: "/files",
      operationId: "uploadFile",
      sdkName: "uploadFile",
      resource: "files",
      summary: "Upload file",
      tags: ["files"],
      parameters: [],
      requestBodyContentTypes: ["multipart/form-data"],
      responseStatusCodes: ["201"],
      authScopes: [],
      sdkVisibility: "public",
      mcpVisibility: "public",
      sourcePointer: "/paths/~1files/post"
    },
    {
      id: "post:/webhooks",
      method: "post",
      path: "/webhooks",
      operationId: "createWebhook",
      sdkName: "createWebhook",
      resource: "webhooks",
      summary: "Create webhook",
      tags: ["webhooks"],
      parameters: [],
      requestBodyContentTypes: ["application/json"],
      responseStatusCodes: ["201"],
      authScopes: [],
      sdkVisibility: "public",
      mcpVisibility: "public",
      sourcePointer: "/paths/~1webhooks/post"
    }
  ],
  diagnostics: [],
  hash: "normalized_hash".padEnd(16, "0")
};

const mcpManifest: McpManifest = {
  version: "0.1",
  title: "Example API",
  operationCount: 4,
  tools: [
    {
      id: "users.workflow",
      title: "Users workflow",
      description: "Curated users workflow.",
      resource: "users",
      operationIds: ["listUsers", "createUser"],
      readOnly: false,
      dryRunSupported: true,
      inputSchemaId: "mcp.workflow.input"
    }
  ],
  codeModeTypeExport: "export type SdkParityApi = {};",
  tokenBudget: { directToolCount: 4, groupedToolCount: 1, codeModeToolCount: 2 },
  hash: "mcp_hash".padEnd(16, "0")
};

const codeModeDryRun: CodeModeExecuteResult = {
  ok: true,
  dryRun: true,
  calls: [{ operationId: "listUsers", method: "GET", path: "/users", dryRun: true }],
  diagnostics: [],
  output: "Dry run planned 1 call."
};
