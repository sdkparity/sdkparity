import { expect, test } from "bun:test";
import { renderCompatibilityReportMarkdown } from "./markdown";

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
