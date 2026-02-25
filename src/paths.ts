import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DATA_DIR = path.join(os.homedir(), ".claudeusage");

export function getDataDir(): string {
  return DATA_DIR;
}

export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getAccountPath(name: string): string {
  return path.join(DATA_DIR, `${name}.json`);
}

export function getStorageStatePath(name: string): string {
  return path.join(DATA_DIR, `${name}-storage.json`);
}

export function getProfileDir(name: string): string {
  return path.join(DATA_DIR, `profile-${name}`);
}
