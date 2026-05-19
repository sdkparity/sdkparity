import { expect, test } from "bun:test";
import { getAgentSchema, listAgentSchemas } from "./introspection";

test("lists compact agent schema summaries", () => {
  expect(listAgentSchemas()).toEqual(
    expect.arrayContaining([
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
