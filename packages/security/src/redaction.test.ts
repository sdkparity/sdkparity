import { expect, test } from "bun:test";
import { redactSecrets } from "./redaction";

test("redacts common secret shapes", () => {
  expect(redactSecrets("API_TOKEN=abc Bearer xyz")).toContain("[REDACTED]");
});
