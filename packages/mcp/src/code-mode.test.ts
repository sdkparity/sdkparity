import { expect, test } from "bun:test";
import { executeCodeModeDryRun, generateCodeModeTypes, searchOperations } from "./code-mode";
import type { NormalizedSpec } from "@sdkparity/openapi";

const spec: NormalizedSpec = {
  version: "0.1",
  title: "Fixture",
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
    }
  ],
  diagnostics: [],
  hash: "hash"
};

test("searches operations and emits Code Mode types", () => {
  expect(searchOperations(spec, { query: "users", limit: 10 })[0]?.operationId).toBe("listUsers");
  expect(generateCodeModeTypes(spec)).toContain("listUsers");
  expect(
    generateCodeModeTypes({
      ...spec,
      operations: [{ ...spec.operations[0]!, summary: "Do not close */ comment" }]
    })
  ).toContain("Do not close * / comment");
});

test("creates a strict Code Mode dry-run plan", () => {
  const result = executeCodeModeDryRun(spec, {
    code: "await api.listUsers({ limit: 10 })",
    dryRun: true
  });

  expect(result.ok).toBe(true);
  expect(result.calls[0]).toMatchObject({ operationId: "listUsers", dryRun: true });
});

test("reports empty plans and supports execute-by-operation-id filters", () => {
  expect(executeCodeModeDryRun(spec, { code: "console.log('noop')", dryRun: true })).toMatchObject({
    ok: false,
    diagnostics: [{ code: "no_operation_calls_detected" }]
  });

  expect(
    executeCodeModeDryRun(spec, {
      code: "await execute('listUsers')",
      dryRun: false,
      allowedOperationIds: ["listUsers"]
    })
  ).toMatchObject({
    ok: true,
    dryRun: false,
    output: "Execution is delegated to the hosted sandbox in production."
  });

  expect(
    executeCodeModeDryRun(spec, {
      code: "await client.listUsers({})",
      dryRun: true,
      allowedOperationIds: ["notAllowed"]
    }).calls
  ).toEqual([]);
});
