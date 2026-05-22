import type { CompatibilityReport } from "@sdkparity/compat";
import type { SdkSurfaceManifest } from "@sdkparity/manifest";

export function renderCompatibilityReportMarkdown(report: CompatibilityReport): string {
  const lines = [
    "# SDK Compatibility Report",
    "",
    `Semver recommendation: **${report.summary.semverRecommendation}**`,
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Added | ${report.summary.added} |`,
    `| Removed | ${report.summary.removed} |`,
    `| Changed | ${report.summary.changed} |`,
    `| Major | ${report.summary.major} |`,
    `| Minor | ${report.summary.minor} |`,
    "",
    "## Changes",
    ""
  ];

  if (report.changes.length === 0) {
    lines.push("No public surface changes detected.");
  } else {
    for (const change of report.changes) {
      lines.push(`- **${change.severity}** \`${change.symbolId}\`: ${change.message}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function renderManifestSummaryMarkdown(manifest: SdkSurfaceManifest): string {
  return [
    "# SDK Surface Manifest",
    "",
    `Package: \`${manifest.package.name}\``,
    `Language: \`${manifest.package.language}\``,
    `Symbols: ${manifest.symbols.length}`,
    `Capabilities: ${manifest.capabilities.filter((capability) => capability.present).length}`,
    `Diagnostics: ${manifest.diagnostics.length}`,
    `Hash: \`${manifest.hash}\``,
    ""
  ].join("\n");
}
