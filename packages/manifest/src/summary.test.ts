import { expect, test } from "bun:test";
import { summarizeManifest } from "./summary";
import { sdkSurfaceManifestSchema, type SdkSurfaceManifest } from "./schemas";

test("summarizes manifest symbol counts by kind", () => {
  const manifest = {
    version: "0.1",
    package: { name: "@sdkparity/fixture", language: "typescript", rootDir: "." },
    symbols: [
      {
        id: "Client",
        name: "Client",
        kind: "class",
        parameters: [],
        deprecated: false,
        sourceFile: "src/index.ts",
        origin: "unknown"
      },
      {
        id: "Client.listUsers",
        name: "listUsers",
        kind: "method",
        parameters: [],
        deprecated: false,
        sourceFile: "src/index.ts",
        origin: "unknown"
      }
    ],
    capabilities: [
      { id: "client.sync", present: true, evidence: ["symbol:Client"], symbolIds: ["Client"] },
      { id: "streaming", present: false, evidence: [], symbolIds: [] }
    ],
    diagnostics: [{ code: "fixture", severity: "warning", message: "Fixture diagnostic." }],
    hash: "hash"
  } satisfies SdkSurfaceManifest;

  expect(summarizeManifest(manifest)).toEqual({
    packageName: "@sdkparity/fixture",
    language: "typescript",
    symbolCount: 2,
    capabilityCount: 1,
    diagnosticCount: 1,
    byKind: { class: 1, method: 1 },
    capabilities: ["client.sync"]
  });
});

test("parses legacy manifests without capability evidence", () => {
  const parsed = sdkSurfaceManifestSchema.parse({
    version: "0.1",
    package: { name: "@sdkparity/legacy", language: "typescript", rootDir: "." },
    symbols: [],
    diagnostics: [],
    hash: "hash"
  });

  expect(parsed.capabilities).toEqual([]);
});
