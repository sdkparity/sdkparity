import { z } from "zod";

export const compatibilitySeveritySchema = z.enum(["info", "minor", "major"]);
export type CompatibilitySeverity = z.infer<typeof compatibilitySeveritySchema>;

export const compatibilityChangeSchema = z
  .object({
    code: z.string(),
    severity: compatibilitySeveritySchema,
    symbolId: z.string(),
    message: z.string(),
    before: z.unknown().optional(),
    after: z.unknown().optional()
  })
  .strict();

export type CompatibilityChange = z.infer<typeof compatibilityChangeSchema>;

export const compatibilityReportSchema = z
  .object({
    version: z.literal("0.1"),
    previousHash: z.string(),
    candidateHash: z.string(),
    summary: z.object({
      added: z.number(),
      removed: z.number(),
      changed: z.number(),
      major: z.number(),
      minor: z.number(),
      semverRecommendation: z.enum(["patch", "minor", "major", "unknown"])
    }),
    changes: z.array(compatibilityChangeSchema)
  })
  .strict();

export type CompatibilityReport = z.infer<typeof compatibilityReportSchema>;
