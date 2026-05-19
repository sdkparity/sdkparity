import { afterEach, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SdkParityError } from "@sdkparity/core";
import { loadOpenApiDocument, loadOverlayDocument } from "./load";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("loads OpenAPI and overlay documents from local structured files", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "sdkparity-openapi-load-"));
  const specPath = join(rootDir, "openapi.json");
  const overlayPath = join(rootDir, "overlay.yaml");
  await writeFile(
    specPath,
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Loaded", version: "1.0.0" },
      paths: {}
    })
  );
  await writeFile(
    overlayPath,
    [
      'version: "0.1"',
      "operations:",
      "  listUsers:",
      "    sdkName: list",
      "    authScopes:",
      "      - users:read"
    ].join("\n")
  );

  await expect(loadOpenApiDocument(specPath)).resolves.toMatchObject({
    info: { title: "Loaded", version: "1.0.0" }
  });
  await expect(loadOverlayDocument(overlayPath)).resolves.toMatchObject({
    operations: { listUsers: { sdkName: "list", authScopes: ["users:read"] } }
  });
});

test("loads remote OpenAPI documents and reports failed fetches", async () => {
  globalThis.fetch = (async (source) => {
    if (String(source).includes("missing")) {
      return new Response("missing", { status: 404 });
    }
    return Response.json({
      openapi: "3.1.0",
      info: { title: "Remote", version: "1.0.0" },
      paths: {}
    });
  }) as typeof fetch;

  await expect(loadOpenApiDocument("https://example.test/openapi.json")).resolves.toMatchObject({
    info: { title: "Remote" }
  });

  const error = await loadOpenApiDocument("https://example.test/missing.json").catch((caught) => caught);
  expect(error).toBeInstanceOf(SdkParityError);
  expect((error as SdkParityError).toJSON()).toMatchObject({
    code: "openapi_fetch_failed",
    details: { status: 404 }
  });
});

test("wraps structured parse failures in typed SDK Parity errors", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "sdkparity-openapi-invalid-"));
  const specPath = join(rootDir, "broken.json");
  await writeFile(specPath, "{");

  const error = await loadOpenApiDocument(specPath).catch((caught) => caught);

  expect(error).toBeInstanceOf(SdkParityError);
  expect((error as SdkParityError).toJSON()).toMatchObject({
    code: "structured_parse_failed"
  });
});
