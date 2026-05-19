import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

test("runs the MCP Code Mode dry-run command end to end", async () => {
  const proc = Bun.spawn(
    [
      process.execPath,
      "apps/cli/src/index.ts",
      "mcp",
      "execute",
      "--spec",
      "fixtures/synthetic/openapi/base.json",
      "--code",
      "await api.listUsers({ limit: 10 })"
    ],
    {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe"
    }
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ]);

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(JSON.parse(stdout)).toMatchObject({
    ok: true,
    calls: [{ operationId: "listUsers" }]
  });
});
