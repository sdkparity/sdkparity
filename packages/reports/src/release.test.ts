import { expect, test } from "bun:test";
import { createReleasePlan, renderReleasePlanMarkdown } from "./release";

test("creates and renders release plans with npm and PyPI dry-runs", () => {
  const plan = createReleasePlan({
    runId: "run_123",
    semverRecommendation: "minor",
    dryRuns: [
      {
        language: "typescript",
        packageName: "@example/sdk",
        command: "npm publish --dry-run",
        passed: true
      },
      {
        language: "python",
        packageName: "example-sdk",
        command: "python -m build && twine check dist/*",
        passed: true
      }
    ],
    blockers: [],
    approvalRequired: true
  });

  expect(plan.version).toBe("0.1");
  expect(renderReleasePlanMarkdown(plan)).toContain("No release blockers detected.");
  expect(renderReleasePlanMarkdown(plan)).toContain("twine check");
});

test("renders release blockers when dry-runs need follow-up", () => {
  const plan = createReleasePlan({
    runId: "run_blocked",
    semverRecommendation: "patch",
    dryRuns: [
      {
        language: "python",
        packageName: "example-sdk",
        command: "python -m build && twine check dist/*",
        passed: false
      }
    ],
    blockers: ["PyPI package metadata check failed."],
    approvalRequired: true
  });

  const markdown = renderReleasePlanMarkdown(plan);

  expect(markdown).toContain("| python | `example-sdk` |");
  expect(markdown).toContain("blocked");
  expect(markdown).toContain("- PyPI package metadata check failed.");
  expect(markdown).not.toContain("No release blockers detected.");
});
