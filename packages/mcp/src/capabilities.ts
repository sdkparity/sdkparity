import type { AgentCapability } from "./schemas";

const registry = {
  "agent.schema.introspection": {
    id: "agent.schema.introspection",
    title: "Runtime schema introspection",
    description: "List and fetch JSON Schemas for agent-facing SDK Parity contracts.",
    surfaces: ["library", "cli", "mcp-http"],
    readOnly: true,
    dryRunSupported: false,
    mutatesExternalState: false,
    inputSchemaIds: [],
    outputSchemaIds: ["agent.capability.list.result"],
    commands: ["sdkparity schema list", "sdkparity schema get <schema-id>"],
    endpoints: [
      { method: "GET", path: "/mcp/schemas" },
      { method: "GET", path: "/mcp/schemas/:schemaId" }
    ],
    safety: ["Read-only introspection. No project, filesystem, network, or credential mutation."],
    inspectNext: ["agent.capability.list.result"]
  },
  "agent.capability.discovery": {
    id: "agent.capability.discovery",
    title: "Agent capability discovery",
    description: "Discover compact capability metadata before choosing CLI, library, or MCP HTTP surfaces.",
    surfaces: ["library", "cli", "mcp-http"],
    readOnly: true,
    dryRunSupported: false,
    mutatesExternalState: false,
    inputSchemaIds: [],
    outputSchemaIds: ["agent.capability.list.result"],
    commands: ["sdkparity capability list", "sdkparity capability get <capability-id>"],
    endpoints: [
      { method: "GET", path: "/mcp/capabilities" },
      { method: "GET", path: "/mcp/capabilities/:capabilityId" }
    ],
    safety: ["Read-only discovery. Use schema introspection before constructing structured inputs."],
    inspectNext: ["agent.capability.list.result"]
  },
  "openapi.normalize": {
    id: "openapi.normalize",
    title: "Normalize OpenAPI",
    description: "Convert an OpenAPI document plus optional overlays into SDK Parity's canonical operation model.",
    surfaces: ["library", "cli"],
    readOnly: true,
    dryRunSupported: false,
    mutatesExternalState: false,
    inputSchemaIds: ["openapi.document"],
    outputSchemaIds: ["openapi.normalizedSpec"],
    commands: ["sdkparity spec lint <openapi>", "sdkparity spec normalize <openapi> [--overlay file]"],
    endpoints: [],
    safety: ["Does not mutate external systems. Diagnostics may reveal spec quality issues."],
    inspectNext: ["openapi.document", "openapi.normalizedSpec"]
  },
  "mcp.operation.search": {
    id: "mcp.operation.search",
    title: "Search operations",
    description: "Find relevant operations in a normalized spec using compact query input.",
    surfaces: ["library", "mcp-http"],
    readOnly: true,
    dryRunSupported: false,
    mutatesExternalState: false,
    inputSchemaIds: ["mcp.search.input", "openapi.document"],
    outputSchemaIds: ["mcp.search.result"],
    commands: [],
    endpoints: [{ method: "POST", path: "/mcp/search" }],
    safety: ["Read-only. Query terms are matched against operation IDs, paths, methods, summaries, and tags."],
    inspectNext: ["mcp.search.input", "mcp.search.result"]
  },
  "mcp.codeMode.types": {
    id: "mcp.codeMode.types",
    title: "Generate Code Mode types",
    description: "Generate a compact TypeScript API type surface for agent-written Code Mode scripts.",
    surfaces: ["library", "cli", "mcp-http"],
    readOnly: true,
    dryRunSupported: false,
    mutatesExternalState: false,
    inputSchemaIds: ["openapi.document"],
    outputSchemaIds: [],
    commands: ["sdkparity mcp generate --spec <openapi>"],
    endpoints: [{ method: "POST", path: "/mcp/code-mode/types" }],
    safety: ["Read-only. Credentials stay in the host runtime and are not included in generated types."],
    inspectNext: ["openapi.document"]
  },
  "mcp.manifest.generate": {
    id: "mcp.manifest.generate",
    title: "Generate grouped MCP manifest",
    description: "Create curated workflow tools plus Code Mode metadata from a normalized API surface.",
    surfaces: ["library", "cli", "mcp-http"],
    readOnly: true,
    dryRunSupported: false,
    mutatesExternalState: false,
    inputSchemaIds: ["openapi.document"],
    outputSchemaIds: ["mcp.manifest"],
    commands: ["sdkparity mcp manifest --spec <openapi>"],
    endpoints: [{ method: "POST", path: "/mcp/manifest" }],
    safety: ["Read-only. Groups operations by resource to avoid one endpoint per tool on large APIs."],
    inspectNext: ["mcp.manifest"]
  },
  "mcp.codeMode.execute.dryRun": {
    id: "mcp.codeMode.execute.dryRun",
    title: "Dry-run Code Mode execution",
    description: "Validate agent-written Code Mode scripts and return a planned operation call list.",
    surfaces: ["library", "cli", "mcp-http"],
    readOnly: true,
    dryRunSupported: true,
    mutatesExternalState: false,
    inputSchemaIds: ["mcp.codeMode.execute.input", "openapi.document"],
    outputSchemaIds: ["mcp.codeMode.execute.result"],
    commands: ["sdkparity mcp execute --spec <openapi> --code \"await api.listUsers({})\""],
    endpoints: [{ method: "POST", path: "/mcp/code-mode/execute" }],
    safety: [
      "Defaults to dry-run.",
      "Use allowedOperationIds to constrain which operations an agent script may plan.",
      "No external API calls are executed by the OSS dry-run surface."
    ],
    inspectNext: ["mcp.codeMode.execute.input", "mcp.codeMode.execute.result"]
  }
} as const satisfies Record<string, AgentCapability>;

export type AgentCapabilityId = keyof typeof registry;

export function listAgentCapabilities(): AgentCapability[] {
  return agentCapabilityIds().map((id) => registry[id]);
}

export function getAgentCapability(id: string): AgentCapability | undefined {
  if (!isAgentCapabilityId(id)) {
    return undefined;
  }
  return registry[id];
}

function agentCapabilityIds(): AgentCapabilityId[] {
  return Object.keys(registry) as AgentCapabilityId[];
}

function isAgentCapabilityId(id: string): id is AgentCapabilityId {
  return Object.prototype.hasOwnProperty.call(registry, id);
}
