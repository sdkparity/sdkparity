import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  generatePythonSdk,
  generateSdk,
  generateSdkSnippets,
  generateTypeScriptSdk,
  writeGeneratedSdk
} from "./generate-sdk";
import { normalizeOpenApiDocument } from "./normalize";
import type { OpenApiDocument } from "./schemas";

const spec = normalizeOpenApiDocument({
  openapi: "3.1.0",
  info: { title: "Generated", version: "1.2.3" },
  paths: {
    "/users": {
      get: {
        operationId: "listUsers",
        tags: ["users"],
        summary: "List users",
        parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer" } }],
        responses: { "200": { description: "OK" } }
      },
      post: {
        operationId: "createUser",
        tags: ["users"],
        summary: "Create users",
        requestBody: { content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "Created" } }
      }
    },
    "/users/{userId}": {
      get: {
        operationId: "getUser",
        tags: ["users"],
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } }
      }
    }
  }
} as unknown as OpenApiDocument);

test("generates deterministic TypeScript SDK files that compile and run", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "sdkparity-generated-ts-"));
  const sdk = generateTypeScriptSdk(spec, { packageName: "@example/generated" });
  const generatedAgain = generateSdk(spec, { language: "typescript", packageName: "@example/generated" });

  expect(sdk.hash).toBe(generatedAgain.hash);
  expect(sdk.files.map((file) => file.path)).toEqual(["package.json", "tsconfig.json", "src/index.ts"]);
  await writeGeneratedSdk(sdk, rootDir);

  const build = await Bun.build({
    entrypoints: [join(rootDir, "src/index.ts")],
    outdir: join(rootDir, "dist")
  });
  expect(build.success).toBe(true);

  const mod = (await import(pathToFileURL(join(rootDir, "src/index.ts")).href)) as {
    Client: new (options: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    }) => {
      listUsers(input?: { limit?: unknown }): Promise<unknown>;
      createUser(input: { body: unknown }): Promise<unknown>;
      getUser(input: { userId: unknown }): Promise<unknown>;
    };
  };
  const calls: string[] = [];
  const client = new mod.Client({
    fetch: async (input) => {
      calls.push(String(input));
      return Response.json({ ok: true });
    }
  });

  await expect(client.listUsers({ limit: 10 })).resolves.toEqual({ ok: true });
  await expect(client.createUser({ body: { email: "person@example.com" } })).resolves.toEqual({ ok: true });
  await expect(client.getUser({ userId: "usr_123" })).resolves.toEqual({ ok: true });
  expect(calls).toEqual(["/users?limit=10", "/users", "/users/usr_123"]);
});

test("generates deterministic Python SDK files that import and run", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "sdkparity-generated-python-"));
  const sdk = generatePythonSdk(spec, { packageName: "sdkparity-example" });
  await writeGeneratedSdk(sdk, rootDir);

  expect(await readFile(join(rootDir, "pyproject.toml"), "utf8")).toContain('name = "sdkparity-example"');
  const scriptPath = join(rootDir, "smoke.py");
  await writeFile(
    scriptPath,
    [
      "from sdkparity_example import Client",
      "calls = []",
      "def transport(method, url, headers, body):",
      "    calls.append((method, url, body))",
      "    return {'ok': True}",
      "client = Client(transport=transport)",
      "assert client.list_users(limit=10) == {'ok': True}",
      "assert client.create_user(body={'email': 'person@example.com'}) == {'ok': True}",
      "assert client.get_user(userId='usr_123') == {'ok': True}",
      "assert calls[0][1] == '/users?limit=10'",
      "assert calls[2][1] == '/users/usr_123'"
    ].join("\n")
  );

  const result = await run(["python3", scriptPath], rootDir);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
});

test("generates docs snippets for both SDK languages", () => {
  const ts = generateSdkSnippets(spec, "typescript", "@example/generated");
  const python = generateSdkSnippets(spec, "python", "sdkparity-example");

  expect(ts[0]).toMatchObject({ operationId: "listUsers", language: "typescript" });
  expect(ts[0]?.code).toContain("client.listUsers");
  expect(python[0]?.code).toContain("client.list_users");
});

async function run(command: string[], cwd: string): Promise<{ exitCode: number; stderr: string }> {
  const proc = Bun.spawn(command, { cwd, stderr: "pipe" });
  const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  return { exitCode, stderr };
}
