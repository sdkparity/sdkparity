import { normalizedSpecSchema, openApiDocumentSchema } from "@sdkparity/openapi";
import { z } from "zod";
import {
  agentCapabilityListResultSchema,
  codeModeExecuteInputSchema,
  codeModeExecuteResultSchema,
  mcpManifestSchema,
  mcpSearchInputSchema,
  mcpSearchResultSchema
} from "./schemas.js";

const registry = {
  "openapi.document": {
    title: "OpenAPI document",
    description: "Input OpenAPI document accepted by SDK Parity normalization.",
    schema: openApiDocumentSchema
  },
  "openapi.normalizedSpec": {
    title: "Normalized OpenAPI spec",
    description: "Canonical operation model used by SDK, compatibility, and MCP workflows.",
    schema: normalizedSpecSchema
  },
  "mcp.search.input": {
    title: "MCP search input",
    description: "Compact query contract for finding operations in a normalized spec.",
    schema: mcpSearchInputSchema
  },
  "mcp.search.result": {
    title: "MCP search result",
    description: "Compact operation search result returned to agents.",
    schema: z.array(mcpSearchResultSchema)
  },
  "mcp.codeMode.execute.input": {
    title: "Code Mode execute input",
    description: "Validated Code Mode execution request. Defaults to dry-run.",
    schema: codeModeExecuteInputSchema
  },
  "mcp.codeMode.execute.result": {
    title: "Code Mode execute result",
    description: "Dry-run execution plan or hosted execution response.",
    schema: codeModeExecuteResultSchema
  },
  "mcp.manifest": {
    title: "MCP manifest",
    description: "Grouped workflow tools, Code Mode type export, and token budget metadata.",
    schema: mcpManifestSchema
  },
  "agent.capability.list.result": {
    title: "Agent capability list result",
    description: "Compact capability metadata for choosing CLI, library, or MCP HTTP surfaces.",
    schema: agentCapabilityListResultSchema
  }
} as const;

export type AgentSchemaId = keyof typeof registry;

export type AgentSchemaSummary = {
  id: AgentSchemaId;
  title: string;
  description: string;
};

export type AgentSchemaDocument = AgentSchemaSummary & {
  jsonSchema: unknown;
};

export function listAgentSchemas(): AgentSchemaSummary[] {
  return agentSchemaIds().map((id) => {
    const entry = registry[id];
    return {
      id,
      title: entry.title,
      description: entry.description
    };
  });
}

export function getAgentSchema(id: string): AgentSchemaDocument | undefined {
  if (!isAgentSchemaId(id)) {
    return undefined;
  }

  const entry = registry[id];
  return {
    id,
    title: entry.title,
    description: entry.description,
    jsonSchema: z.toJSONSchema(entry.schema)
  };
}

function agentSchemaIds(): AgentSchemaId[] {
  return Object.keys(registry) as AgentSchemaId[];
}

function isAgentSchemaId(id: string): id is AgentSchemaId {
  return Object.prototype.hasOwnProperty.call(registry, id);
}
