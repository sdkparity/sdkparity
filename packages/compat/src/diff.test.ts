import { expect, test } from "bun:test";
import { diffManifests } from "./diff";
import type { SdkSurfaceManifest } from "@sdkparity/manifest";

const base: SdkSurfaceManifest = {
  version: "0.1",
  package: { name: "fixture", language: "typescript", rootDir: "." },
  symbols: [
    {
      id: "Client.listUsers",
      name: "listUsers",
      kind: "method",
      namespace: "Client",
      parameters: [],
      returnType: "Promise<User[]>",
      deprecated: false,
      sourceFile: "src/index.ts",
      origin: "unknown"
    }
  ],
  diagnostics: [],
  hash: "old"
};

test("reports removed symbols as major", () => {
  const report = diffManifests({ ...base }, { ...base, symbols: [], hash: "new" });
  expect(report.summary.semverRecommendation).toBe("major");
  expect(report.changes[0]?.code).toBe("symbol_removed");
});
