import { expect, test } from "bun:test";
import { getAgentCapability, listAgentCapabilities } from "./capabilities";

test("lists compact agent capability metadata", () => {
  const capabilities = listAgentCapabilities();

  expect(capabilities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "agent.capability.discovery",
        surfaces: expect.arrayContaining(["cli", "mcp-http"]),
        readOnly: true
      }),
      expect.objectContaining({
        id: "mcp.codeMode.execute.dryRun",
        dryRunSupported: true,
        mutatesExternalState: false,
        inputSchemaIds: expect.arrayContaining(["mcp.codeMode.execute.input"])
      })
    ])
  );
});

test("returns capability details by stable id", () => {
  expect(getAgentCapability("mcp.operation.search")).toMatchObject({
    id: "mcp.operation.search",
    endpoints: [{ method: "POST", path: "/mcp/search" }],
    inspectNext: expect.arrayContaining(["mcp.search.input"])
  });
  expect(getAgentCapability("missing")).toBeUndefined();
});
