import fs from "node:fs";
import {
  ensureDataDir,
  getAccountPath,
  getDataDir,
  getProfileDir,
  getStorageStatePath,
} from "./paths.js";
import type { AccountConfig } from "./types.js";

export function listAccounts(): AccountConfig[] {
  ensureDataDir();
  const dir = getDataDir();
  const files = fs.readdirSync(dir);
  return files
    .filter((f) => f.endsWith(".json") && !f.includes("-storage"))
    .map((f) => {
      const content = fs.readFileSync(`${dir}/${f}`, "utf-8");
      return JSON.parse(content) as AccountConfig;
    });
}

export function accountExists(name: string): boolean {
  return fs.existsSync(getAccountPath(name));
}

export function saveAccount(name: string): void {
  ensureDataDir();
  const config: AccountConfig = {
    name,
    addedAt: new Date().toISOString(),
  };
  fs.writeFileSync(getAccountPath(name), JSON.stringify(config, null, 2));
}

export function removeAccount(name: string): boolean {
  const accountPath = getAccountPath(name);
  const storagePath = getStorageStatePath(name);
  const profileDir = getProfileDir(name);

  if (!fs.existsSync(accountPath)) {
    return false;
  }

  fs.unlinkSync(accountPath);
  if (fs.existsSync(storagePath)) {
    fs.unlinkSync(storagePath);
  }
  if (fs.existsSync(profileDir)) {
    fs.rmSync(profileDir, { recursive: true });
  }
  return true;
}
