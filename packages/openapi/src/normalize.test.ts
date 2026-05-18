import { expect, test } from "bun:test";
import { normalizeOpenApiDocument } from "./normalize";
import type { OpenApiDocument } from "./schemas";

test("normalizes operations and emits missing operationId diagnostics", () => {
  const doc: OpenApiDocument = {
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
  };

  const normalized = normalizeOpenApiDocument(doc);
  expect(normalized.operations[0]?.operationId).toBe("get_users");
  expect(normalized.diagnostics[0]?.code).toBe("missing_operation_id");
  expect(normalized.hash).toHaveLength(64);
});
