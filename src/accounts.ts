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
import type { AccountConfig, Provider } from "./types.js";

export interface AccountDetails extends AccountConfig {
  authKey: string;
  hasProfileDir: boolean;
  hasStorageState: boolean;
  provider: Provider;
}

function normalizeProvider(provider: Provider | undefined): Provider {
  return provider ?? "claude";
}

function accountKey(name: string, provider: Provider | undefined): string {
  const normalized = normalizeProvider(provider);
  return normalized === "claude" ? name : `${normalized}-${name}`;
}

/** Return all saved accounts sorted by name. */
export function listAccounts(): AccountConfig[] {
  ensureDataDir();
  const dir = getDataDir();
  const files = fs.readdirSync(dir);
  return files
    .filter((f) => f.endsWith(".json") && !f.includes("-storage"))
    .map((f) => {
      const content = fs.readFileSync(path.join(dir, f), "utf-8");
      const account = JSON.parse(content) as AccountConfig;
      return {
        ...account,
        provider: normalizeProvider(account.provider),
      };
    })
    .sort((a, b) =>
      `${a.provider}:${a.name}`.localeCompare(`${b.provider}:${b.name}`),
    );
}

/** Check whether a named account config file exists on disk. */
export function accountExists(name: string, provider?: Provider): boolean {
  return fs.existsSync(getAccountPath(accountKey(name, provider)));
}

/** Persist a new account config to the data directory. */
export function saveAccount(
  name: string,
  options: { codexHome?: string; provider?: Provider } = {},
): void {
  ensureDataDir();
  const config: AccountConfig = {
    ...(options.codexHome !== undefined && { codexHome: options.codexHome }),
    name,
    provider: normalizeProvider(options.provider),
    addedAt: new Date().toISOString(),
  };
  const accountPath = getAccountPath(accountKey(name, options.provider));
  fs.writeFileSync(accountPath, JSON.stringify(config, null, 2));
  lockFile(accountPath);
}

/** Import a Playwright storage-state from JSON string or file path. */
export function importStorageState(
  name: string,
  options: { json?: string; filePath?: string },
  provider?: Provider,
): string {
  ensureDataDir();
  const normalized =
    options.json === undefined
      ? readStorageStateFile(options.filePath ?? "")
      : parseStorageStateJson(options.json);
  const storagePath = getStorageStatePath(accountKey(name, provider));
  fs.writeFileSync(storagePath, normalized, "utf8");
  lockFile(storagePath);
  return storagePath;
}

/** Return the file paths for all local artifacts belonging to an account. */
export function getAccountArtifacts(
  name: string,
  provider?: Provider,
): {
  authKey: string;
  accountPath: string;
  storagePath: string;
  profileDir: string;
};
export function getAccountArtifacts(
  name: string,
  provider?: Provider,
): {
  authKey: string;
  accountPath: string;
  storagePath: string;
  profileDir: string;
} {
  const authKey = accountKey(name, provider);
  return {
    authKey,
    accountPath: getAccountPath(authKey),
    storagePath: getStorageStatePath(authKey),
    profileDir: getProfileDir(authKey),
  };
}

/** List accounts with flags indicating which local auth artifacts exist. */
export function listAccountDetails(provider?: Provider): AccountDetails[] {
  return listAccounts()
    .filter((account) => !provider || account.provider === provider)
    .map((account) => {
      const normalizedProvider = normalizeProvider(account.provider);
      const artifacts = getAccountArtifacts(account.name, normalizedProvider);
      return {
        ...account,
        authKey: artifacts.authKey,
        provider: normalizedProvider,
        hasStorageState: fs.existsSync(artifacts.storagePath),
        hasProfileDir: fs.existsSync(artifacts.profileDir),
      };
    });
}

/** Delete an account and all its local artifacts. Returns false if not found. */
export function removeAccount(name: string, provider?: Provider): boolean {
  const artifacts = getAccountArtifacts(name, provider);
  const accountPath = artifacts.accountPath;
  const storagePath = artifacts.storagePath;
  const profileDir = artifacts.profileDir;

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
