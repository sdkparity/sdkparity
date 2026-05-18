import { expect, test } from "bun:test";
import { stableStringify } from "./hash";

test("stableStringify sorts object keys", () => {
  expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
    '{"a":{"c":3,"d":2},"b":1}'
  );
});
