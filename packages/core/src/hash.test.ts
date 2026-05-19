import { expect, test } from "bun:test";
import { contentHash, sha256Hex, stableStringify } from "./hash";

test("stableStringify sorts object keys", () => {
  expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
    '{"a":{"c":3,"d":2},"b":1}'
  );
  expect(stableStringify([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
});

test("hashes content with stable object ordering", () => {
  expect(sha256Hex("sdkparity")).toHaveLength(64);
  expect(contentHash({ b: 1, a: 2 })).toBe(contentHash({ a: 2, b: 1 }));
});
