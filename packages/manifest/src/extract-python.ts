import { readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { contentHash, SdkParityError } from "@sdkparity/core";
import { z } from "zod";
import { inferManifestCapabilities, type ManifestSourceFile } from "./capabilities";
import { sdkSurfaceManifestSchema } from "./schemas";
import type { ManifestSymbol, PackageMetadata, SdkSurfaceManifest } from "./schemas";

export type CreatePythonManifestOptions = {
  repoPath: string;
  packageName?: string;
  pythonCommand?: readonly [string, ...string[]];
};

const pythonExtractionResultSchema = z
  .object({
    package: z
      .object({
        name: z.string().optional(),
        version: z.string().optional()
      })
      .strict(),
    symbols: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          kind: z.enum(["function", "class", "method", "interface", "type", "enum"]),
          namespace: z.string().optional(),
          signature: z.string().optional(),
          parameters: z.array(
            z.object({ name: z.string(), type: z.string(), optional: z.boolean() }).strict()
          ),
          returnType: z.string().optional(),
          deprecated: z.boolean(),
          sourceFile: z.string(),
          operationId: z.string().optional(),
          origin: z.enum(["generated", "handwritten", "unknown"]).default("unknown")
        })
        .strict()
    ),
    diagnostics: z.array(
      z
        .object({
          code: z.string(),
          message: z.string(),
          severity: z.enum(["info", "warning", "error"]),
          sourceFile: z.string().optional()
        })
        .strict()
    )
  })
  .strict();

export async function createPythonManifest(options: CreatePythonManifestOptions): Promise<SdkSurfaceManifest> {
  const rootDir = options.repoPath;
  const extracted = await runPythonExtractor(rootDir, options.pythonCommand ?? ["python3"]);
  const metadata: PackageMetadata = {
    name: options.packageName ?? extracted.package.name ?? basename(rootDir),
    ...(extracted.package.version ? { version: extracted.package.version } : {}),
    language: "python",
    rootDir
  };
  const symbols = extracted.symbols.map((symbol) => ({
    ...symbol,
    operationId: symbol.operationId ?? inferOperationId(symbol.name)
  }));
  const sourceFiles = await readPythonSourceFiles(rootDir);

  const manifestWithoutHash = {
    version: "0.1" as const,
    package: metadata,
    symbols: symbols.sort((a, b) => a.id.localeCompare(b.id)) satisfies ManifestSymbol[],
    capabilities: inferManifestCapabilities(symbols, sourceFiles),
    diagnostics: extracted.diagnostics
  };

  return sdkSurfaceManifestSchema.parse({
    ...manifestWithoutHash,
    hash: contentHash(manifestWithoutHash)
  });
}

async function runPythonExtractor(
  rootDir: string,
  pythonCommand: readonly [string, ...string[]]
): Promise<z.infer<typeof pythonExtractionResultSchema>> {
  const proc = Bun.spawn([...pythonCommand, "-c", PYTHON_EXTRACTOR, rootDir], {
    cwd: rootDir,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ]);

  if (exitCode !== 0) {
    throw new SdkParityError({
      code: "python_manifest_extraction_failed",
      message: `Could not extract Python SDK surface from ${rootDir}`,
      details: { stderr: stderr.slice(0, 4000) },
      suggestion: "Run python3 -m py_compile on the SDK package and retry manifest extraction."
    });
  }

  try {
    return pythonExtractionResultSchema.parse(JSON.parse(stdout));
  } catch (error) {
    throw new SdkParityError({
      code: "python_manifest_output_invalid",
      message: `Python SDK surface extractor returned invalid JSON for ${rootDir}`,
      details: { error: error instanceof Error ? error.message : String(error) }
    });
  }
}

async function readPythonSourceFiles(rootDir: string): Promise<ManifestSourceFile[]> {
  const files: ManifestSourceFile[] = [];
  for (const filePath of await discoverPythonSourceFiles(rootDir)) {
    files.push({ path: relative(rootDir, filePath), text: await readFile(filePath, "utf8") });
  }
  return files;
}

async function discoverPythonSourceFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  const queue = [rootDir];
  const ignored = new Set([".git", ".turbo", "__pycache__", "build", "dist", ".venv", "venv"]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const glob = new Bun.Glob("*");
    for await (const entry of glob.scan({ cwd: current, onlyFiles: false, absolute: true })) {
      const base = basename(entry);
      if (ignored.has(base) || base.endsWith("_test.py") || base.startsWith("test_")) {
        continue;
      }
      const stat = await Bun.file(entry).stat();
      if (stat.isDirectory()) {
        queue.push(entry);
      } else if (entry.endsWith(".py")) {
        files.push(entry);
      }
    }
  }

  return files.sort();
}

function inferOperationId(symbolName: string): string | undefined {
  if (!/^[a-z_][a-z0-9_]*$/.test(symbolName)) {
    return undefined;
  }
  return symbolName.replace(/_+([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

const PYTHON_EXTRACTOR = String.raw`
from __future__ import annotations

import ast
import json
import os
import sys
import tomllib
from typing import Any

root_dir = sys.argv[1]
ignored = {".git", ".turbo", "__pycache__", "build", "dist", ".venv", "venv"}

def package_metadata(root: str) -> dict[str, str]:
    path = os.path.join(root, "pyproject.toml")
    if not os.path.exists(path):
        return {}
    with open(path, "rb") as handle:
        data = tomllib.load(handle)
    project = data.get("project", {})
    result: dict[str, str] = {}
    if isinstance(project.get("name"), str):
        result["name"] = project["name"]
    if isinstance(project.get("version"), str):
        result["version"] = project["version"]
    return result

def public_name(name: str) -> bool:
    return not name.startswith("_")

def annotation_text(node: ast.AST | None) -> str:
    if node is None:
        return "unknown"
    return ast.unparse(node)

def deprecated(node: ast.AST) -> bool:
    doc = ast.get_docstring(node)
    return bool(doc and "@deprecated" in doc)

def function_signature(node: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
    prefix = "async def" if isinstance(node, ast.AsyncFunctionDef) else "def"
    return f"{prefix} {node.name}({ast.unparse(node.args)})"

def parameters(node: ast.FunctionDef | ast.AsyncFunctionDef, skip_self: bool) -> list[dict[str, Any]]:
    args = list(node.args.posonlyargs) + list(node.args.args)
    if skip_self and args and args[0].arg in {"self", "cls"}:
        args = args[1:]
    required_count = max(0, len(args) - len(node.args.defaults))
    result = []
    for index, arg in enumerate(args):
        result.append({
            "name": arg.arg,
            "type": annotation_text(arg.annotation),
            "optional": index >= required_count,
        })
    for index, arg in enumerate(node.args.kwonlyargs):
        default = node.args.kw_defaults[index]
        result.append({
            "name": arg.arg,
            "type": annotation_text(arg.annotation),
            "optional": default is not None,
        })
    return result

def operation_id(name: str) -> str | None:
    if not name or name.startswith("_"):
        return None
    parts = [part for part in name.split("_") if part]
    if not parts:
        return None
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])

def function_symbol(node: ast.FunctionDef | ast.AsyncFunctionDef, source_file: str, namespace: str | None = None) -> dict[str, Any]:
    symbol_id = f"{namespace}.{node.name}" if namespace else node.name
    symbol: dict[str, Any] = {
        "id": symbol_id,
        "name": node.name,
        "kind": "method" if namespace else "function",
        "signature": function_signature(node),
        "parameters": parameters(node, namespace is not None),
        "returnType": annotation_text(node.returns),
        "deprecated": deprecated(node),
        "sourceFile": source_file,
        "origin": "unknown",
    }
    if namespace:
        symbol["namespace"] = namespace
    inferred = operation_id(node.name)
    if inferred:
        symbol["operationId"] = inferred
    return symbol

symbols: list[dict[str, Any]] = []
diagnostics: list[dict[str, str]] = []

for current, directories, files in os.walk(root_dir):
    directories[:] = [entry for entry in directories if entry not in ignored]
    for file_name in sorted(files):
        if not file_name.endswith(".py") or file_name.endswith("_test.py") or file_name.startswith("test_"):
            continue
        file_path = os.path.join(current, file_name)
        source_file = os.path.relpath(file_path, root_dir)
        try:
            with open(file_path, "r", encoding="utf-8") as handle:
                tree = ast.parse(handle.read(), filename=file_path)
        except SyntaxError as error:
            diagnostics.append({
                "code": "python_parse_failed",
                "message": str(error),
                "severity": "error",
                "sourceFile": source_file,
            })
            continue
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and public_name(node.name):
                symbols.append(function_symbol(node, source_file))
            elif isinstance(node, ast.ClassDef) and public_name(node.name):
                symbols.append({
                    "id": node.name,
                    "name": node.name,
                    "kind": "class",
                    "signature": f"class {node.name}",
                    "parameters": [],
                    "deprecated": deprecated(node),
                    "sourceFile": source_file,
                    "origin": "unknown",
                })
                for member in node.body:
                    if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)) and public_name(member.name):
                        symbols.append(function_symbol(member, source_file, node.name))

print(json.dumps({
    "package": package_metadata(root_dir),
    "symbols": sorted(symbols, key=lambda entry: entry["id"]),
    "diagnostics": diagnostics,
}))
`;
