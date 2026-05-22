import { z } from "zod";

export const sdkLanguageSchema = z.enum(["typescript", "python"]);
export type SdkLanguage = z.infer<typeof sdkLanguageSchema>;

export const symbolKindSchema = z.enum([
  "function",
  "class",
  "method",
  "interface",
  "type",
  "enum"
]);

export type SymbolKind = z.infer<typeof symbolKindSchema>;

export const sdkCapabilityIdSchema = z.enum([
  "client.async",
  "client.sync",
  "resources",
  "rawResponses",
  "pagination.items",
  "pagination.pages",
  "streaming",
  "hooks.requests",
  "hooks.responses",
  "hooks.retries",
  "typedErrors",
  "validation",
  "fileUploads",
  "binaryDownloads",
  "webhooks"
]);

export type SdkCapabilityId = z.infer<typeof sdkCapabilityIdSchema>;

export const manifestCapabilitySchema = z
  .object({
    id: sdkCapabilityIdSchema,
    present: z.boolean(),
    evidence: z.array(z.string()),
    symbolIds: z.array(z.string())
  })
  .strict();

export type ManifestCapability = z.infer<typeof manifestCapabilitySchema>;

export const manifestSymbolSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: symbolKindSchema,
    namespace: z.string().optional(),
    signature: z.string().optional(),
    parameters: z.array(z.object({ name: z.string(), type: z.string(), optional: z.boolean() })),
    returnType: z.string().optional(),
    deprecated: z.boolean(),
    sourceFile: z.string(),
    operationId: z.string().optional(),
    origin: z.enum(["generated", "handwritten", "unknown"]).default("unknown")
  })
  .strict();

export type ManifestSymbol = z.infer<typeof manifestSymbolSchema>;

export const packageMetadataSchema = z
  .object({
    name: z.string(),
    version: z.string().optional(),
    language: sdkLanguageSchema,
    rootDir: z.string()
  })
  .strict();

export type PackageMetadata = z.infer<typeof packageMetadataSchema>;

export const sdkSurfaceManifestDiagnosticSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    severity: z.enum(["info", "warning", "error"]),
    sourceFile: z.string().optional()
  })
  .strict();

export type SdkSurfaceManifestDiagnostic = z.infer<typeof sdkSurfaceManifestDiagnosticSchema>;

export const sdkSurfaceManifestSchema = z
  .object({
    version: z.literal("0.1"),
    package: packageMetadataSchema,
    symbols: z.array(manifestSymbolSchema),
    capabilities: z.array(manifestCapabilitySchema).default([]),
    diagnostics: z.array(sdkSurfaceManifestDiagnosticSchema),
    hash: z.string()
  })
  .strict();

export type SdkSurfaceManifest = z.infer<typeof sdkSurfaceManifestSchema>;
