import { z } from "zod";

export const httpMethodSchema = z.enum([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace"
]);

export type HttpMethod = z.infer<typeof httpMethodSchema>;

export const openApiDocumentSchema = z
  .object({
    openapi: z.string().min(1),
    info: z.object({
      title: z.string().optional(),
      version: z.string().optional()
    }),
    servers: z.array(z.object({ url: z.string() }).passthrough()).optional(),
    paths: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
    components: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export type OpenApiDocument = z.infer<typeof openApiDocumentSchema>;

export const sdkVisibilitySchema = z.enum(["public", "internal", "hidden"]);

export const operationOverlaySchema = z
  .object({
    operationId: z.string().optional(),
    sdkName: z.string().optional(),
    resource: z.string().optional(),
    modelName: z.string().optional(),
    pagination: z
      .object({
        type: z.enum(["none", "cursor", "offset", "page"]),
        cursorParam: z.string().optional(),
        nextCursorField: z.string().optional()
      })
      .optional(),
    authScopes: z.array(z.string()).optional(),
    sdkVisibility: sdkVisibilitySchema.optional(),
    mcpVisibility: sdkVisibilitySchema.optional(),
    notes: z.string().optional()
  })
  .strict();

export type OperationOverlay = z.infer<typeof operationOverlaySchema>;

export const overlayDocumentSchema = z
  .object({
    version: z.literal("0.1"),
    operations: z.record(z.string(), operationOverlaySchema).default({})
  })
  .strict();

export type OverlayDocument = z.infer<typeof overlayDocumentSchema>;

export const normalizedParameterSchema = z
  .object({
    name: z.string(),
    in: z.string(),
    required: z.boolean(),
    schemaRef: z.string().optional()
  })
  .strict();

export type NormalizedParameter = z.infer<typeof normalizedParameterSchema>;

export const normalizedOperationSchema = z
  .object({
    id: z.string(),
    method: httpMethodSchema,
    path: z.string(),
    operationId: z.string(),
    sdkName: z.string(),
    resource: z.string(),
    summary: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()),
    parameters: z.array(normalizedParameterSchema),
    requestBodyContentTypes: z.array(z.string()),
    responseStatusCodes: z.array(z.string()),
    authScopes: z.array(z.string()),
    sdkVisibility: sdkVisibilitySchema,
    mcpVisibility: sdkVisibilitySchema,
    sourcePointer: z.string()
  })
  .strict();

export type NormalizedOperation = z.infer<typeof normalizedOperationSchema>;

export const normalizedSpecDiagnosticSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    severity: z.enum(["info", "warning", "error"]),
    pointer: z.string().optional()
  })
  .strict();

export type NormalizedSpecDiagnostic = z.infer<typeof normalizedSpecDiagnosticSchema>;

export const normalizedSpecSchema = z
  .object({
    version: z.literal("0.1"),
    title: z.string(),
    apiVersion: z.string(),
    operations: z.array(normalizedOperationSchema),
    diagnostics: z.array(normalizedSpecDiagnosticSchema),
    hash: z.string()
  })
  .strict();

export type NormalizedSpec = z.infer<typeof normalizedSpecSchema>;
