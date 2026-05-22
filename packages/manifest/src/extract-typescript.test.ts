import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTypeScriptManifest } from "./extract-typescript";

test("extracts exported TypeScript symbols", async () => {
  const manifest = await createTypeScriptManifest({
    repoPath: new URL("../../../fixtures/synthetic/ts-sdk-old", import.meta.url).pathname
  });

  expect(manifest.symbols.map((symbol) => symbol.id)).toContain("Client.listUsers");
  expect(manifest.symbols.map((symbol) => symbol.id)).toContain("User");
  expect(manifest.hash).toHaveLength(64);
});

test("extracts exported declarations and skips private implementation details", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "sdkparity-manifest-"));
  await mkdir(join(rootDir, "src"), { recursive: true });
  await writeFile(
    join(rootDir, "src", "index.ts"),
    [
      "/** @deprecated use createUser */",
      "export function listUsers(limit?: number): Promise<string[]> { return Promise.resolve([]); }",
      "export class Client {",
      "  public getUser(id: string): Promise<string> { return Promise.resolve(id); }",
      "  public listUsersPages(): AsyncIterable<string> { throw new Error('fixture'); }",
      "  public listUsersAutoPaging(): AsyncIterable<string> { throw new Error('fixture'); }",
      "  public getUserWithResponse(id: string): Promise<SDKResponse<string>> { return Promise.resolve({} as SDKResponse<string>); }",
      "  private token(): string { return ''; }",
      "  protected secret(): string { return ''; }",
      "  [Symbol.iterator](): Iterator<string> { return [][Symbol.iterator](); }",
      "}",
      "export interface SDKResponse<T> { data: T }",
      "export interface SDKEventHooks { onRequest(): void; onResponse(): void; onRetry(): void }",
      "export class APIError extends Error {}",
      "export class SDKValidationError extends Error {}",
      "export interface User { id: string }",
      "export type UserId = string;",
      "export enum Role { Admin = 'admin' }",
      "function internalOnly() { return null; }"
    ].join("\n")
  );

  const manifest = await createTypeScriptManifest({ repoPath: rootDir, packageName: "override" });
  const ids = manifest.symbols.map((symbol) => symbol.id);

  expect(manifest.package.name).toBe("override");
  expect(ids).toContain("listUsers");
  expect(ids).toContain("Client");
  expect(ids).toContain("Client.getUser");
  expect(ids).toContain("Client.listUsersPages");
  expect(ids).toContain("Client.listUsersAutoPaging");
  expect(ids).toContain("Client.getUserWithResponse");
  expect(ids).toContain("User");
  expect(ids).toContain("UserId");
  expect(ids).toContain("Role");
  expect(ids).not.toContain("internalOnly");
  expect(ids).not.toContain("Client.token");
  expect(manifest.symbols.find((symbol) => symbol.id === "listUsers")?.deprecated).toBe(true);
  expect(manifest.capabilities.filter((capability) => capability.present).map((capability) => capability.id)).toEqual(
    expect.arrayContaining([
      "client.async",
      "rawResponses",
      "pagination.items",
      "pagination.pages",
      "hooks.requests",
      "hooks.responses",
      "hooks.retries",
      "typedErrors",
      "validation"
    ])
  );
  expect(manifest.capabilities.find((capability) => capability.id === "client.sync")?.present).toBe(false);
});
