import type { SdkSurfaceManifest } from "./schemas";

export type ManifestSummary = {
  packageName: string;
  language: string;
  symbolCount: number;
  capabilityCount: number;
  diagnosticCount: number;
  byKind: Record<string, number>;
  capabilities: string[];
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
    capabilityCount: manifest.capabilities.filter((capability) => capability.present).length,
    diagnosticCount: manifest.diagnostics.length,
    byKind,
    capabilities: manifest.capabilities.filter((capability) => capability.present).map((capability) => capability.id)
  };
}
