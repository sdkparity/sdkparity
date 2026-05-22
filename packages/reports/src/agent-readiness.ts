import { contentHash } from "@sdkparity/core";
import type { SdkCapabilityId, SdkSurfaceManifest } from "@sdkparity/manifest";
import type { CodeModeExecuteResult, McpManifest } from "@sdkparity/mcp";
import type { GeneratedSdk, GeneratedSnippet, NormalizedSpec, SdkGenerationLanguage } from "@sdkparity/openapi";
import { z } from "zod";
import { agentEvalReportSchema, createAgentEvalReport, type AgentEvalReport } from "./agent-evals";

const readinessStatusSchema = z.enum(["pass", "warn", "fail"]);
const readinessSeveritySchema = z.enum(["info", "warning", "error"]);

export const agentReadinessCheckSchema = z
  .object({
    id: z.string().min(1),
    passed: z.boolean(),
    severity: readinessSeveritySchema,
    message: z.string().min(1),
    suggestion: z.string().min(1).optional()
  })
  .strict();

export type AgentReadinessCheck = z.infer<typeof agentReadinessCheckSchema>;

export const agentReadinessSurfaceSchema = z
  .object({
    id: z.enum(["sdk", "docs", "mcp", "code-mode", "evals"]),
    title: z.string().min(1),
    status: readinessStatusSchema,
    score: z.number().int().min(0).max(100),
    checks: z.array(agentReadinessCheckSchema).min(1)
  })
  .strict();

export type AgentReadinessSurface = z.infer<typeof agentReadinessSurfaceSchema>;

export const agentReadinessReportSchema = z
  .object({
    version: z.literal("0.1"),
    status: readinessStatusSchema,
    score: z.number().int().min(0).max(100),
    surfaces: z.array(agentReadinessSurfaceSchema).min(1),
    evalReport: agentEvalReportSchema,
    blockers: z.array(z.string()),
    warnings: z.array(z.string()),
    hash: z.string().min(16)
  })
  .strict();

export type AgentReadinessReport = z.infer<typeof agentReadinessReportSchema>;

export type CreateAgentReadinessReportInput = {
  generatedSdks: GeneratedSdk[];
  sdkManifests?: SdkSurfaceManifest[];
  snippets: GeneratedSnippet[];
  mcpManifest: McpManifest;
  codeModeTypes: string;
  codeModeDryRun: CodeModeExecuteResult;
  spec?: NormalizedSpec;
  agentEvalReport?: AgentEvalReport;
};

export function createAgentReadinessReport(input: CreateAgentReadinessReportInput): AgentReadinessReport {
  const evalReport =
    input.agentEvalReport ??
    createAgentEvalReport({
      generatedSdks: input.generatedSdks,
      snippets: input.snippets,
      mcpManifest: input.mcpManifest,
      codeModeDryRun: input.codeModeDryRun,
      ...(input.spec ? { spec: input.spec } : {})
    });
  const surfaces = [
    createSurface("sdk", "SDK", sdkChecks(input.generatedSdks, input.sdkManifests ?? [])),
    createSurface("docs", "Docs snippets", docsChecks(input.generatedSdks, input.snippets)),
    createSurface("mcp", "MCP", mcpChecks(input.mcpManifest)),
    createSurface("code-mode", "Code Mode", codeModeChecks(input.codeModeTypes, input.codeModeDryRun)),
    createSurface("evals", "Agent evals", evalChecks(evalReport))
  ];
  const failedChecks = surfaces.flatMap((surface) => surface.checks.filter((check) => !check.passed));
  const withoutHash = {
    version: "0.1" as const,
    status: statusForChecks(failedChecks),
    score: average(surfaces.map((surface) => surface.score)),
    surfaces,
    evalReport,
    blockers: failedChecks.filter((check) => check.severity === "error").map((check) => check.message),
    warnings: failedChecks.filter((check) => check.severity === "warning").map((check) => check.message)
  };

  return agentReadinessReportSchema.parse({
    ...withoutHash,
    hash: contentHash(withoutHash)
  });
}

export function renderAgentReadinessReportMarkdown(report: AgentReadinessReport): string {
  const lines = [
    "# Agent Readiness Report",
    "",
    `Status: **${report.status}**`,
    `Score: **${report.score}%**`,
    `Eval tasks: **${report.evalReport.passedCount}/${report.evalReport.taskCount} passed**`,
    `Hash: \`${report.hash}\``,
    "",
    "| Surface | Score | Status |",
    "| --- | ---: | --- |",
    ...report.surfaces.map((surface) => `| ${surface.title} | ${surface.score}% | ${surface.status} |`),
    "",
    "## Checks",
    ""
  ];

  for (const surface of report.surfaces) {
    lines.push(`### ${surface.title}`, "");
    for (const check of surface.checks) {
      const state = check.passed ? "pass" : check.severity;
      lines.push(`- **${state}** ${check.message}`);
      if (!check.passed && check.suggestion) {
        lines.push(`  Suggested fix: ${check.suggestion}`);
      }
    }
    lines.push("");
  }

  if (report.blockers.length > 0) {
    lines.push("## Blockers", "", ...report.blockers.map((blocker) => `- ${blocker}`), "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function sdkChecks(generatedSdks: GeneratedSdk[], manifests: SdkSurfaceManifest[]): AgentReadinessCheck[] {
  const languages = new Set(generatedSdks.map((sdk) => sdk.language));
  const manifestLanguages = new Set(manifests.map((manifest) => manifest.package.language));
  const manifestErrors = manifests.flatMap((manifest) =>
    manifest.diagnostics.filter((diagnostic) => diagnostic.severity === "error")
  );
  const operationLinkedSymbols = manifests.flatMap((manifest) =>
    manifest.symbols.filter((symbol) => Boolean(symbol.operationId))
  );
  const generatedLanguages = [...languages];
  const manifestsByLanguage = new Map(manifests.map((manifest) => [manifest.package.language, manifest]));

  return [
    check(
      "sdk.generated",
      generatedSdks.length > 0,
      "At least one SDK artifact was generated.",
      "error",
      "Run SDK generation for TypeScript or Python before evaluating agent readiness."
    ),
    check(
      "sdk.operations",
      generatedSdks.every((sdk) => sdk.operationCount > 0),
      "Generated SDK artifacts expose public operations.",
      "error",
      "Check OpenAPI visibility and overlays so public operations are not hidden."
    ),
    check(
      "sdk.manifest.diagnostics",
      manifestErrors.length === 0,
      "SDK manifests have no extraction errors.",
      "error",
      "Fix manifest extraction diagnostics before release."
    ),
    check(
      "sdk.manifest.coverage",
      manifests.length > 0 && [...languages].every((language) => manifestLanguages.has(language)),
      "Generated SDK languages have matching surface manifests.",
      "warning",
      "Create manifests for every generated SDK language."
    ),
    check(
      "sdk.operation.links",
      manifests.length > 0 && operationLinkedSymbols.length > 0,
      "SDK manifests retain operation identifiers for compatibility evidence.",
      "warning",
      "Regenerate manifests from SDKs that include operation-linked public methods."
    ),
    check(
      "sdk.capabilities.errors",
      generatedLanguages.length > 0 &&
        generatedLanguages.every((language) => manifestHasAllCapabilities(manifestsByLanguage.get(language), ["typedErrors", "validation"])),
      "SDK manifests expose typed errors and validation capability evidence.",
      "warning",
      "Regenerate manifests from SDKs that expose typed errors and request/response validation."
    ),
    check(
      "sdk.capabilities.pagination",
      generatedLanguages.length > 0 &&
        generatedLanguages.every((language) => manifestHasAnyCapability(manifestsByLanguage.get(language), ["pagination.items", "pagination.pages"])),
      "SDK manifests expose pagination capability evidence.",
      "warning",
      "Regenerate manifests from SDKs that include item or page pagination helpers."
    ),
    check(
      "sdk.capabilities.hooks",
      generatedLanguages.length > 0 &&
        generatedLanguages.every((language) =>
          manifestHasAllCapabilities(manifestsByLanguage.get(language), ["hooks.requests", "hooks.responses", "hooks.retries"])
        ),
      "SDK manifests expose request, response, and retry hook evidence.",
      "warning",
      "Regenerate manifests from SDKs that include request, response, and retry hook APIs."
    )
  ];
}

function manifestHasAllCapabilities(manifest: SdkSurfaceManifest | undefined, ids: SdkCapabilityId[]): boolean {
  if (!manifest) return false;
  const present = new Set(manifest.capabilities.filter((capability) => capability.present).map((capability) => capability.id));
  return ids.every((id) => present.has(id));
}

function manifestHasAnyCapability(manifest: SdkSurfaceManifest | undefined, ids: SdkCapabilityId[]): boolean {
  if (!manifest) return false;
  const present = new Set(manifest.capabilities.filter((capability) => capability.present).map((capability) => capability.id));
  return ids.some((id) => present.has(id));
}

function docsChecks(generatedSdks: GeneratedSdk[], snippets: GeneratedSnippet[]): AgentReadinessCheck[] {
  const snippetLanguages = new Set(snippets.map((snippet) => snippet.language));
  const generatedLanguages = new Set<SdkGenerationLanguage>(generatedSdks.map((sdk) => sdk.language));
  return [
    check(
      "docs.snippets.present",
      snippets.length > 0,
      "Docs snippets were generated.",
      "error",
      "Generate docs snippets from the normalized spec."
    ),
    check(
      "docs.language.coverage",
      [...generatedLanguages].every((language) => snippetLanguages.has(language)),
      "Docs snippets cover every generated SDK language.",
      "warning",
      "Generate snippets for each emitted SDK language."
    ),
    check(
      "docs.snippets.importable",
      snippets.every((snippet) => snippet.code.includes("Client")),
      "Docs snippets include importable client examples.",
      "warning",
      "Render snippets with explicit Client imports."
    )
  ];
}

function mcpChecks(manifest: McpManifest): AgentReadinessCheck[] {
  return [
    check(
      "mcp.operations",
      manifest.operationCount > 0,
      "MCP manifest includes public operations.",
      "error",
      "Expose at least one operation to MCP or review visibility overlays."
    ),
    check(
      "mcp.workflow.tools",
      manifest.tools.length > 0,
      "MCP manifest includes curated workflow tools.",
      "error",
      "Generate grouped workflow tools from public operations."
    ),
    check(
      "mcp.dry-run",
      manifest.tools.every((tool) => tool.dryRunSupported),
      "MCP workflow tools advertise dry-run support.",
      "error",
      "Make workflow tools dry-run capable before agent use."
    ),
    check(
      "mcp.token.budget",
      manifest.tokenBudget.groupedToolCount <= manifest.tokenBudget.directToolCount,
      "MCP token budget favors grouped tools over direct tool sprawl.",
      "warning",
      "Group related operations into curated workflow tools."
    )
  ];
}

function codeModeChecks(types: string, dryRun: CodeModeExecuteResult): AgentReadinessCheck[] {
  return [
    check(
      "code-mode.types",
      types.includes("SdkParityApi"),
      "Code Mode TypeScript API surface was generated.",
      "error",
      "Generate Code Mode TypeScript declarations from the normalized spec."
    ),
    check(
      "code-mode.dry-run",
      dryRun.ok && dryRun.dryRun && dryRun.calls.length > 0,
      "Code Mode synthetic dry-run planned at least one operation call.",
      "error",
      "Run a dry-run script that calls a public SDK operation."
    ),
    check(
      "code-mode.validation",
      dryRun.diagnostics.length === 0,
      "Code Mode dry-run returned no validation diagnostics.",
      "warning",
      "Resolve Code Mode diagnostics before release."
    )
  ];
}

function evalChecks(report: AgentEvalReport): AgentReadinessCheck[] {
  return [
    check(
      "eval.tasks.present",
      report.taskCount > 0,
      "Synthetic agent eval tasks were generated.",
      "error",
      "Generate an eval task suite for SDK, docs, MCP, and Code Mode surfaces."
    ),
    check(
      "eval.tasks.success",
      report.status === "pass",
      "Synthetic agent eval tasks passed.",
      "error",
      "Inspect the agent eval report and repair the first failed task."
    ),
    check(
      "eval.payload.quality",
      report.metrics.invalidPayloadRate === 0 && report.metrics.wrongToolRate === 0,
      "Agent evals report no invalid payload or wrong-tool failures.",
      "warning",
      "Tighten schemas, tool grouping, or Code Mode validation."
    ),
    check(
      "eval.docs.lookup",
      report.metrics.missingDocRate === 0,
      "Agent evals found required docs snippets.",
      "warning",
      "Regenerate docs snippets for uncovered operations."
    )
  ];
}

function createSurface(
  id: AgentReadinessSurface["id"],
  title: string,
  checks: AgentReadinessCheck[]
): AgentReadinessSurface {
  const failed = checks.filter((check) => !check.passed);
  return agentReadinessSurfaceSchema.parse({
    id,
    title,
    status: statusForChecks(failed),
    score: percentage(checks.filter((check) => check.passed).length, checks.length),
    checks
  });
}

function check(
  id: string,
  passed: boolean,
  message: string,
  severity: AgentReadinessCheck["severity"],
  suggestion?: string
): AgentReadinessCheck {
  return agentReadinessCheckSchema.parse({
    id,
    passed,
    severity,
    message,
    ...(suggestion ? { suggestion } : {})
  });
}

function statusForChecks(failed: AgentReadinessCheck[]): AgentReadinessReport["status"] {
  if (failed.some((check) => check.severity === "error")) {
    return "fail";
  }
  if (failed.length > 0) {
    return "warn";
  }
  return "pass";
}

function average(values: number[]): number {
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function percentage(passed: number, total: number): number {
  return Math.round((passed / total) * 100);
}
