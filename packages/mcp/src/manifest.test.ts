import { expect, test } from "bun:test";
import type { NormalizedSpec } from "@sdkparity/openapi";
import { generateMcpManifest } from "./manifest";

const spec: NormalizedSpec = {
  version: "0.1",
  title: "Fixture API",
  apiVersion: "1.0.0",
  operations: [
    {
      id: "GET /users",
      method: "get",
      path: "/users",
      operationId: "listUsers",
      sdkName: "listUsers",
      resource: "users",
      tags: ["users"],
      parameters: [],
      requestBodyContentTypes: [],
      responseStatusCodes: ["200"],
      authScopes: [],
      sdkVisibility: "public",
      mcpVisibility: "public",
      sourcePointer: "/paths/~1users/get"
    },
    {
      id: "POST /users",
      method: "post",
      path: "/users",
      operationId: "createUser",
      sdkName: "createUser",
      resource: "users",
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
      id: "GET /internal",
      method: "get",
      path: "/internal",
      operationId: "getInternal",
      sdkName: "getInternal",
      resource: "internal",
      tags: ["internal"],
      parameters: [],
      requestBodyContentTypes: [],
      responseStatusCodes: ["200"],
      authScopes: [],
      sdkVisibility: "internal",
      mcpVisibility: "hidden",
      sourcePointer: "/paths/~1internal/get"
    }
  ],
  diagnostics: [],
  hash: "hash"
};

test("generates grouped MCP workflow tools and Code Mode budget metadata", () => {
  const manifest = generateMcpManifest(spec);

  expect(manifest.operationCount).toBe(2);
  expect(manifest.tools).toEqual([
    expect.objectContaining({
      id: "users.workflow",
      operationIds: ["createUser", "listUsers"],
      readOnly: false,
      dryRunSupported: true
    })
  ]);
  expect(manifest.tokenBudget).toEqual({
    directToolCount: 2,
    groupedToolCount: 1,
    codeModeToolCount: 2
  });
  expect(manifest.codeModeTypeExport).toContain("listUsers");
  expect(manifest.codeModeTypeExport).not.toContain("getInternal");
  expect(manifest.hash).toHaveLength(64);
});

test("formats resource names for curated workflow titles", () => {
  const listUsersOperation = spec.operations[0];
  if (!listUsersOperation) {
    throw new Error("Expected listUsers fixture operation");
  }

  const manifest = generateMcpManifest({
    ...spec,
    operations: [
      {
        ...listUsersOperation,
        id: "GET /billing-events",
        path: "/billing-events",
        operationId: "listBillingEvents",
        sdkName: "listBillingEvents",
        resource: "billing-events",
        tags: ["billing-events"]
      },
      {
        ...listUsersOperation,
        id: "HEAD /audit_logs",
        method: "head",
        path: "/audit_logs",
        operationId: "checkAuditLogs",
        sdkName: "checkAuditLogs",
        resource: "audit_logs",
        tags: ["audit_logs"]
      }
    ]
  });

  expect(manifest.tools.map((tool) => tool.title)).toEqual(["Audit Logs workflow", "Billing Events workflow"]);
  expect(manifest.tools).toEqual([
    expect.objectContaining({ resource: "audit_logs", readOnly: true }),
    expect.objectContaining({ resource: "billing-events", readOnly: true })
  ]);
});
