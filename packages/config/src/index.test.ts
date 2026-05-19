import { expect, test } from "bun:test";
import { normalizeLanguageAlias, parseLanguageList, parseSdkparityConfig } from "./index";

test("parses public SDK Parity config defaults", () => {
  expect(parseSdkparityConfig({ spec: "openapi.json" })).toEqual({
    version: "0.1",
    spec: "openapi.json",
    outputDir: "sdkparity-run",
    languages: ["typescript"],
    packages: {}
  });
});

test("normalizes language aliases and lists", () => {
  expect(normalizeLanguageAlias("ts")).toBe("typescript");
  expect(normalizeLanguageAlias("py")).toBe("python");
  expect(parseLanguageList("ts,python,typescript")).toEqual(["typescript", "python"]);
  expect(parseLanguageList(undefined)).toEqual(["typescript"]);
});
