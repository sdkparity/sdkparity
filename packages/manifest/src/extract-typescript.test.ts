import { expect, test } from "bun:test";
import { createTypeScriptManifest } from "./extract-typescript";

test("extracts exported TypeScript symbols", async () => {
  const manifest = await createTypeScriptManifest({
    repoPath: new URL("../../../fixtures/synthetic/ts-sdk-old", import.meta.url).pathname
  });

  expect(manifest.symbols.map((symbol) => symbol.id)).toContain("Client.listUsers");
  expect(manifest.symbols.map((symbol) => symbol.id)).toContain("User");
  expect(manifest.hash).toHaveLength(64);
});
