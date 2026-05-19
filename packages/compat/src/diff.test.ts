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

test("reports added, kind-changed, signature-changed, and unchanged surfaces", () => {
  const changed = diffManifests(
    base,
    {
      ...base,
      hash: "candidate",
      symbols: [
        {
          ...base.symbols[0]!,
          kind: "function"
        },
        {
          id: "Client.createUser",
          name: "createUser",
          kind: "method",
          namespace: "Client",
          parameters: [{ name: "input", type: "CreateUserInput", optional: false }],
          returnType: "Promise<User>",
          deprecated: false,
          sourceFile: "src/index.ts",
          origin: "generated"
        }
      ]
    }
  );

  expect(changed.summary).toMatchObject({
    added: 1,
    removed: 0,
    changed: 2,
    major: 2,
    minor: 1,
    semverRecommendation: "major"
  });
  expect(changed.changes.map((change) => change.code)).toContain("symbol_kind_changed");
  expect(changed.changes.map((change) => change.code)).toContain("signature_changed");
  expect(changed.changes.map((change) => change.code)).toContain("symbol_added");

  expect(diffManifests(base, { ...base, hash: "same" }).summary.semverRecommendation).toBe("patch");
});
