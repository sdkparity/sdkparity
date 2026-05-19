import { expect, test } from "bun:test";
import { normalizeOpenApiDocument } from "./normalize";
import type { OpenApiDocument } from "./schemas";

test("normalizes operations and emits missing operationId diagnostics", () => {
  const doc = {
    openapi: "3.1.0",
    info: { title: "Fixture", version: "1.0.0" },
    paths: {
      "/users": {
        get: {
          tags: ["Users"],
          responses: { "200": { description: "OK" } }
        }
      }
    }
  } as unknown as OpenApiDocument;

  const normalized = normalizeOpenApiDocument(doc);
  expect(normalized.operations[0]?.operationId).toBe("get_users");
  expect(normalized.diagnostics[0]?.code).toBe("missing_operation_id");
  expect(normalized.hash).toHaveLength(64);
});

test("normalizes overlays, request metadata, auth scopes, and invalid shapes", () => {
  const doc = {
    openapi: "3.1.0",
    info: {},
    paths: {
      "/users": {
        get: {
          operationId: "listUsers",
          description: "Detailed user list",
          tags: ["Users"],
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { $ref: "#/components/schemas/Limit" }
            },
            {
              name: "cursor",
              in: "query",
              schema: false
            },
            "invalid",
            { name: "missing-location" }
          ],
          requestBody: { content: { "application/json": {}, "text/plain": {} } },
          responses: { "200": { description: "OK" }, "404": { description: "Missing" } },
          security: [{ oauth: ["read"], apiKey: [] }, "invalid"]
        },
        post: {
          operationId: "listUsers",
          responses: {}
        },
        put: {
          operationId: "updateUser",
          requestBody: {},
          responses: false
        },
        parameters: []
      },
      "/health": {
        get: false
      },
      "/": {
        get: {
          operationId: "get-root",
          responses: {}
        }
      },
      "/widgets": {
        get: {
          operationId: "ListWidgets",
          responses: {}
        }
      },
      "/invalid": "nope"
    }
  } as unknown as OpenApiDocument;

  const normalized = normalizeOpenApiDocument(doc, {
    version: "0.1",
    operations: {
      "GET /users": {
        operationId: "usersList",
        sdkName: "list",
        resource: "accounts",
        authScopes: ["custom:scope"],
        sdkVisibility: "internal",
        mcpVisibility: "hidden"
      },
      "get-root": { sdkName: "getRoot" }
    }
  });

  const users = normalized.operations.find((operation) => operation.id === "GET /users");
  expect(normalized.title).toBe("Untitled API");
  expect(normalized.apiVersion).toBe("0.0.0");
  expect(users).toMatchObject({
    operationId: "usersList",
    sdkName: "list",
    resource: "accounts",
    requestBodyContentTypes: ["application/json", "text/plain"],
    responseStatusCodes: ["200", "404"],
    authScopes: ["custom:scope"],
    sdkVisibility: "internal",
    mcpVisibility: "hidden"
  });
  expect(users?.parameters).toEqual([
    {
      name: "limit",
      in: "query",
      required: false,
      schemaRef: "#/components/schemas/Limit"
    },
    {
      name: "cursor",
      in: "query",
      required: false
    }
  ]);
  expect(normalized.operations.find((operation) => operation.id === "GET /")?.resource).toBe("root");
  expect(normalized.operations.find((operation) => operation.id === "GET /widgets")?.sdkName).toBe(
    "listWidgets"
  );
  expect(normalized.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
    "duplicate_operation_id",
    "invalid_operation",
    "invalid_path_item"
  ]);
});
