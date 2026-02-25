import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDataDir, getDataDir } from "./paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_DIR = path.join(__dirname, "..", "accounts");

export function migrateIfNeeded(): boolean {
  if (!fs.existsSync(LEGACY_DIR)) {
    return false;
  }

  const legacyFiles = fs.readdirSync(LEGACY_DIR);
  if (legacyFiles.length === 0) {
    return false;
  }

  const dataDir = getDataDir();
  if (fs.existsSync(dataDir) && fs.readdirSync(dataDir).length > 0) {
    return false;
  }

  ensureDataDir();

  for (const file of legacyFiles) {
    const src = path.join(LEGACY_DIR, file);
    const dest = path.join(dataDir, file);
    fs.cpSync(src, dest, { recursive: true });
  }

  return true;
}
