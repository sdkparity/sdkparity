import { z } from "zod";

export const releaseDryRunSchema = z
  .object({
    language: z.enum(["typescript", "python"]),
    packageName: z.string().min(1),
    command: z.string().min(1),
    passed: z.boolean()
  })
  .strict();

export type ReleaseDryRun = z.infer<typeof releaseDryRunSchema>;

export const releasePlanSchema = z
  .object({
    version: z.literal("0.1"),
    runId: z.string().min(1),
    semverRecommendation: z.enum(["patch", "minor", "major", "unknown"]),
    dryRuns: z.array(releaseDryRunSchema),
    blockers: z.array(z.string()).default([]),
    approvalRequired: z.boolean()
  })
  .strict();

export type ReleasePlan = z.infer<typeof releasePlanSchema>;

export function createReleasePlan(input: Omit<ReleasePlan, "version">): ReleasePlan {
  return releasePlanSchema.parse({ version: "0.1", ...input });
}

export function renderReleasePlanMarkdown(plan: ReleasePlan): string {
  const lines = [
    "# SDK Release Plan",
    "",
    `Run: \`${plan.runId}\``,
    `Semver recommendation: **${plan.semverRecommendation}**`,
    `Approval required: **${plan.approvalRequired ? "yes" : "no"}**`,
    "",
    "## Package Dry Runs",
    "",
    "| Language | Package | Command | Status |",
    "| --- | --- | --- | --- |",
    ...plan.dryRuns.map(
      (dryRun) =>
        `| ${dryRun.language} | \`${dryRun.packageName}\` | \`${dryRun.command}\` | ${dryRun.passed ? "passed" : "blocked"} |`
    ),
    "",
    "## Blockers",
    ""
  ];

  if (plan.blockers.length === 0) {
    lines.push("No release blockers detected.");
  } else {
    for (const blocker of plan.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
