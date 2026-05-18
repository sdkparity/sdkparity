import type { SdkSurfaceManifest } from "./schemas";

export type ManifestSummary = {
  packageName: string;
  language: string;
  symbolCount: number;
  diagnosticCount: number;
  byKind: Record<string, number>;
};

export function summarizeManifest(manifest: SdkSurfaceManifest): ManifestSummary {
  const byKind: Record<string, number> = {};
  for (const symbol of manifest.symbols) {
    byKind[symbol.kind] = (byKind[symbol.kind] ?? 0) + 1;
  }

  return {
    packageName: manifest.package.name,
    language: manifest.package.language,
    symbolCount: manifest.symbols.length,
    diagnosticCount: manifest.diagnostics.length,
    byKind
  };
}
