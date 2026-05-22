import { z } from "zod";

export const sdkGeneratorTargetSchema = z
  .object({
    packageName: z.string().optional(),
    output: z.string().optional()
  })
  .strict();

export const sdkGeneratorPythonTargetSchema = sdkGeneratorTargetSchema
  .extend({
    moduleName: z.string().optional()
  })
  .strict();

export const sdkGeneratorDocsTargetSchema = sdkGeneratorTargetSchema
  .extend({
    title: z.string().optional()
  })
  .strict();

export const sdkGeneratorResponseFilterSchema = z
  .object({
    type: z.enum(["jsonPath", "jq", "fields", "maxItems"]),
    expression: z.string().optional(),
    fields: z.array(z.string()).optional(),
    maxItems: z.number().int().positive().optional()
  })
  .strict();

export const sdkGeneratorSandboxSchema = z
  .object({
    adapter: z.enum(["local-safe", "external"]).optional(),
    allowNetwork: z.boolean().optional(),
    allowFilesystem: z.boolean().optional(),
    allowedEnvironmentVariables: z.array(z.string()).optional()
  })
  .strict();

export const sdkGeneratorMcpTargetSchema = sdkGeneratorTargetSchema
  .extend({
    enabled: z.boolean().optional(),
    codeMode: z.boolean().optional(),
    codeModeOnly: z.boolean().optional(),
    codeModeEnvVar: z.string().optional(),
    dynamicTools: z.boolean().optional(),
    responseFilters: z.record(z.string(), sdkGeneratorResponseFilterSchema).optional(),
    sandbox: sdkGeneratorSandboxSchema.optional()
  })
  .strict();

export const sdkGeneratorCliTargetSchema = sdkGeneratorTargetSchema
  .extend({
    enabled: z.boolean().optional(),
    binaryName: z.string().optional()
  })
  .strict();

export const sdkGeneratorRateLimitSchema = z
  .object({
    maxConcurrent: z.number().int().positive().optional(),
    requestsPerSecond: z.number().positive().optional(),
    burst: z.number().int().positive().optional()
  })
  .strict();

export const sdkGeneratorRetryBackoffSchema = z
  .object({
    initialDelayMs: z.number().int().positive().optional(),
    maxDelayMs: z.number().int().positive().optional(),
    maxElapsedMs: z.number().int().positive().optional(),
    multiplier: z.number().positive().optional(),
    jitter: z.number().min(0).max(1).optional()
  })
  .strict();

export const sdkGeneratorOperationReliabilitySchema = z
  .object({
    maxRetries: z.number().int().nonnegative().optional(),
    timeoutMs: z.number().int().positive().optional(),
    retryableStatuses: z.array(z.number().int().positive()).optional(),
    backoff: sdkGeneratorRetryBackoffSchema.optional(),
    rateLimit: sdkGeneratorRateLimitSchema.optional()
  })
  .strict();

export const sdkGeneratorReliabilitySchema = z
  .object({
    maxRetries: z.number().int().nonnegative().optional(),
    timeoutMs: z.number().int().positive().optional(),
    retryHeaderName: z.string().optional(),
    idempotency: z
      .object({
        enabled: z.boolean().optional(),
        headerName: z.string().optional(),
        autoGenerate: z.boolean().optional()
      })
      .strict()
      .optional(),
    backoff: sdkGeneratorRetryBackoffSchema.optional(),
    rateLimit: sdkGeneratorRateLimitSchema.optional(),
    operations: z.record(z.string(), sdkGeneratorOperationReliabilitySchema).optional()
  })
  .strict();

export const sdkGeneratorPaginationSchema = z
  .object({
    strategy: z.enum(["cursor", "offset", "page", "token", "nextUrl", "none"]),
    inputTokenPath: z.string().optional(),
    outputTokenPath: z.string().optional(),
    itemPath: z.string().optional(),
    limitParam: z.string().optional(),
    pageParam: z.string().optional(),
    offsetParam: z.string().optional(),
    nextUrlPath: z.string().optional()
  })
  .strict();

export const sdkGeneratorAuthSchema = z
  .object({
    type: z.enum(["bearer", "apiKey", "oauth2", "none"]).optional(),
    headerName: z.string().optional(),
    envName: z.string().optional(),
    tokenUrl: z.string().optional(),
    scopes: z.array(z.string()).optional()
  })
  .strict();

export const sdkGeneratorResourceOverrideSchema = z
  .object({
    name: z.string().optional(),
    propertyName: z.string().optional(),
    className: z.string().optional()
  })
  .strict();

export const sdkGeneratorExampleSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    requestOptions: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const sdkGeneratorOperationOverrideSchema = z
  .object({
    resourceName: z.string().optional(),
    methodName: z.string().optional(),
    summary: z.string().optional(),
    pagination: z.union([sdkGeneratorPaginationSchema, z.literal(false)]).optional(),
    retry: z.union([sdkGeneratorOperationReliabilitySchema, z.literal(false)]).optional(),
    auth: z.union([sdkGeneratorAuthSchema, z.literal(false)]).optional(),
    example: sdkGeneratorExampleSchema.optional()
  })
  .strict();

export const sdkGeneratorEnvironmentSchema = z
  .object({
    url: z.string(),
    description: z.string().optional(),
    variables: z.record(z.string(), z.string()).optional()
  })
  .strict();

export const sdkGeneratorTransformSchema = z
  .object({
    type: z.enum(["renameResource", "renameMethod", "excludeOperation", "includeOperation"]),
    selector: z.string(),
    value: z.string().optional()
  })
  .strict();

export const sdkGeneratorDocsSchema = z
  .object({
    title: z.string().optional(),
    versionLabel: z.string().optional(),
    migration: z
      .object({
        from: z.string().optional(),
        notes: z.array(z.string()).optional()
      })
      .strict()
      .optional()
  })
  .strict();

export const sdkGeneratorPackageMetadataSchema = z
  .object({
    repository: z.string().optional(),
    license: z.string().optional(),
    author: z.string().optional(),
    release: z
      .object({
        npm: z.boolean().optional(),
        pypi: z.boolean().optional(),
        provenance: z.boolean().optional(),
        prereleaseChannel: z.string().optional()
      })
      .strict()
      .optional()
  })
  .strict();

export const sdkGeneratorCompatibilitySchema = z
  .object({
    provider: z.string().optional(),
    config: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const sdkGeneratorConfigSchema = z
  .object({
    input: z.string().min(1),
    output: z.string().min(1),
    packageName: z.string().min(1),
    clientName: z.string().optional(),
    envPrefix: z.string().optional(),
    targets: z
      .object({
        typescript: sdkGeneratorTargetSchema.optional(),
        python: sdkGeneratorPythonTargetSchema.optional(),
        docs: sdkGeneratorDocsTargetSchema.optional(),
        mcp: sdkGeneratorMcpTargetSchema.optional(),
        cli: sdkGeneratorCliTargetSchema.optional()
      })
      .strict(),
    reliability: sdkGeneratorReliabilitySchema.optional(),
    compatibility: sdkGeneratorCompatibilitySchema.optional(),
    resources: z.record(z.string(), sdkGeneratorResourceOverrideSchema).optional(),
    operations: z.record(z.string(), sdkGeneratorOperationOverrideSchema).optional(),
    pagination: z.record(z.string(), sdkGeneratorPaginationSchema).optional(),
    auth: sdkGeneratorAuthSchema.optional(),
    environments: z.record(z.string(), sdkGeneratorEnvironmentSchema).optional(),
    transforms: z.array(sdkGeneratorTransformSchema).optional(),
    examples: z.record(z.string(), sdkGeneratorExampleSchema).optional(),
    docs: sdkGeneratorDocsSchema.optional(),
    package: sdkGeneratorPackageMetadataSchema.optional()
  })
  .strict();

export type SdkGeneratorConfig = z.infer<typeof sdkGeneratorConfigSchema>;
export type SdkGeneratorTarget = z.infer<typeof sdkGeneratorTargetSchema>;
export type SdkGeneratorPythonTarget = z.infer<typeof sdkGeneratorPythonTargetSchema>;
export type SdkGeneratorDocsTarget = z.infer<typeof sdkGeneratorDocsTargetSchema>;
export type SdkGeneratorMcpTarget = z.infer<typeof sdkGeneratorMcpTargetSchema>;
export type SdkGeneratorCliTarget = z.infer<typeof sdkGeneratorCliTargetSchema>;
export type SdkGeneratorResponseFilter = z.infer<typeof sdkGeneratorResponseFilterSchema>;
export type SdkGeneratorSandbox = z.infer<typeof sdkGeneratorSandboxSchema>;
export type SdkGeneratorRetryBackoff = z.infer<typeof sdkGeneratorRetryBackoffSchema>;
export type SdkGeneratorReliability = z.infer<typeof sdkGeneratorReliabilitySchema>;
export type SdkGeneratorOperationReliability = z.infer<typeof sdkGeneratorOperationReliabilitySchema>;
export type SdkGeneratorCompatibility = z.infer<typeof sdkGeneratorCompatibilitySchema>;
export type SdkGeneratorPagination = z.infer<typeof sdkGeneratorPaginationSchema>;
export type SdkGeneratorAuth = z.infer<typeof sdkGeneratorAuthSchema>;
export type SdkGeneratorResourceOverride = z.infer<typeof sdkGeneratorResourceOverrideSchema>;
export type SdkGeneratorOperationOverride = z.infer<typeof sdkGeneratorOperationOverrideSchema>;
export type SdkGeneratorEnvironment = z.infer<typeof sdkGeneratorEnvironmentSchema>;
export type SdkGeneratorTransform = z.infer<typeof sdkGeneratorTransformSchema>;
export type SdkGeneratorExample = z.infer<typeof sdkGeneratorExampleSchema>;
export type SdkGeneratorDocs = z.infer<typeof sdkGeneratorDocsSchema>;
export type SdkGeneratorPackageMetadata = z.infer<typeof sdkGeneratorPackageMetadataSchema>;
