import { readFile, writeFile } from "node:fs/promises";
import { SdkParityError } from "./errors";

export async function readJsonFile<T>(filePath: string): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    throw new SdkParityError({
      code: "json_read_failed",
      message: `Could not read JSON file: ${filePath}`,
      details: { filePath, error: error instanceof Error ? error.message : String(error) }
    });
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
