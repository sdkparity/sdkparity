import { expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SdkParityError } from "./errors";
import { readJsonFile, writeJsonFile } from "./json";

test("reads and writes formatted JSON files", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "sdkparity-json-"));
  const filePath = join(rootDir, "nested", "fixture.json");
  await mkdir(join(rootDir, "nested"), { recursive: true });

  await writeJsonFile(filePath, { ok: true, count: 2 });

  expect(await readJsonFile<{ ok: boolean; count: number }>(filePath)).toEqual({ ok: true, count: 2 });
});

test("wraps JSON read failures in typed SDK Parity errors", async () => {
  const error = await readJsonFile("/tmp/sdkparity-missing-json-file.json").catch((caught) => caught);

  expect(error).toBeInstanceOf(SdkParityError);
  expect((error as SdkParityError).toJSON()).toMatchObject({
    code: "json_read_failed",
    details: { filePath: "/tmp/sdkparity-missing-json-file.json" }
  });
});
