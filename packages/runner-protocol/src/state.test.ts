import { expect, test } from "bun:test";
import { canTransitionRunStage } from "./state";

test("validates run stage transitions", () => {
  expect(canTransitionRunStage("queued", "inputs_fetched")).toBe(true);
  expect(canTransitionRunStage("ready_for_pr", "queued")).toBe(false);
});
