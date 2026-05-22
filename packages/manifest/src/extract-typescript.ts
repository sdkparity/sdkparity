import { readFile, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import ts from "typescript";
import { contentHash, readJsonFile } from "@sdkparity/core";
import { inferManifestCapabilities, type ManifestSourceFile } from "./capabilities";
import { sdkSurfaceManifestSchema } from "./schemas";
import type { ManifestSymbol, PackageMetadata, SdkSurfaceManifest } from "./schemas";

export type CreateTypeScriptManifestOptions = {
  repoPath: string;
  packageName?: string;
};

type PackageJson = {
  name?: string;
  version?: string;
};

export async function createTypeScriptManifest(
  options: CreateTypeScriptManifestOptions
): Promise<SdkSurfaceManifest> {
  const rootDir = options.repoPath;
  const packageJson = await readPackageJson(rootDir);
  const metadata: PackageMetadata = {
    name: options.packageName ?? packageJson.name ?? basename(rootDir),
    ...(packageJson.version ? { version: packageJson.version } : {}),
    language: "typescript",
    rootDir
  };

  const files = await discoverTypeScriptSourceFiles(rootDir);
  const symbols: ManifestSymbol[] = [];
  const sourceFiles: ManifestSourceFile[] = [];

  for (const filePath of files) {
    const sourceText = await readFile(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    const sourceFileName = relative(rootDir, filePath);
    sourceFiles.push({ path: sourceFileName, text: sourceText });
    symbols.push(...extractSourceFileSymbols(sourceFile, sourceFileName));
  }

  const manifestWithoutHash = {
    version: "0.1" as const,
    package: metadata,
    symbols: symbols.sort((a, b) => a.id.localeCompare(b.id)),
    capabilities: inferManifestCapabilities(symbols, sourceFiles),
    diagnostics: []
  };

  return sdkSurfaceManifestSchema.parse({
    ...manifestWithoutHash,
    hash: contentHash(manifestWithoutHash)
  });
}

function extractSourceFileSymbols(sourceFile: ts.SourceFile, sourceFileName: string): ManifestSymbol[] {
  const symbols: ManifestSymbol[] = [];

  for (const statement of sourceFile.statements) {
    if (!isExported(statement)) {
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      symbols.push(functionSymbol(statement.name.text, statement, sourceFile, sourceFileName));
      continue;
    }

    if (ts.isClassDeclaration(statement) && statement.name) {
      const className = statement.name.text;
      symbols.push({
        id: className,
        name: className,
        kind: "class",
        parameters: [],
        deprecated: isDeprecated(statement),
        sourceFile: sourceFileName,
        origin: "unknown"
      });

      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member) || !member.name || !isPublicClassMember(member)) {
          continue;
        }
        const methodName = memberNameText(member.name);
        if (!methodName) {
          continue;
        }
        symbols.push(functionSymbol(`${className}.${methodName}`, member, sourceFile, sourceFileName, className));
      }
      continue;
    }

    if (ts.isInterfaceDeclaration(statement)) {
      symbols.push({
        id: statement.name.text,
        name: statement.name.text,
        kind: "interface",
        signature: statement.getText(sourceFile),
        parameters: [],
        deprecated: isDeprecated(statement),
        sourceFile: sourceFileName,
        origin: "unknown"
      });
      continue;
    }

    if (ts.isTypeAliasDeclaration(statement)) {
      symbols.push({
        id: statement.name.text,
        name: statement.name.text,
        kind: "type",
        signature: statement.getText(sourceFile),
        parameters: [],
        deprecated: isDeprecated(statement),
        sourceFile: sourceFileName,
        origin: "unknown"
      });
      continue;
    }

    if (ts.isEnumDeclaration(statement)) {
      symbols.push({
        id: statement.name.text,
        name: statement.name.text,
        kind: "enum",
        signature: statement.getText(sourceFile),
        parameters: [],
        deprecated: isDeprecated(statement),
        sourceFile: sourceFileName,
        origin: "unknown"
      });
    }
  }

  return symbols;
}

function functionSymbol(
  name: string,
  node: ts.FunctionDeclaration | ts.MethodDeclaration,
  sourceFile: ts.SourceFile,
  sourceFileName: string,
  namespace?: string
): ManifestSymbol {
  const parameters = node.parameters.map((parameter) => ({
    name: parameter.name.getText(sourceFile),
    type: parameter.type?.getText(sourceFile) ?? "unknown",
    optional: Boolean(parameter.questionToken)
  }));

  return {
    id: namespace ? `${namespace}.${name.split(".").at(-1)}` : name,
    name: name.split(".").at(-1) ?? name,
    kind: namespace ? "method" : "function",
    ...(namespace ? { namespace } : {}),
    signature: node.getText(sourceFile),
    parameters,
    returnType: node.type?.getText(sourceFile) ?? "unknown",
    deprecated: isDeprecated(node),
    sourceFile: sourceFileName,
    operationId: inferOperationId(name),
    origin: "unknown"
  };
}

function isExported(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function isPublicClassMember(node: ts.MethodDeclaration): boolean {
  const modifiers = ts.getModifiers(node) ?? [];
  return !modifiers.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword
  );
}

function isDeprecated(node: ts.Node): boolean {
  const jsDocs = ts.getJSDocTags(node);
  return jsDocs.some((tag) => tag.tagName.text === "deprecated");
}

function memberNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function inferOperationId(symbolName: string): string | undefined {
  const normalized = symbolName.split(".").at(-1);
  return normalized && /^[a-z][a-zA-Z0-9]+$/.test(normalized) ? normalized : undefined;
}

async function readPackageJson(rootDir: string): Promise<PackageJson> {
  try {
    return await readJsonFile<PackageJson>(join(rootDir, "package.json"));
  } catch {
    return {};
  }
}

async function discoverTypeScriptSourceFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  const queue = [rootDir];
  const ignored = new Set(["node_modules", "dist", "build", ".git", ".turbo"]);
  const directory = new Bun.Glob("*");

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    for await (const entry of directory.scan({ cwd: current, onlyFiles: false, absolute: true })) {
      const base = basename(entry);
      if (ignored.has(base) || base.endsWith(".test.ts") || base.endsWith(".d.ts")) {
        continue;
      }
      const entryStat = await stat(entry);
      if (entryStat.isDirectory()) {
        queue.push(entry);
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        files.push(entry);
      }
    }
  }

  return files.sort();
}
