import { expect, test } from "bun:test";
import { getAgentSchema, listAgentSchemas } from "./introspection";

test("lists compact agent schema summaries", () => {
  expect(listAgentSchemas()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "agent.capability.list.result" }),
      expect.objectContaining({ id: "mcp.manifest" }),
      expect.objectContaining({ id: "mcp.codeMode.execute.input" }),
      expect.objectContaining({ id: "mcp.codeMode.execute.result" })
    ])
  );
});

test("returns JSON schema for known contracts", () => {
  const schema = getAgentSchema("mcp.codeMode.execute.input");

  expect(schema).toMatchObject({
    id: "mcp.codeMode.execute.input",
    jsonSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        dryRun: { type: "boolean" }
      }
    }
  });
  expect(getAgentSchema("missing")).toBeUndefined();
});

test("returns JSON schema for capability discovery output", () => {
  expect(getAgentSchema("agent.capability.list.result")).toMatchObject({
    id: "agent.capability.list.result",
    jsonSchema: {
      type: "array",
      items: {
        type: "object",
        required: expect.arrayContaining(["id", "surfaces", "readOnly", "dryRunSupported"])
      }
    }
  });
});
