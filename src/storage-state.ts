import fs from "node:fs";
import { CLIError } from "./security.js";

export function parseStorageStateJson(storageStateJson: string): string {
  try {
    const parsed = JSON.parse(storageStateJson) as unknown;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Storage state must be a JSON object.");
    }
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    throw new CLIError("Storage state payload is not valid JSON.", {
      code: "INVALID_STORAGE_STATE",
      exitCode: 2,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

export function readStorageStateFile(filePath: string): string {
  try {
    return parseStorageStateJson(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }

    throw new CLIError(`Unable to read storage state file: ${filePath}`, {
      code: "INVALID_STORAGE_STATE",
      exitCode: 2,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
