import { expect, test } from "bun:test";
import { generateCodeModeTypes, searchOperations } from "./code-mode";
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
});
