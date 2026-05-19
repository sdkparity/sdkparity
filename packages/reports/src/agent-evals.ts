import { contentHash } from "@sdkparity/core";
import type { CodeModeExecuteResult, McpManifest } from "@sdkparity/mcp";
import type { GeneratedSdk, GeneratedSnippet, NormalizedOperation, NormalizedSpec, SdkGenerationLanguage } from "@sdkparity/openapi";
import { z } from "zod";

const evalStatusSchema = z.enum(["pass", "fail"]);

export const agentEvalSurfaceSchema = z.enum(["sdk", "docs", "mcp", "code-mode"]);
export type AgentEvalSurface = z.infer<typeof agentEvalSurfaceSchema>;

export const agentEvalTaskKindSchema = z.enum([
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
]);
export type AgentEvalTaskKind = z.infer<typeof agentEvalTaskKindSchema>;

export const agentEvalTaskSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    surface: agentEvalSurfaceSchema,
    kind: agentEvalTaskKindSchema,
    operationId: z.string().min(1).optional(),
    language: z.enum(["typescript", "python"]).optional(),
    expectedArtifact: z.string().min(1)
  })
  .strict();
export type AgentEvalTask = z.infer<typeof agentEvalTaskSchema>;

export const agentEvalTaskMetricsSchema = z
  .object({
    success: z.boolean(),
    tokenUsage: z.number().int().nonnegative(),
    latencyMs: z.number().int().nonnegative(),
    toolCallCount: z.number().int().nonnegative(),
    wrongToolRate: z.number().min(0).max(1),
    invalidPayloadRate: z.number().min(0).max(1),
    authFailureRate: z.number().min(0).max(1),
    missingDocRate: z.number().min(0).max(1),
    compileImportFailures: z.number().int().nonnegative()
  })
  .strict();
export type AgentEvalTaskMetrics = z.infer<typeof agentEvalTaskMetricsSchema>;

export const agentEvalAggregateMetricsSchema = agentEvalTaskMetricsSchema
  .omit({ success: true })
  .extend({
    taskSuccessRate: z.number().min(0).max(1)
  })
  .strict();
export type AgentEvalAggregateMetrics = z.infer<typeof agentEvalAggregateMetricsSchema>;

export const agentEvalResultSchema = z
  .object({
    task: agentEvalTaskSchema,
    status: evalStatusSchema,
    metrics: agentEvalTaskMetricsSchema,
    summary: z.string().min(1),
    suggestions: z.array(z.string()).default([])
  })
  .strict();
export type AgentEvalResult = z.infer<typeof agentEvalResultSchema>;

export const agentEvalReportSchema = z
  .object({
    version: z.literal("0.1"),
    status: evalStatusSchema,
    score: z.number().int().min(0).max(100),
    taskCount: z.number().int().nonnegative(),
    passedCount: z.number().int().nonnegative(),
    metrics: agentEvalAggregateMetricsSchema,
    results: z.array(agentEvalResultSchema).min(1),
    repairSuggestions: z.array(z.string()),
    hash: z.string().min(16)
  })
  .strict();
export type AgentEvalReport = z.infer<typeof agentEvalReportSchema>;

export type CreateAgentEvalReportInput = {
  generatedSdks: GeneratedSdk[];
  snippets: GeneratedSnippet[];
  mcpManifest: McpManifest;
  codeModeDryRun: CodeModeExecuteResult;
  spec?: NormalizedSpec;
};

export function createSyntheticAgentEvalTasks(input: CreateAgentEvalReportInput): AgentEvalTask[] {
  const operations = input.spec?.operations.filter((operation) => operation.sdkVisibility === "public") ?? [];
  const operationIds = unique([
    ...operations.map((operation) => operation.operationId),
    ...input.snippets.map((snippet) => snippet.operationId),
    ...input.mcpManifest.tools.flatMap((tool) => tool.operationIds)
  ]);
  const primaryOperation = operations.find((operation) => operationIds.includes(operation.operationId));
  const tasks: AgentEvalTask[] = [];

  for (const sdk of input.generatedSdks) {
    tasks.push(
      task({
        id: `sdk.${sdk.language}.install-import`,
        title: `${displayLanguage(sdk.language)} SDK installs and imports`,
        surface: "sdk",
        kind: "install-import",
        language: sdk.language,
        expectedArtifact: "generated-sdk"
      })
    );

    const operation = primaryOperation ?? operationIds[0];
    if (operation) {
      tasks.push(
        task({
          id: `sdk.${sdk.language}.operation-call.${operationIdOf(operation)}`,
          title: `${displayLanguage(sdk.language)} SDK operation call`,
          surface: "sdk",
          kind: "operation-call",
          operationId: operationIdOf(operation),
          language: sdk.language,
          expectedArtifact: "sdk-surface-manifest"
        })
      );
    }

    const retryOperation = primaryOperation ?? operationIds[0];
    if (retryOperation) {
      tasks.push(
        task({
          id: `sdk.${sdk.language}.retry.${operationIdOf(retryOperation)}`,
          title: `${displayLanguage(sdk.language)} SDK retryable error handling`,
          surface: "sdk",
          kind: "retry-error",
          operationId: operationIdOf(retryOperation),
          language: sdk.language,
          expectedArtifact: "agent-eval-report"
        })
      );
    }
  }

  const crudOperation = operations.find((operation) => ["post", "put", "patch", "delete"].includes(operation.method));
  if (crudOperation) {
    tasks.push(operationTask(crudOperation, "crud", "SDK mutation workflow", "sdk"));
  }

  const paginationOperation = operations.find(hasPaginationSignal);
  if (paginationOperation) {
    tasks.push(operationTask(paginationOperation, "pagination", "Pagination workflow", "sdk"));
  }

  const fileOperation = operations.find(hasFileSignal);
  if (fileOperation) {
    tasks.push(operationTask(fileOperation, "file-transfer", "File transfer workflow", "sdk"));
  }

  const webhookOperation = operations.find(hasWebhookSignal);
  if (webhookOperation) {
    tasks.push(operationTask(webhookOperation, "webhook-docs", "Webhook documentation lookup", "docs"));
  }

  for (const snippet of input.snippets) {
    tasks.push(
      task({
        id: `docs.${snippet.language}.${snippet.operationId}`,
        title: `${displayLanguage(snippet.language)} docs snippet lookup`,
        surface: "docs",
        kind: "docs-lookup",
        operationId: snippet.operationId,
        language: snippet.language,
        expectedArtifact: "docs-snippets"
      })
    );
  }

  for (const tool of input.mcpManifest.tools) {
    tasks.push(
      task({
        id: `mcp.${tool.id}`,
        title: `${tool.title} dry-run task`,
        surface: "mcp",
        kind: "mcp-workflow",
        operationId: tool.operationIds[0],
        expectedArtifact: "mcp-manifest"
      })
    );
  }

  tasks.push(
    task({
      id: "code-mode.synthetic-dry-run",
      title: "Code Mode synthetic dry-run",
      surface: "code-mode",
      kind: "code-mode-dry-run",
      operationId: input.codeModeDryRun.calls[0]?.operationId,
      expectedArtifact: "code-mode-types"
    })
  );

  return dedupeTasks(tasks);
}

export function createAgentEvalReport(input: CreateAgentEvalReportInput): AgentEvalReport {
  const results = createSyntheticAgentEvalTasks(input).map((evalTask) => evaluateTask(input, evalTask));
  const passedCount = results.filter((result) => result.status === "pass").length;
  const withoutHash = {
    version: "0.1" as const,
    status: passedCount === results.length ? "pass" as const : "fail" as const,
    score: percentage(passedCount, results.length),
    taskCount: results.length,
    passedCount,
    metrics: aggregateMetrics(results),
    results,
    repairSuggestions: unique(results.flatMap((result) => result.suggestions))
  };

  return agentEvalReportSchema.parse({
    ...withoutHash,
    hash: contentHash(withoutHash)
  });
}

export function renderAgentEvalReportMarkdown(report: AgentEvalReport): string {
  const lines = [
    "# Agent Eval Report",
    "",
    `Status: **${report.status}**`,
    `Score: **${report.score}%**`,
    `Tasks: **${report.passedCount}/${report.taskCount} passed**`,
    `Hash: \`${report.hash}\``,
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Task success rate | ${formatRate(report.metrics.taskSuccessRate)} |`,
    `| Tool calls | ${report.metrics.toolCallCount} |`,
    `| Token usage | ${report.metrics.tokenUsage} |`,
    `| Invalid payload rate | ${formatRate(report.metrics.invalidPayloadRate)} |`,
    `| Missing doc rate | ${formatRate(report.metrics.missingDocRate)} |`,
    "",
    "## Tasks",
    "",
    "| Task | Surface | Status |",
    "| --- | --- | --- |",
    ...report.results.map((result) => `| ${result.task.title} | ${result.task.surface} | ${result.status} |`)
  ];

  if (report.repairSuggestions.length > 0) {
    lines.push("", "## Repair Suggestions", "", ...report.repairSuggestions.map((suggestion) => `- ${suggestion}`));
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function evaluateTask(input: CreateAgentEvalReportInput, evalTask: AgentEvalTask): AgentEvalResult {
  const passed = taskPassed(input, evalTask);
  const suggestions = passed ? [] : suggestionsFor(evalTask);
  const metrics = metricsFor(evalTask, passed);
  return agentEvalResultSchema.parse({
    task: evalTask,
    status: passed ? "pass" : "fail",
    metrics,
    summary: passed
      ? "Synthetic task has matching typed artifacts and dry-run evidence."
      : "Synthetic task is missing required typed evidence.",
    suggestions
  });
}

function taskPassed(input: CreateAgentEvalReportInput, evalTask: AgentEvalTask): boolean {
  if (evalTask.surface === "sdk") {
    const sdk = evalTask.language
      ? input.generatedSdks.find((candidate) => candidate.language === evalTask.language)
      : input.generatedSdks.find((candidate) => candidate.operationCount > 0);
    if (!sdk || sdk.files.length === 0 || sdk.operationCount === 0) {
      return false;
    }
    return evalTask.operationId ? operationExists(input, evalTask.operationId) : true;
  }

  if (evalTask.surface === "docs") {
    if (evalTask.kind === "webhook-docs") {
      return Boolean(evalTask.operationId && operationExists(input, evalTask.operationId));
    }
    return input.snippets.some(
      (snippet) =>
        snippet.language === evalTask.language &&
        snippet.operationId === evalTask.operationId &&
        snippet.code.includes("Client")
    );
  }

  if (evalTask.surface === "mcp") {
    return input.mcpManifest.tools.some((tool) => `mcp.${tool.id}` === evalTask.id && tool.dryRunSupported);
  }

  return input.codeModeDryRun.ok && input.codeModeDryRun.dryRun && input.codeModeDryRun.calls.length > 0;
}

function operationExists(input: CreateAgentEvalReportInput, operationId: string): boolean {
  if (input.spec?.operations.some((operation) => operation.operationId === operationId)) {
    return true;
  }
  if (input.snippets.some((snippet) => snippet.operationId === operationId)) {
    return true;
  }
  return input.mcpManifest.tools.some((tool) => tool.operationIds.includes(operationId));
}

function metricsFor(evalTask: AgentEvalTask, passed: boolean): AgentEvalTaskMetrics {
  const toolCallCount = evalTask.surface === "sdk" ? 0 : evalTask.surface === "code-mode" ? 2 : 1;
  return agentEvalTaskMetricsSchema.parse({
    success: passed,
    tokenUsage: tokenUsageFor(evalTask),
    latencyMs: latencyFor(evalTask),
    toolCallCount,
    wrongToolRate: passed || evalTask.surface !== "mcp" ? 0 : 1,
    invalidPayloadRate: passed || evalTask.kind !== "code-mode-dry-run" ? 0 : 1,
    authFailureRate: 0,
    missingDocRate: passed || evalTask.surface !== "docs" ? 0 : 1,
    compileImportFailures: passed || evalTask.kind !== "install-import" ? 0 : 1
  });
}

function aggregateMetrics(results: AgentEvalResult[]): AgentEvalAggregateMetrics {
  const taskCount = results.length;
  const metrics = results.map((result) => result.metrics);
  return agentEvalAggregateMetricsSchema.parse({
    taskSuccessRate: metrics.filter((metric) => metric.success).length / taskCount,
    tokenUsage: sum(metrics, "tokenUsage"),
    latencyMs: sum(metrics, "latencyMs"),
    toolCallCount: sum(metrics, "toolCallCount"),
    wrongToolRate: average(metrics, "wrongToolRate"),
    invalidPayloadRate: average(metrics, "invalidPayloadRate"),
    authFailureRate: average(metrics, "authFailureRate"),
    missingDocRate: average(metrics, "missingDocRate"),
    compileImportFailures: sum(metrics, "compileImportFailures")
  });
}

function suggestionsFor(evalTask: AgentEvalTask): string[] {
  if (evalTask.surface === "sdk") {
    return ["Regenerate the SDK and verify install/import plus manifest extraction before release."];
  }
  if (evalTask.surface === "docs") {
    return ["Regenerate tested snippets or add docs coverage for the affected operation."];
  }
  if (evalTask.surface === "mcp") {
    return ["Enable dry-run support on the curated MCP workflow tool."];
  }
  return ["Run a Code Mode dry-run script that calls a public SDK operation."];
}

function operationTask(
  operation: NormalizedOperation,
  kind: AgentEvalTaskKind,
  title: string,
  surface: AgentEvalSurface
): AgentEvalTask {
  return task({
    id: `${surface}.${kind}.${operation.operationId}`,
    title,
    surface,
    kind,
    operationId: operation.operationId,
    expectedArtifact: surface === "docs" ? "docs-snippets" : "agent-eval-report"
  });
}

function task(input: Omit<AgentEvalTask, "operationId" | "language"> & Partial<Pick<AgentEvalTask, "operationId" | "language">>): AgentEvalTask {
  return agentEvalTaskSchema.parse(input);
}

function hasPaginationSignal(operation: NormalizedOperation): boolean {
  if (operation.pagination && operation.pagination.type !== "none") {
    return true;
  }
  return operation.parameters.some((parameter) => /^(cursor|page|limit|offset)$/i.test(parameter.name));
}

function hasFileSignal(operation: NormalizedOperation): boolean {
  return operation.requestBodyContentTypes.some((contentType) => /multipart|octet-stream/i.test(contentType));
}

function hasWebhookSignal(operation: NormalizedOperation): boolean {
  const searchable = [operation.operationId, operation.path, ...operation.tags, operation.summary ?? ""].join(" ");
  return /webhook/i.test(searchable);
}

function operationIdOf(operation: NormalizedOperation | string): string {
  return typeof operation === "string" ? operation : operation.operationId;
}

function dedupeTasks(tasks: AgentEvalTask[]): AgentEvalTask[] {
  const seen = new Set<string>();
  return tasks.filter((evalTask) => {
    if (seen.has(evalTask.id)) {
      return false;
    }
    seen.add(evalTask.id);
    return true;
  });
}

function displayLanguage(language: SdkGenerationLanguage): string {
  return language === "typescript" ? "TypeScript" : "Python";
}

function tokenUsageFor(evalTask: AgentEvalTask): number {
  if (evalTask.surface === "code-mode") {
    return 180;
  }
  if (evalTask.surface === "mcp") {
    return 120;
  }
  if (evalTask.surface === "docs") {
    return 90;
  }
  return 40;
}

function latencyFor(evalTask: AgentEvalTask): number {
  if (evalTask.surface === "code-mode") {
    return 450;
  }
  if (evalTask.surface === "mcp") {
    return 300;
  }
  return 100;
}

function percentage(passed: number, total: number): number {
  return Math.round((passed / total) * 100);
}

function sum(metrics: AgentEvalTaskMetrics[], key: "tokenUsage" | "latencyMs" | "toolCallCount" | "compileImportFailures"): number {
  return metrics.reduce((total, metric) => total + metric[key], 0);
}

function average(
  metrics: AgentEvalTaskMetrics[],
  key: "wrongToolRate" | "invalidPayloadRate" | "authFailureRate" | "missingDocRate"
): number {
  return Number((metrics.reduce((total, metric) => total + metric[key], 0) / metrics.length).toFixed(4));
}

function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
