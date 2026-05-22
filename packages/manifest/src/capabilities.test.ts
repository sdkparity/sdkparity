import { expect, test } from "bun:test";
import { inferManifestCapabilities, type ManifestSourceFile } from "./capabilities";
import type { ManifestSymbol } from "./schemas";

function capabilityPresent(
  id: ReturnType<typeof inferManifestCapabilities>[number]["id"],
  symbols: ManifestSymbol[],
  sourceFiles: ManifestSourceFile[]
): boolean {
  return inferManifestCapabilities(symbols, sourceFiles).find((capability) => capability.id === id)?.present ?? false;
}

test("does not infer capabilities from source evidence split across files", () => {
  const sourceFiles = [
    { path: "client.py", text: "class Client:\n    def __init__(self):\n        pass\n" },
    { path: "helpers.py", text: "def list_users():\n    return []\n" }
  ];

  expect(capabilityPresent("client.sync", [], sourceFiles)).toBe(false);
});

test("requires a non-constructor method on Python sync clients", () => {
  const sourceFiles = [
    {
      path: "client.py",
      text: "class Client:\n    def __init__(self):\n        pass\n\n    def list_users(self):\n        return []\n"
    }
  ];

  expect(capabilityPresent("client.sync", [], sourceFiles)).toBe(true);
});

test("keeps broad source vocabulary from creating noisy capability evidence", () => {
  const symbols: ManifestSymbol[] = [
    {
      id: "BlockingError",
      name: "BlockingError",
      kind: "class",
      parameters: [],
      deprecated: false,
      sourceFile: "src/helpers.ts",
      origin: "unknown"
    }
  ];
  const sourceFiles = [
    {
      path: "src/helpers.ts",
      text: [
        "export class BlockingError extends Error {}",
        "const filePath = 'users.json';",
        "type BrowserFile = File;",
        "const binaryMode = true;",
        "const payload: bytes = {} as bytes;"
      ].join("\n")
    }
  ];

  expect(capabilityPresent("typedErrors", symbols, sourceFiles)).toBe(false);
  expect(capabilityPresent("fileUploads", symbols, sourceFiles)).toBe(false);
  expect(capabilityPresent("binaryDownloads", symbols, sourceFiles)).toBe(false);
});
