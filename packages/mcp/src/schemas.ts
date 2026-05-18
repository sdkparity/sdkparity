import { z } from "zod";

export const mcpSearchInputSchema = z
  .object({
    query: z.string().min(1),
    limit: z.number().int().min(1).max(50).default(10)
  })
  .strict();

export type McpSearchInput = z.infer<typeof mcpSearchInputSchema>;

export const mcpSearchResultSchema = z
  .object({
    operationId: z.string(),
    method: z.string(),
    path: z.string(),
    summary: z.string().optional()
  })
  .strict();

export type McpSearchResult = z.infer<typeof mcpSearchResultSchema>;

export const codeModeExecuteInputSchema = z
  .object({
    code: z.string().min(1),
    dryRun: z.boolean().default(true)
  })
  .strict();

export type CodeModeExecuteInput = z.infer<typeof codeModeExecuteInputSchema>;
