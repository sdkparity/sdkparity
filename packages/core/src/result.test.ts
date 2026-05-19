import { expect, test } from "bun:test";
import { err, ok } from "./result";

test("creates explicit success and failure result values", () => {
  expect(ok({ id: "run_1" })).toEqual({ ok: true, value: { id: "run_1" } });
  expect(err("failed")).toEqual({ ok: false, error: "failed" });
});
