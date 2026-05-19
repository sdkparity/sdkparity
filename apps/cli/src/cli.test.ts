import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

test("runs the MCP Code Mode dry-run command end to end", async () => {
  const { stdout } = await runCli([
    "mcp",
    "execute",
    "--spec",
    "fixtures/synthetic/openapi/base.json",
    "--code",
    "await api.listUsers({ limit: 10 })"
  ]);
  expect(JSON.parse(stdout)).toMatchObject({
    ok: true,
    calls: [{ operationId: "listUsers" }]
  });
});

test("exposes agent schema introspection as JSON", async () => {
  const list = await runCli(["schema", "list"]);
  expect(JSON.parse(list.stdout).schemas).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "mcp.codeMode.execute.input" })])
  );

  const schema = await runCli(["schema", "get", "mcp.codeMode.execute.input"]);
  expect(JSON.parse(schema.stdout)).toMatchObject({
    id: "mcp.codeMode.execute.input",
    jsonSchema: { type: "object" }
  });
});

async function runCli(args: string[]) {
  const proc = Bun.spawn([process.execPath, "apps/cli/src/index.ts", ...args], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ]);

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  return { stdout };
}
