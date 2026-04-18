import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertSafeIdentifier } from "./security.js";

const DATA_DIR = path.join(os.homedir(), ".claudeusage");

/** Return the ~/.claudeusage data directory path. */
export function getDataDir(): string {
  return DATA_DIR;
}

/** Create the data directory if it does not exist. */
export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

/** Set file permissions to owner-only (0600). */
export function lockFile(filePath: string): void {
  fs.chmodSync(filePath, 0o600);
}

/** Validate that an account name is safe for use as a filename. */
export function assertSafeName(name: string): void {
  assertSafeIdentifier(name, "Account name");
}

/** Return the path to an account's config JSON file. */
export function getAccountPath(name: string): string {
  assertSafeName(name);
  return path.join(DATA_DIR, `${name}.json`);
}

/** Return the path to an account's Playwright storage-state file. */
export function getStorageStatePath(name: string): string {
  assertSafeName(name);
  return path.join(DATA_DIR, `${name}-storage.json`);
}

/** Return the path to an account's Chrome profile directory. */
export function getProfileDir(name: string): string {
  assertSafeName(name);
  return path.join(DATA_DIR, `profile-${name}`);
}
