import { expect, test } from "bun:test";
import { canTransitionRunStage, expectedGenerationArtifacts, generationJobInputSchema, nextRunStage, runnerJobSchema } from "./state";

test("validates run stage transitions", () => {
  expect(canTransitionRunStage("queued", "inputs_fetched")).toBe(true);
  expect(canTransitionRunStage("ready_for_pr", "queued")).toBe(false);
  expect(nextRunStage("queued")).toBe("inputs_fetched");
  expect(
    runnerJobSchema.parse({
      id: "job_test",
      runId: "run_test",
      projectId: "prj_test",
      stage: "queued",
      idempotencyKey: "idem_test",
      attempt: 1
    }).artifacts
  ).toEqual([]);
});

test("describes expected TypeScript and Python generation artifacts", () => {
  const input = generationJobInputSchema.parse({
    specArtifactId: "art_spec",
    languages: ["typescript", "python"],
    previousManifestArtifactIds: { typescript: "art_old_ts" }
  });

  expect(input.dryRun).toBe(true);
  expect(expectedGenerationArtifacts(input)).toEqual([
    "normalized-spec",
    "mcp-manifest",
    "code-mode-types",
    "agent-eval-report",
    "agent-readiness-report",
    "release-plan",
    "sdk-archive",
    "manifest",
    "docs-snippets",
    "compatibility-report",
    "markdown-report",
    "sdk-archive",
    "manifest",
    "docs-snippets"
  ]);
});
