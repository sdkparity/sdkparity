import type { ManifestSymbol, SdkSurfaceManifest } from "@sdkparity/manifest";
import { compatibilityReportSchema } from "./schemas";
import type { CompatibilityChange, CompatibilityReport } from "./schemas";

export function diffManifests(
  previous: SdkSurfaceManifest,
  candidate: SdkSurfaceManifest
): CompatibilityReport {
  const previousById = new Map(previous.symbols.map((symbol) => [symbol.id, symbol]));
  const candidateById = new Map(candidate.symbols.map((symbol) => [symbol.id, symbol]));
  const changes: CompatibilityChange[] = [];

  for (const symbol of previous.symbols) {
    const next = candidateById.get(symbol.id);
    if (!next) {
      changes.push({
        code: "symbol_removed",
        severity: "major",
        symbolId: symbol.id,
        message: `Public symbol was removed: ${symbol.id}`,
        before: publicSymbolShape(symbol)
      });
      continue;
    }

    if (symbol.kind !== next.kind) {
      changes.push({
        code: "symbol_kind_changed",
        severity: "major",
        symbolId: symbol.id,
        message: `Public symbol kind changed for ${symbol.id}`,
        before: symbol.kind,
        after: next.kind
      });
    }

    if (signatureShape(symbol) !== signatureShape(next)) {
      changes.push({
        code: "signature_changed",
        severity: "major",
        symbolId: symbol.id,
        message: `Public signature changed for ${symbol.id}`,
        before: publicSymbolShape(symbol),
        after: publicSymbolShape(next)
      });
    }
  }

  for (const symbol of candidate.symbols) {
    if (!previousById.has(symbol.id)) {
      changes.push({
        code: "symbol_added",
        severity: "minor",
        symbolId: symbol.id,
        message: `Public symbol was added: ${symbol.id}`,
        after: publicSymbolShape(symbol)
      });
    }
  }

  const major = changes.filter((change) => change.severity === "major").length;
  const minor = changes.filter((change) => change.severity === "minor").length;

  return compatibilityReportSchema.parse({
    version: "0.1",
    previousHash: previous.hash,
    candidateHash: candidate.hash,
    summary: {
      added: changes.filter((change) => change.code === "symbol_added").length,
      removed: changes.filter((change) => change.code === "symbol_removed").length,
      changed: changes.filter((change) => change.code.endsWith("_changed")).length,
      major,
      minor,
      semverRecommendation: major > 0 ? "major" : minor > 0 ? "minor" : "patch"
    },
    changes: changes.sort((a, b) => `${a.severity}:${a.symbolId}`.localeCompare(`${b.severity}:${b.symbolId}`))
  });
}

function signatureShape(symbol: ManifestSymbol): string {
  return JSON.stringify({
    kind: symbol.kind,
    parameters: symbol.parameters,
    returnType: symbol.returnType
  });
}

function publicSymbolShape(symbol: ManifestSymbol): Record<string, unknown> {
  return {
    id: symbol.id,
    kind: symbol.kind,
    parameters: symbol.parameters,
    returnType: symbol.returnType
  };
}
