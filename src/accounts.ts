import fs from "node:fs";
import path from "node:path";
import {
  ensureDataDir,
  getAccountPath,
  getDataDir,
  getProfileDir,
  getStorageStatePath,
  lockFile,
} from "./paths.js";
import {
  parseStorageStateJson,
  readStorageStateFile,
} from "./storage-state.js";
import type { AccountConfig } from "./types.js";

export function listAccounts(): AccountConfig[] {
  ensureDataDir();
  const dir = getDataDir();
  const files = fs.readdirSync(dir);
  return files
    .filter((f) => f.endsWith(".json") && !f.includes("-storage"))
    .map((f) => {
      const content = fs.readFileSync(path.join(dir, f), "utf-8");
      return JSON.parse(content) as AccountConfig;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
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
  const accountPath = getAccountPath(name);
  fs.writeFileSync(accountPath, JSON.stringify(config, null, 2));
  lockFile(accountPath);
}

export function importStorageState(
  name: string,
  options: { json?: string; filePath?: string }
): string {
  ensureDataDir();
  const normalized =
    options.json === undefined
      ? readStorageStateFile(options.filePath ?? "")
      : parseStorageStateJson(options.json);
  const storagePath = getStorageStatePath(name);
  fs.writeFileSync(storagePath, normalized, "utf8");
  lockFile(storagePath);
  return storagePath;
}

export function getAccountArtifacts(name: string): {
  accountPath: string;
  storagePath: string;
  profileDir: string;
} {
  return {
    accountPath: getAccountPath(name),
    storagePath: getStorageStatePath(name),
    profileDir: getProfileDir(name),
  };
}

export function listAccountDetails(): Array<
  AccountConfig & { hasStorageState: boolean; hasProfileDir: boolean }
> {
  return listAccounts().map((account) => {
    const artifacts = getAccountArtifacts(account.name);
    return {
      ...account,
      hasStorageState: fs.existsSync(artifacts.storagePath),
      hasProfileDir: fs.existsSync(artifacts.profileDir),
    };
  });
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
