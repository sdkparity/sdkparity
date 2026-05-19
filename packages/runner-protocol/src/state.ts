import { z } from "zod";
import { generationLanguageSchema } from "./language";

export const runStageSchema = z.enum([
  "queued",
  "inputs_fetched",
  "spec_normalized",
  "generated",
  "compiled",
  "manifested",
  "diffed",
  "tested",
  "reported",
  "ready_for_pr",
  "failed_recoverable",
  "failed_terminal"
]);

export type RunStage = z.infer<typeof runStageSchema>;

export const runnerArtifactKindSchema = z.enum([
  "normalized-spec",
  "sdk-archive",
  "manifest",
  "compatibility-report",
  "markdown-report",
  "docs-snippets",
  "mcp-manifest",
  "code-mode-types",
  "agent-eval-report",
  "agent-readiness-report",
  "release-plan",
  "eval-trace",
  "log"
]);

export type RunnerArtifactKind = z.infer<typeof runnerArtifactKindSchema>;

export const runnerArtifactSchema = z
  .object({
    id: z.string(),
    kind: runnerArtifactKindSchema,
    contentHash: z.string().min(16),
    contentType: z.string(),
    uri: z.string(),
    createdAt: z.string()
  })
  .strict();

export type RunnerArtifact = z.infer<typeof runnerArtifactSchema>;

export const runnerJobSchema = z
  .object({
    id: z.string(),
    runId: z.string(),
    projectId: z.string(),
    stage: runStageSchema,
    idempotencyKey: z.string().min(8),
    attempt: z.number().int().min(1),
    artifacts: z.array(runnerArtifactSchema).default([])
  })
  .strict();

export type RunnerJob = z.infer<typeof runnerJobSchema>;

export const generationJobInputSchema = z
  .object({
    specArtifactId: z.string().min(1),
    overlayArtifactId: z.string().min(1).optional(),
    languages: z.array(generationLanguageSchema).min(1),
    previousManifestArtifactIds: z
      .object({
        typescript: z.string().min(1).optional(),
        python: z.string().min(1).optional()
      })
      .strict()
      .default({}),
    dryRun: z.boolean().default(true)
  })
  .strict();

export type GenerationJobInput = z.infer<typeof generationJobInputSchema>;

export function expectedGenerationArtifacts(input: GenerationJobInput): RunnerArtifactKind[] {
  const parsed = generationJobInputSchema.parse(input);
  const artifacts: RunnerArtifactKind[] = [
    "normalized-spec",
    "mcp-manifest",
    "code-mode-types",
    "agent-eval-report",
    "agent-readiness-report",
    "release-plan"
  ];
  for (const language of parsed.languages) {
    artifacts.push("sdk-archive", "manifest", "docs-snippets");
    if (parsed.previousManifestArtifactIds[language]) {
      artifacts.push("compatibility-report", "markdown-report");
    }
  }
  return artifacts;
}

const allowedTransitions: Record<RunStage, RunStage[]> = {
  queued: ["inputs_fetched", "failed_terminal"],
  inputs_fetched: ["spec_normalized", "failed_recoverable", "failed_terminal"],
  spec_normalized: ["generated", "failed_recoverable", "failed_terminal"],
  generated: ["compiled", "failed_recoverable", "failed_terminal"],
  compiled: ["manifested", "failed_recoverable", "failed_terminal"],
  manifested: ["diffed", "failed_recoverable", "failed_terminal"],
  diffed: ["tested", "failed_recoverable", "failed_terminal"],
  tested: ["reported", "failed_recoverable", "failed_terminal"],
  reported: ["ready_for_pr", "failed_terminal"],
  ready_for_pr: [],
  failed_recoverable: ["queued", "failed_terminal"],
  failed_terminal: []
};

export function canTransitionRunStage(from: RunStage, to: RunStage): boolean {
  return allowedTransitions[from].includes(to);
}

export function nextRunStage(stage: RunStage): RunStage | undefined {
  return allowedTransitions[stage].find(
    (candidate) => candidate !== "failed_recoverable" && candidate !== "failed_terminal"
  );
}
