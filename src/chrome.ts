import { execSync } from "node:child_process";
import fs from "node:fs";

const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
};

export function findChrome(): string | null {
  const candidates = CHROME_PATHS[process.platform] ?? [];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  try {
    const result = execSync("which google-chrome || which chromium", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (result) {
      return result;
    }
  } catch {
    // not found via which
  }

  return null;
}

export function assertChromeInstalled(): void {
  if (!findChrome()) {
    console.error(
      "Chrome is required but was not found.\n\n" +
        "Install Google Chrome from: https://www.google.com/chrome/\n" +
        "claudestatus uses your system Chrome via Playwright — no bundled browser is included."
    );
    process.exit(1);
  }
}
