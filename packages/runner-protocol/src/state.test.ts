import { expect, test } from "bun:test";
import { canTransitionRunStage, nextRunStage, runnerJobSchema } from "./state";

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
