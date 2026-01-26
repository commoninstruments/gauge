import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { AccountConfig } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACCOUNTS_DIR = path.join(__dirname, "..", "accounts");

export function ensureAccountsDir(): void {
  if (!fs.existsSync(ACCOUNTS_DIR)) {
    fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  }
}

export function getAccountsDir(): string {
  return ACCOUNTS_DIR;
}

export function getAccountPath(name: string): string {
  return path.join(ACCOUNTS_DIR, `${name}.json`);
}

export function getStorageStatePath(name: string): string {
  return path.join(ACCOUNTS_DIR, `${name}-storage.json`);
}

export function listAccounts(): AccountConfig[] {
  ensureAccountsDir();
  const files = fs.readdirSync(ACCOUNTS_DIR);
  return files
    .filter((f) => f.endsWith(".json") && !f.includes("-storage"))
    .map((f) => {
      const content = fs.readFileSync(path.join(ACCOUNTS_DIR, f), "utf-8");
      return JSON.parse(content) as AccountConfig;
    });
}

export function accountExists(name: string): boolean {
  return fs.existsSync(getAccountPath(name));
}

export function saveAccount(name: string): void {
  ensureAccountsDir();
  const config: AccountConfig = {
    name,
    addedAt: new Date().toISOString(),
  };
  fs.writeFileSync(getAccountPath(name), JSON.stringify(config, null, 2));
}

export function removeAccount(name: string): boolean {
  const accountPath = getAccountPath(name);
  const storagePath = getStorageStatePath(name);

  if (!fs.existsSync(accountPath)) {
    return false;
  }

  fs.unlinkSync(accountPath);
  if (fs.existsSync(storagePath)) {
    fs.unlinkSync(storagePath);
  }
  return true;
}
