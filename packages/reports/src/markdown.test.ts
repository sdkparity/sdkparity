import { expect, test } from "bun:test";
import { renderCompatibilityReportMarkdown, renderManifestSummaryMarkdown } from "./markdown";

test("renders compatibility reports as markdown", () => {
  const markdown = renderCompatibilityReportMarkdown({
    version: "0.1",
    previousHash: "old",
    candidateHash: "new",
    summary: {
      added: 1,
      removed: 0,
      changed: 0,
      major: 0,
      minor: 1,
      semverRecommendation: "minor"
    },
    changes: [
      {
        code: "symbol_added",
        severity: "minor",
        symbolId: "Client.createUser",
        message: "Public symbol was added: Client.createUser"
      }
    ]
  });

  expect(markdown).toContain("Semver recommendation");
  expect(markdown).toContain("Client.createUser");
});

test("renders no-change compatibility reports and manifest summaries", () => {
  expect(
    renderCompatibilityReportMarkdown({
      version: "0.1",
      previousHash: "old",
      candidateHash: "new",
      summary: {
        added: 0,
        removed: 0,
        changed: 0,
        major: 0,
        minor: 0,
        semverRecommendation: "patch"
      },
      changes: []
    })
  ).toContain("No public surface changes detected.");

  expect(
    renderManifestSummaryMarkdown({
      version: "0.1",
      package: { name: "@sdkparity/test-sdk", language: "typescript", rootDir: "." },
      symbols: [],
      diagnostics: [],
      hash: "hash"
    })
  ).toContain("SDK Surface Manifest");
});
