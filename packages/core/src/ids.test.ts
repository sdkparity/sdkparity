import { expect, test } from "bun:test";
import { slugifyId } from "./ids";

test("slugifies arbitrary labels into stable SDK Parity ids", () => {
  expect(slugifyId("List Users")).toBe("list_users");
  expect(slugifyId("123 users")).toBe("id_123_users");
  expect(slugifyId("   ")).toBe("id_unknown");
});
