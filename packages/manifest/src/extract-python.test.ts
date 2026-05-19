import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPythonManifest } from "./extract-python";

test("extracts public Python symbols with package metadata", async () => {
  const manifest = await createPythonManifest({
    repoPath: new URL("../../../fixtures/synthetic/python-sdk-old", import.meta.url).pathname
  });

  expect(manifest.package).toMatchObject({
    name: "sdkparity-fixture-old",
    version: "0.1.0",
    language: "python"
  });
  expect(manifest.symbols.map((symbol) => symbol.id)).toEqual(
    expect.arrayContaining(["Client", "Client.list_users", "Client.get_user", "User", "create_options"])
  );
  expect(manifest.symbols.map((symbol) => symbol.id)).not.toContain("Client._token");
  expect(manifest.symbols.find((symbol) => symbol.id === "Client.list_users")?.operationId).toBe(
    "listUsers"
  );
  expect(manifest.hash).toHaveLength(64);
});

test("reports Python parse failures as manifest diagnostics", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "sdkparity-python-manifest-"));
  await mkdir(join(rootDir, "pkg"), { recursive: true });
  await writeFile(join(rootDir, "pkg", "__init__.py"), "def broken(:\n");

  const manifest = await createPythonManifest({ repoPath: rootDir, packageName: "override" });

  expect(manifest.package.name).toBe("override");
  expect(manifest.symbols).toEqual([]);
  expect(manifest.diagnostics).toEqual([
    expect.objectContaining({ code: "python_parse_failed", severity: "error" })
  ]);
});

test("raises a stable error when the Python extractor process fails", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "sdkparity-python-manifest-"));
  await writeFile(join(rootDir, "pyproject.toml"), "[project\nname = 'broken'\n");

  await expect(createPythonManifest({ repoPath: rootDir })).rejects.toMatchObject({
    code: "python_manifest_extraction_failed"
  });
});

test("raises a stable error when the Python extractor prints invalid JSON", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "sdkparity-python-manifest-"));
  const binDir = await mkdtemp(join(tmpdir(), "sdkparity-python-bin-"));
  const fakePython = join(binDir, "python3");
  await writeFile(fakePython, "#!/bin/sh\nprintf 'not json'\n");
  await chmod(fakePython, 0o755);

  await expect(createPythonManifest({ repoPath: rootDir, pythonCommand: [fakePython] })).rejects.toMatchObject({
    code: "python_manifest_output_invalid"
  });
});
