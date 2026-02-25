import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DATA_DIR = path.join(os.homedir(), ".claudeusage");

export function getDataDir(): string {
  return DATA_DIR;
}

export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

export function lockFile(filePath: string): void {
  fs.chmodSync(filePath, 0o600);
}

const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

export function assertSafeName(name: string): void {
  if (!SAFE_NAME_RE.test(name)) {
    throw new Error(
      `Account name "${name}" contains invalid characters. Use letters, numbers, hyphens, or underscores only.`
    );
  }
}

export function getAccountPath(name: string): string {
  assertSafeName(name);
  return path.join(DATA_DIR, `${name}.json`);
}

export function getStorageStatePath(name: string): string {
  assertSafeName(name);
  return path.join(DATA_DIR, `${name}-storage.json`);
}

export function getProfileDir(name: string): string {
  assertSafeName(name);
  return path.join(DATA_DIR, `profile-${name}`);
}
