import { contentHash, slugifyId } from "@sdkparity/core";
import { applyOperationOverlay } from "./overlay.js";
import { httpMethodSchema, normalizedSpecSchema } from "./schemas.js";
import type {
  HttpMethod,
  NormalizedOperation,
  NormalizedParameter,
  NormalizedSpec,
  NormalizedSpecDiagnostic,
  OpenApiDocument,
  OverlayDocument
} from "./schemas.js";

const HTTP_METHODS = new Set(httpMethodSchema.options);

export function normalizeOpenApiDocument(
  document: OpenApiDocument,
  overlay?: OverlayDocument
): NormalizedSpec {
  const diagnostics: NormalizedSpecDiagnostic[] = [];
  const operations: NormalizedOperation[] = [];
  const seenOperationIds = new Set<string>();

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") {
      diagnostics.push({
        code: "invalid_path_item",
        message: `Path item is not an object: ${path}`,
        severity: "error",
        pointer: `/paths/${escapePointer(path)}`
      });
      continue;
    }

    for (const [methodKey, rawOperation] of Object.entries(pathItem as Record<string, unknown>)) {
      const method = methodKey.toLowerCase();
      if (!HTTP_METHODS.has(method as HttpMethod)) {
        continue;
      }
      if (!rawOperation || typeof rawOperation !== "object") {
        diagnostics.push({
          code: "invalid_operation",
          message: `Operation is not an object: ${method.toUpperCase()} ${path}`,
          severity: "error",
          pointer: `/paths/${escapePointer(path)}/${method}`
        });
        continue;
      }

      const operationObject = rawOperation as Record<string, unknown>;
      const fallbackOperationId = slugifyId(`${method}_${path}`);
      const providedOperationId = stringValue(operationObject.operationId);
      const operationId = providedOperationId ?? fallbackOperationId;

      if (!providedOperationId) {
        diagnostics.push({
          code: "missing_operation_id",
          message: `Generated operationId for ${method.toUpperCase()} ${path}`,
          severity: "warning",
          pointer: `/paths/${escapePointer(path)}/${method}`
        });
      }

      if (seenOperationIds.has(operationId)) {
        diagnostics.push({
          code: "duplicate_operation_id",
          message: `Duplicate operationId: ${operationId}`,
          severity: "error",
          pointer: `/paths/${escapePointer(path)}/${method}/operationId`
        });
      }
      seenOperationIds.add(operationId);

      const operation = applyOperationOverlay(
        {
          id: `${method.toUpperCase()} ${path}`,
          method: method as HttpMethod,
          path,
          operationId,
          sdkName: toSdkName(operationId),
          resource: inferResource(path, operationObject),
          summary: stringValue(operationObject.summary),
          description: stringValue(operationObject.description),
          tags: arrayOfStrings(operationObject.tags),
          parameters: normalizeParameters(operationObject.parameters),
          requestBodyContentTypes: normalizeRequestBodyContentTypes(operationObject.requestBody),
          responseStatusCodes: normalizeResponseStatusCodes(operationObject.responses),
          authScopes: normalizeAuthScopes(operationObject.security ?? document.security),
          sdkVisibility: "public",
          mcpVisibility: "public",
          sourcePointer: `/paths/${escapePointer(path)}/${method}`
        },
        overlay
      );

      operations.push(operation);
    }
  }

  const normalizedWithoutHash = {
    version: "0.1" as const,
    title: document.info.title ?? "Untitled API",
    apiVersion: document.info.version ?? "0.0.0",
    operations: operations.sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics
  };

  return normalizedSpecSchema.parse({
    ...normalizedWithoutHash,
    hash: contentHash(normalizedWithoutHash)
  });
}

function normalizeParameters(raw: unknown): NormalizedParameter[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry): NormalizedParameter[] => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const parameter = entry as Record<string, unknown>;
    const name = stringValue(parameter.name);
    const location = stringValue(parameter.in);
    if (!name || !location) {
      return [];
    }
    return [
      {
        name,
        in: location,
        required: parameter.required === true,
        ...(schemaReference(parameter.schema) ? { schemaRef: schemaReference(parameter.schema) } : {})
      }
    ];
  });
}

function normalizeRequestBodyContentTypes(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const content = (raw as Record<string, unknown>).content;
  if (!content || typeof content !== "object") {
    return [];
  }
  return Object.keys(content).sort();
}

function normalizeResponseStatusCodes(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  return Object.keys(raw).sort();
}

function normalizeAuthScopes(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const scopes = new Set<string>();
  for (const requirement of raw) {
    if (!requirement || typeof requirement !== "object") {
      continue;
    }
    if (Object.keys(requirement as Record<string, unknown>).length === 0) {
      return [];
    }
    for (const [scheme, value] of Object.entries(requirement as Record<string, unknown>)) {
      if (Array.isArray(value) && value.length > 0) {
        for (const scope of value) {
          if (typeof scope === "string") {
            scopes.add(`${scheme}:${scope}`);
          }
        }
      } else {
        scopes.add(scheme);
      }
    }
  }
  return [...scopes].sort();
}

function schemaReference(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const ref = (raw as Record<string, unknown>).$ref;
  return typeof ref === "string" ? ref : undefined;
}

function inferResource(path: string, operationObject: Record<string, unknown>): string {
  const tags = arrayOfStrings(operationObject.tags);
  if (tags[0]) {
    return slugifyId(tags[0]);
  }

  const segment = path
    .split("/")
    .filter(Boolean)
    .find((part) => !part.startsWith("{"));
  return slugifyId(segment ?? "root");
}

function toSdkName(operationId: string): string {
  return operationId
    .replace(/[_-]+([a-z0-9])/g, (_, char: string) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

function arrayOfStrings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function escapePointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
