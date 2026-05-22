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
  return CAPABILITIES.map((id) => capability(id, symbols, sourceFiles));
}

function capability(
  id: SdkCapabilityId,
  symbols: readonly ManifestSymbol[],
  sourceFiles: readonly ManifestSourceFile[]
): ManifestCapability {
  const symbolMatches = symbols.filter((symbol) => matchesSymbol(id, symbol));
  const sourceMatches = sourceFiles
    .filter((file) => matchesSource(id, file.text))
    .map((file) => file.path);
  const evidence = [
    ...sourceMatches.slice(0, 4).map((path) => `source:${path}`),
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
      return /AsyncIterable|Iterator\[|ReadableStream|SSE|NDJSON/.test(normalized);
    case "typedErrors":
      return symbol.kind === "class" && /^(APIError|SDK[A-Za-z]*Error|[A-Za-z]*APIError|[A-Za-z]*ValidationError)$/.test(symbol.name);
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
      return hasPythonSyncClientMethod(text);
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
      return /class (?:APIError|SDK[A-Za-z]*Error|[A-Za-z]*APIError|[A-Za-z]*ValidationError)\b|extends APIError|\(APIError\)/.test(text);
    case "validation":
      return /ValidationError|strictRequestValidation|strict_response_validation|validate[A-Za-z_]*Data/.test(text);
    case "fileUploads":
      return /multipart\/form-data|FormData|\bBlob\b|\bFile\b|UploadFile|\bbytes\b/.test(text) && /upload|multipart/i.test(text);
    case "binaryDownloads":
      return (
        /ArrayBuffer|Uint8Array|\bbytes\b|ReadableStream/.test(text) &&
        /download|responseKind\s*[:=]\s*["']binary["']|response_kind\s*=\s*["']binary["']|arrayBuffer\(|iter_bytes|application\/octet-stream/i.test(text)
      );
    case "webhooks":
      return /webhook|verifySignature|unwrap/i.test(text);
  }
}

function isTypeScriptSource(path: string): boolean {
  return /\.tsx?$/.test(path);
}

function hasPythonSyncClientMethod(text: string): boolean {
  const lines = text.split(/\r?\n/);
  let inClientClass = false;
  let classIndent = 0;

  for (const line of lines) {
    if (line.trim() === "") {
      continue;
    }

    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const classMatch = line.match(/^\s*class (?!Async)[A-Za-z]*Client\b/);
    if (classMatch) {
      inClientClass = true;
      classIndent = indent;
      continue;
    }

    if (inClientClass && indent <= classIndent) {
      inClientClass = false;
    }

    if (inClientClass && indent > classIndent && /^\s*def (?!__init__\b)[A-Za-z_][A-Za-z0-9_]*\(/.test(line)) {
      return true;
    }
  }

  return false;
}
