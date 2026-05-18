import { z } from "zod";

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
