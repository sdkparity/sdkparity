import type { ManifestCapability, ManifestSymbol, SdkCapabilityId } from "./schemas";

export type ManifestSourceFile = {
  path: string;
  text: string;
};

const CAPABILITIES: SdkCapabilityId[] = [
  "client.async",
  "client.sync",
  "resources",
  "rawResponses",
  "pagination.items",
  "pagination.pages",
  "streaming",
  "hooks.requests",
  "hooks.responses",
  "hooks.retries",
  "typedErrors",
  "validation",
  "fileUploads",
  "binaryDownloads",
  "webhooks"
];

export function inferManifestCapabilities(
  symbols: readonly ManifestSymbol[],
  sourceFiles: readonly ManifestSourceFile[]
): ManifestCapability[] {
  const sourceText = sourceFiles.map((file) => file.text).join("\n");
  return CAPABILITIES.map((id) => capability(id, symbols, sourceFiles, sourceText));
}

function capability(
  id: SdkCapabilityId,
  symbols: readonly ManifestSymbol[],
  sourceFiles: readonly ManifestSourceFile[],
  sourceText: string
): ManifestCapability {
  const symbolMatches = symbols.filter((symbol) => matchesSymbol(id, symbol));
  const sourceMatches = sourceFiles
    .filter((file) => matchesSource(id, file.text))
    .map((file) => file.path);
  const globalSourceMatch = matchesSource(id, sourceText);
  const evidence = [
    ...sourceMatches.slice(0, 4).map((path) => `source:${path}`),
    ...(globalSourceMatch && sourceMatches.length === 0 ? ["source"] : []),
    ...symbolMatches.slice(0, 6).map((symbol) => `symbol:${symbol.id}`)
  ];

  return {
    id,
    present: evidence.length > 0,
    evidence,
    symbolIds: symbolMatches.map((symbol) => symbol.id)
  };
}

function matchesSymbol(id: SdkCapabilityId, symbol: ManifestSymbol): boolean {
  const normalized = `${symbol.id} ${symbol.name} ${symbol.namespace ?? ""} ${symbol.returnType ?? ""} ${
    symbol.signature ?? ""
  }`;
  switch (id) {
    case "client.async":
      return /(^|\.)Async[A-Z]|Promise<|AsyncIterable|async def /.test(normalized);
    case "client.sync":
      return (
        symbol.kind === "class" &&
        /(^|\.)[A-Za-z]*Client$/.test(symbol.id) &&
        !/Async[A-Z]/.test(symbol.id) &&
        !isTypeScriptSource(symbol.sourceFile)
      );
    case "resources":
      return /Resource$|resources?\//.test(`${symbol.id} ${symbol.sourceFile}`);
    case "rawResponses":
      return /WithResponse|with_response/.test(symbol.name);
    case "pagination.items":
      return /AutoPaging|auto_paging/.test(symbol.name);
    case "pagination.pages":
      return /Pages$|_pages$/.test(symbol.name);
    case "streaming":
      return /AsyncIterable|Iterator\[|stream|sse|ndjson/i.test(normalized);
    case "typedErrors":
      return symbol.kind === "class" && /Error$/.test(symbol.name);
    case "validation":
      return /ValidationError|validate|validation/i.test(normalized);
    case "webhooks":
      return /webhook|verifySignature|unwrap/i.test(normalized);
    case "hooks.requests":
    case "hooks.responses":
    case "hooks.retries":
    case "fileUploads":
    case "binaryDownloads":
      return false;
  }
}

function matchesSource(id: SdkCapabilityId, text: string): boolean {
  switch (id) {
    case "client.async":
      return /Promise<|AsyncIterable|async def |Async[A-Za-z]*Client/.test(text);
    case "client.sync":
      return /class (?!Async)[A-Za-z]*Client\b/.test(text) && /(^|\n)\s*def [a-zA-Z_][A-Za-z0-9_]*\(/.test(text);
    case "resources":
      return /class [A-Za-z]+Resource\b|resources\//.test(text);
    case "rawResponses":
      return /WithResponse|with_response|SDKResponse/.test(text);
    case "pagination.items":
      return /AutoPaging|auto_paging/.test(text);
    case "pagination.pages":
      return /Pages\(|_pages\(/.test(text);
    case "streaming":
      return /AsyncIterable|Iterator\[|ReadableStream|sse|ndjson|stream_/i.test(text);
    case "hooks.requests":
      return /onRequest|on_request/.test(text);
    case "hooks.responses":
      return /onResponse|on_response/.test(text);
    case "hooks.retries":
      return /onRetry|on_retry|SDKRetryEvent/.test(text);
    case "typedErrors":
      return /class [A-Za-z]+Error\b|extends APIError|\(APIError\)/.test(text);
    case "validation":
      return /ValidationError|strictRequestValidation|strict_response_validation|validate[A-Za-z_]*Data/.test(text);
    case "fileUploads":
      return /multipart|Blob|File|UploadFile|bytes/.test(text) && /upload|file|multipart/i.test(text);
    case "binaryDownloads":
      return /ArrayBuffer|bytes/.test(text) && /download|binary|responseKind.*binary|response_kind.*binary/i.test(text);
    case "webhooks":
      return /webhook|verifySignature|unwrap/i.test(text);
  }
}

function isTypeScriptSource(path: string): boolean {
  return /\.tsx?$/.test(path);
}
