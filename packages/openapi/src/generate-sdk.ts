import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { contentHash } from "@sdkparity/core";
import { z } from "zod";
import type { NormalizedOperation, NormalizedSpec } from "./schemas.js";

export const sdkGenerationLanguageSchema = z.enum(["typescript", "python"]);
export type SdkGenerationLanguage = z.infer<typeof sdkGenerationLanguageSchema>;

export const generatedSdkFileSchema = z
  .object({
    path: z.string().min(1),
    content: z.string()
  })
  .strict();

export type GeneratedSdkFile = z.infer<typeof generatedSdkFileSchema>;

export const generatedSdkSchema = z
  .object({
    version: z.literal("0.1"),
    language: sdkGenerationLanguageSchema,
    packageName: z.string().min(1),
    files: z.array(generatedSdkFileSchema).min(1),
    operationCount: z.number().int().nonnegative(),
    hash: z.string().min(16)
  })
  .strict();

export type GeneratedSdk = z.infer<typeof generatedSdkSchema>;

export const generatedSnippetSchema = z
  .object({
    operationId: z.string().min(1),
    language: sdkGenerationLanguageSchema,
    code: z.string().min(1)
  })
  .strict();

export type GeneratedSnippet = z.infer<typeof generatedSnippetSchema>;

export type GenerateSdkOptions = {
  language: SdkGenerationLanguage;
  packageName?: string;
};

export function generateSdk(spec: NormalizedSpec, options: GenerateSdkOptions): GeneratedSdk {
  if (options.language === "typescript") {
    return generateTypeScriptSdk(spec, options);
  }
  return generatePythonSdk(spec, options);
}

export function generateTypeScriptSdk(
  spec: NormalizedSpec,
  options: Omit<GenerateSdkOptions, "language"> = {}
): GeneratedSdk {
  const packageName = options.packageName ?? "@sdkparity/generated-client";
  const files: GeneratedSdkFile[] = [
    {
      path: "package.json",
      content: `${JSON.stringify(
        {
          name: packageName,
          version: spec.apiVersion,
          type: "module",
          exports: { ".": "./src/index.ts" },
          scripts: {
            typecheck: "tsc -p tsconfig.json --noEmit"
          },
          devDependencies: {
            typescript: "^5.9.3"
          }
        },
        null,
        2
      )}\n`
    },
    {
      path: "tsconfig.json",
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "Bundler",
            strict: true,
            exactOptionalPropertyTypes: true,
            noUncheckedIndexedAccess: true,
            skipLibCheck: true
          },
          include: ["src/**/*.ts"]
        },
        null,
        2
      )}\n`
    },
    {
      path: "src/index.ts",
      content: renderTypeScriptClient(spec)
    }
  ];

  return finalizeGeneratedSdk("typescript", packageName, spec, files);
}

export function generatePythonSdk(
  spec: NormalizedSpec,
  options: Omit<GenerateSdkOptions, "language"> = {}
): GeneratedSdk {
  const packageName = options.packageName ?? "sdkparity-client";
  const moduleName = toPythonPackageName(packageName);
  const files: GeneratedSdkFile[] = [
    {
      path: "pyproject.toml",
      content: [
        "[project]",
        `name = ${JSON.stringify(packageName)}`,
        `version = ${JSON.stringify(spec.apiVersion)}`,
        'requires-python = ">=3.10"',
        'description = "Generated SDK Parity client"',
        "",
        "[build-system]",
        'requires = ["setuptools>=68"]',
        'build-backend = "setuptools.build_meta"',
        ""
      ].join("\n")
    },
    {
      path: `${moduleName}/__init__.py`,
      content: renderPythonClient(spec)
    }
  ];

  return finalizeGeneratedSdk("python", packageName, spec, files);
}

export async function writeGeneratedSdk(sdk: GeneratedSdk, outputDir: string): Promise<void> {
  for (const file of sdk.files) {
    const filePath = join(outputDir, file.path);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content);
  }
}

export function generateSdkSnippets(
  spec: NormalizedSpec,
  language: SdkGenerationLanguage,
  packageName?: string
): GeneratedSnippet[] {
  return spec.operations
    .filter((operation) => operation.sdkVisibility === "public")
    .map((operation) => ({
      operationId: operation.operationId,
      language,
      code:
        language === "typescript"
          ? renderTypeScriptSnippet(operation, packageName ?? "@sdkparity/generated-client")
          : renderPythonSnippet(operation, toPythonPackageName(packageName ?? "sdkparity-client"))
    }));
}

function finalizeGeneratedSdk(
  language: SdkGenerationLanguage,
  packageName: string,
  spec: NormalizedSpec,
  files: GeneratedSdkFile[]
): GeneratedSdk {
  const withoutHash = {
    version: "0.1" as const,
    language,
    packageName,
    files,
    operationCount: spec.operations.filter((operation) => operation.sdkVisibility === "public").length
  };

  return generatedSdkSchema.parse({
    ...withoutHash,
    hash: contentHash(withoutHash)
  });
}

function renderTypeScriptClient(spec: NormalizedSpec): string {
  const operations = spec.operations.filter((operation) => operation.sdkVisibility === "public");
  const inputTypes = operations.map(renderTypeScriptInputType).join("\n\n");
  const methods = operations.map(renderTypeScriptMethod).join("\n\n");

  return [
    "export type SdkParityClientOptions = {",
    "  baseUrl?: string;",
    "  apiKey?: string;",
    "  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;",
    "};",
    "",
    "export class SdkParityApiError extends Error {",
    "  constructor(readonly status: number, message: string, readonly details?: unknown) {",
    "    super(message);",
    "    this.name = \"SdkParityApiError\";",
    "  }",
    "}",
    "",
    inputTypes,
    "",
    "export class Client {",
    "  private readonly baseUrl: string;",
    "  private readonly apiKey: string | undefined;",
    "  private readonly transport: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;",
    "",
    "  constructor(options: SdkParityClientOptions = {}) {",
    "    this.baseUrl = (options.baseUrl ?? \"\").replace(/\\/$/, \"\");",
    "    this.apiKey = options.apiKey;",
    "    this.transport = options.fetch ?? fetch;",
    "  }",
    "",
    indent(methods, 2),
    "",
    "  private async request(method: string, pathTemplate: string, input: Record<string, unknown>, queryKeys: string[]): Promise<unknown> {",
    "    const path = pathTemplate.replace(/\\{([^}]+)\\}/g, (_match, key: string) => encodeURIComponent(String(input[key] ?? \"\")));",
    "    const query = new URLSearchParams();",
    "    for (const key of queryKeys) {",
    "      const value = input[key];",
    "      if (value !== undefined && value !== null) {",
    "        query.set(key, String(value));",
    "      }",
    "    }",
    "    const headers: Record<string, string> = { accept: \"application/json\" };",
    "    if (this.apiKey) {",
    "      headers.authorization = `Bearer ${this.apiKey}`;",
    "    }",
    "    const body = input.body === undefined ? undefined : JSON.stringify(input.body);",
    "    if (body) {",
    "      headers[\"content-type\"] = \"application/json\";",
    "    }",
    "    const url = `${this.baseUrl}${path}${query.size > 0 ? `?${query.toString()}` : \"\"}`;",
    "    const response = await this.transport(url, { method, headers, body });",
    "    const text = await response.text();",
    "    const payload = text.length > 0 ? JSON.parse(text) as unknown : undefined;",
    "    if (!response.ok) {",
    "      throw new SdkParityApiError(response.status, `SDK Parity request failed: ${method} ${path}`, payload);",
    "    }",
    "    return payload;",
    "  }",
    "}",
    ""
  ].join("\n");
}

function renderTypeScriptInputType(operation: NormalizedOperation): string {
  const typeName = `${toPascalCase(operation.sdkName)}Input`;
  const fields = operation.parameters.map((parameter) => {
    const optional = parameter.required ? "" : "?";
    return `  ${safePropertyName(parameter.name)}${optional}: unknown;`;
  });
  if (operation.requestBodyContentTypes.length > 0) {
    fields.push("  body: unknown;");
  }

  return [`export type ${typeName} = {`, ...(fields.length > 0 ? fields : ["  readonly __empty?: never;"]), "};"].join("\n");
}

function renderTypeScriptMethod(operation: NormalizedOperation): string {
  const methodName = operation.sdkName;
  const inputType = `${toPascalCase(operation.sdkName)}Input`;
  const requiredInput = operation.parameters.some((parameter) => parameter.required) || operation.requestBodyContentTypes.length > 0;
  const inputDeclaration = requiredInput ? `input: ${inputType}` : `input: ${inputType} = {}`;
  const queryKeys = operation.parameters
    .filter((parameter) => parameter.in === "query")
    .map((parameter) => parameter.name);

  return [
    operation.summary ? `/** ${escapeTypeScriptComment(operation.summary)} */` : undefined,
    `async ${methodName}(${inputDeclaration}): Promise<unknown> {`,
    `  return this.request("${operation.method.toUpperCase()}", "${operation.path}", input as Record<string, unknown>, ${JSON.stringify(queryKeys)});`,
    "}"
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function renderPythonClient(spec: NormalizedSpec): string {
  const operations = spec.operations.filter((operation) => operation.sdkVisibility === "public");
  const methods = operations.map(renderPythonMethod).join("\n\n");

  return [
    "from __future__ import annotations",
    "",
    "import json",
    "import urllib.error",
    "import urllib.parse",
    "import urllib.request",
    "from typing import Any, Callable",
    "",
    "Transport = Callable[[str, str, dict[str, str], bytes | None], Any]",
    "",
    "class SdkParityApiError(Exception):",
    "    def __init__(self, status: int, message: str, details: Any | None = None) -> None:",
    "        super().__init__(message)",
    "        self.status = status",
    "        self.details = details",
    "",
    "class Client:",
    "    def __init__(self, base_url: str = \"\", api_key: str | None = None, transport: Transport | None = None) -> None:",
    "        self.base_url = base_url.rstrip(\"/\")",
    "        self.api_key = api_key",
    "        self.transport = transport",
    "",
    indent(methods, 4),
    "",
    "    def _request(self, method: str, path_template: str, data: dict[str, Any], query_keys: list[str]) -> Any:",
    "        path = path_template",
    "        for key, value in data.items():",
    "            path = path.replace(\"{\" + key + \"}\", urllib.parse.quote(str(value), safe=\"\"))",
    "        query = urllib.parse.urlencode({key: data[key] for key in query_keys if data.get(key) is not None})",
    "        url = f\"{self.base_url}{path}{'?' + query if query else ''}\"",
    "        headers = {\"accept\": \"application/json\"}",
    "        if self.api_key:",
    "            headers[\"authorization\"] = f\"Bearer {self.api_key}\"",
    "        body = None",
    "        if \"body\" in data:",
    "            headers[\"content-type\"] = \"application/json\"",
    "            body = json.dumps(data[\"body\"]).encode(\"utf-8\")",
    "        if self.transport:",
    "            return self.transport(method, url, headers, body)",
    "        request = urllib.request.Request(url, data=body, headers=headers, method=method)",
    "        try:",
    "            with urllib.request.urlopen(request) as response:",
    "                payload = response.read().decode(\"utf-8\")",
    "                return json.loads(payload) if payload else None",
    "        except urllib.error.HTTPError as error:",
    "            payload = error.read().decode(\"utf-8\")",
    "            details = json.loads(payload) if payload else None",
    "            raise SdkParityApiError(error.code, f\"SDK Parity request failed: {method} {path}\", details) from error",
    "",
    "__all__ = [\"Client\", \"SdkParityApiError\"]",
    ""
  ].join("\n");
}

function renderPythonMethod(operation: NormalizedOperation): string {
  const methodName = toSnakeCase(operation.sdkName);
  const queryKeys = operation.parameters
    .filter((parameter) => parameter.in === "query")
    .map((parameter) => parameter.name);
  const lines = [
    operation.summary ? `"""${escapePythonDocstring(operation.summary)}"""` : undefined,
    `def ${methodName}(self, **data: Any) -> Any:`,
    `    return self._request("${operation.method.toUpperCase()}", "${operation.path}", data, ${JSON.stringify(queryKeys)})`
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

function renderTypeScriptSnippet(operation: NormalizedOperation, packageName: string): string {
  const input = sampleInput(operation);
  return [
    `import { Client } from "${packageName}";`,
    "",
    "const client = new Client({ baseUrl: \"https://api.example.com\", apiKey: \"example-key\" });",
    `await client.${operation.sdkName}(${JSON.stringify(input, null, 2)});`,
    ""
  ].join("\n");
}

function renderPythonSnippet(operation: NormalizedOperation, moduleName: string): string {
  const input = sampleInput(operation);
  return [
    `from ${moduleName} import Client`,
    "",
    "client = Client(base_url=\"https://api.example.com\", api_key=\"example-key\")",
    `client.${toSnakeCase(operation.sdkName)}(**${JSON.stringify(input, null, 2)})`,
    ""
  ].join("\n");
}

function sampleInput(operation: NormalizedOperation): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const parameter of operation.parameters) {
    input[parameter.name] = parameter.required ? `example-${parameter.name}` : undefined;
  }
  if (operation.requestBodyContentTypes.length > 0) {
    input.body = {};
  }
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function toPythonPackageName(packageName: string): string {
  return packageName.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "sdkparity_client";
}

function toPascalCase(value: string): string {
  return value
    .replace(/[_\-\s]+([a-zA-Z0-9])/g, (_match, char: string) => char.toUpperCase())
    .replace(/^[a-z]/, (char) => char.toUpperCase());
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function safePropertyName(value: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(value) ? value : JSON.stringify(value);
}

function indent(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join("\n");
}

function escapeTypeScriptComment(value: string): string {
  return value.replace(/\*\//g, "* /");
}

function escapePythonDocstring(value: string): string {
  return value.replace(/"""/g, '\\"\\"\\"');
}
