import { contentHash } from "@sdkparity/core";
import type { NormalizedOperation, NormalizedSpec } from "@sdkparity/openapi";
import { generateCodeModeTypes } from "./code-mode.js";
import { mcpManifestSchema } from "./schemas.js";
import type { McpManifest, McpWorkflowTool } from "./schemas.js";

export function generateMcpManifest(spec: NormalizedSpec): McpManifest {
  const publicOperations = spec.operations.filter((operation) => operation.mcpVisibility === "public");
  const tools = groupWorkflowTools(publicOperations);
  const withoutHash = {
    version: "0.1" as const,
    title: spec.title,
    operationCount: publicOperations.length,
    tools,
    codeModeTypeExport: generateCodeModeTypes({ ...spec, operations: publicOperations }),
    tokenBudget: {
      directToolCount: publicOperations.length,
      groupedToolCount: tools.length,
      codeModeToolCount: 2 as const
    }
  };

  return mcpManifestSchema.parse({
    ...withoutHash,
    hash: contentHash(withoutHash)
  });
}

function groupWorkflowTools(operations: NormalizedOperation[]): McpWorkflowTool[] {
  const byResource = new Map<string, NormalizedOperation[]>();
  for (const operation of operations) {
    const existing = byResource.get(operation.resource) ?? [];
    existing.push(operation);
    byResource.set(operation.resource, existing);
  }

  return [...byResource.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([resource, resourceOperations]) => {
      const operationIds = resourceOperations.map((operation) => operation.operationId).sort();
      const readOnly = resourceOperations.every((operation) => operation.method === "get" || operation.method === "head");
      return {
        id: `${resource}.workflow`,
        title: `${toTitle(resource)} workflow`,
        description: `Curated ${resource} workflow tool covering ${operationIds.length} operation${operationIds.length === 1 ? "" : "s"}.`,
        resource,
        operationIds,
        readOnly,
        dryRunSupported: true,
        inputSchemaId: "mcp.workflow.input"
      };
    });
}

function toTitle(value: string): string {
  return value
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
