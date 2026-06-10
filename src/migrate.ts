import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDataDir, getDataDir, getLegacyDataDir } from "./paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_LEGACY_DIR = path.join(__dirname, "..", "accounts");

/** Copy existing pre-rename account data to ~/.gauge if needed. */
export function migrateIfNeeded(): boolean {
  const dataDir = getDataDir();
  if (fs.existsSync(dataDir) && fs.readdirSync(dataDir).length > 0) {
    return false;
  }

  const legacyDir = findLegacySourceDir();
  if (!legacyDir) {
    return false;
  }

  const legacyFiles = fs.readdirSync(legacyDir);
  ensureDataDir();

  for (const file of legacyFiles) {
    const src = path.join(legacyDir, file);
    const dest = path.join(dataDir, file);
    fs.cpSync(src, dest, { recursive: true });
  }

  return true;
}

function findLegacySourceDir(): string | null {
  const candidates = [getLegacyDataDir(), BUNDLED_LEGACY_DIR];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
      return dir;
    }
  }
  return null;
}
