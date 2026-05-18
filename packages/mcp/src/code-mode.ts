import type { NormalizedSpec } from "@sdkparity/openapi";
import { mcpSearchInputSchema } from "./schemas";
import type { McpSearchInput, McpSearchResult } from "./schemas";

export function searchOperations(spec: NormalizedSpec, input: McpSearchInput): McpSearchResult[] {
  const parsed = mcpSearchInputSchema.parse(input);
  const query = parsed.query.toLowerCase();

  return spec.operations
    .filter((operation) =>
      [
        operation.operationId,
        operation.path,
        operation.method,
        operation.summary ?? "",
        operation.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    )
    .slice(0, parsed.limit)
    .map((operation) => ({
      operationId: operation.operationId,
      method: operation.method.toUpperCase(),
      path: operation.path,
      ...(operation.summary ? { summary: operation.summary } : {})
    }));
}

export function generateCodeModeTypes(spec: NormalizedSpec): string {
  const methods = spec.operations.map((operation) => {
    const methodName = operation.sdkName;
    return `  ${methodName}(input: Record<string, unknown>): Promise<unknown>;`;
  });

  return [
    "export type SdkParityApi = {",
    ...methods,
    "};",
    ""
  ].join("\n");
}
