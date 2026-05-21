import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { SdkParityError } from "@sdkparity/core";
import { openApiDocumentSchema, overlayDocumentSchema } from "./schemas.js";
import type { OpenApiDocument, OverlayDocument } from "./schemas.js";

export async function loadOpenApiDocument(source: string): Promise<OpenApiDocument> {
  const raw = await loadText(source);
  const parsed = parseStructuredDocument(raw, source);
  return openApiDocumentSchema.parse(parsed);
}

export async function loadOverlayDocument(source: string): Promise<OverlayDocument> {
  const raw = await loadText(source);
  const parsed = parseStructuredDocument(raw, source);
  return overlayDocumentSchema.parse(parsed);
}

async function loadText(source: string): Promise<string> {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new SdkParityError({
        code: "openapi_fetch_failed",
        message: `Could not fetch OpenAPI source: ${source}`,
        details: { status: response.status }
      });
    }
    return response.text();
  }

  return readFile(source, "utf8");
}

function parseStructuredDocument(raw: string, source: string): unknown {
  try {
    if (source.endsWith(".json")) {
      return JSON.parse(raw);
    }
    return YAML.parse(raw);
  } catch (error) {
    throw new SdkParityError({
      code: "structured_parse_failed",
      message: `Could not parse structured document: ${source}`,
      details: { error: error instanceof Error ? error.message : String(error) }
    });
  }
}
