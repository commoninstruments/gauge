import { chromium, request, type Page } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";
import { getStorageStatePath, getAccountsDir } from "./accounts.js";
import type { Organization, UsageResponse, AccountUsage } from "./types.js";

const CLAUDE_URL = "https://claude.ai";
const LOGIN_TIMEOUT_MS = 300000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

// Get a unique profile directory for each account
function getProfileDir(name: string): string {
  return path.join(getAccountsDir(), `profile-${name}`);
}

export async function addAccount(name: string): Promise<boolean> {
  const profileDir = getProfileDir(name);

  // Use launchPersistentContext with a real Chrome executable
  // This creates a more realistic browser fingerprint
  console.log(`\nOpening browser for account "${name}"...`);
  console.log("Please log in to Claude. The browser will close automatically when done.");
  console.log("(If Cloudflare blocks you, try logging in first in your regular Chrome)\n");

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel: "chrome", // Use installed Chrome instead of Playwright's Chromium
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
    ],
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    ignoreDefaultArgs: ["--enable-automation"],
  });

  const page = context.pages()[0] || (await context.newPage());

  await page.goto(`${CLAUDE_URL}/login`, { waitUntil: "domcontentloaded" });

  const loginDetected = await waitForLoginSignal(page, LOGIN_TIMEOUT_MS);
  if (!loginDetected) {
    console.error("Login timed out. Please try again.");
    await context.close();
    return false;
  }

  console.log("Login detected, verifying...");

  // Give it a moment for cookies to settle
  await page.waitForTimeout(2000);

  try {
    await assertLoggedIn(page);
  } catch {
    console.error("Login verification failed. Please make sure you're logged in.");
    await context.close();
    return false;
  }

  // Save storage state (cookies, localStorage)
  const storagePath = getStorageStatePath(name);
  await context.storageState({ path: storagePath });

  await context.close();
  return true;
}

export async function fetchUsageForAccount(name: string): Promise<AccountUsage> {
  const profileDir = getProfileDir(name);
  const storagePath = getStorageStatePath(name);

  if (!fs.existsSync(profileDir) && !fs.existsSync(storagePath)) {
    return {
      name,
      plan: "unknown",
      orgUuid: "",
      usage: {} as UsageResponse,
      error: "No saved session. Run: claudestatus add " + name,
    };
  }

  const requestResult = await fetchUsageViaRequest(name, storagePath);
  if (requestResult) {
    return requestResult;
  }

  // Use the same persistent profile for consistent browser fingerprint
  // Using headed mode which is less detectable than old headless
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false, // Must be visible to bypass Cloudflare
    channel: "chrome",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-extensions",
      "--window-size=800,600",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
    viewport: { width: 800, height: 600 },
  });

  const page = context.pages()[0] || (await context.newPage());

  try {
    // Navigate to get cookies working
    await page.goto(`${CLAUDE_URL}/settings/usage`, { waitUntil: "domcontentloaded" });

    // Check if we hit Cloudflare
    const content = await page.content();
    if (
      content.includes("Just a moment") ||
      content.includes("challenge-platform") ||
      content.includes("cf-turnstile")
    ) {
      throw new Error("Cloudflare block - run: claudestatus refresh " + name);
    }

    const orgs = await fetchOrganizationsFromPage(page);
    if (!orgs || orgs.length === 0) {
      throw new Error("No organizations found");
    }

    const org = orgs[0];
    const plan = org.capabilities.includes("claude_max")
      ? "max"
      : org.capabilities.includes("chat")
        ? "pro"
        : "unknown";

    const usageResponse = await fetchUsageFromPage(page, org.uuid);

    // Update storage state
    await context.storageState({ path: storagePath });

    await context.close();

    return {
      name,
      plan: plan as "pro" | "max" | "unknown",
      orgUuid: org.uuid,
      usage: usageResponse as UsageResponse,
    };
  } catch (error) {
    await context.close();
    const message = error instanceof Error ? error.message : String(error);

    // Check if it's an auth error
    if (message.includes("401") || message.includes("403")) {
      return {
        name,
        plan: "unknown",
        orgUuid: "",
        usage: {} as UsageResponse,
        error: "Session expired. Run: claudestatus refresh " + name,
      };
    }

    return {
      name,
      plan: "unknown",
      orgUuid: "",
      usage: {} as UsageResponse,
      error: message,
    };
  }
}

export async function fetchAllUsage(accountNames: string[]): Promise<AccountUsage[]> {
  // Fetch sequentially - parallel would open too many browser windows
  const results: AccountUsage[] = [];
  for (const name of accountNames) {
    process.stdout.write(`  Checking ${name}...`);
    const usage = await fetchUsageForAccount(name);
    if (usage.error) {
      console.log(` error`);
    } else {
      console.log(` ${usage.usage.five_hour?.utilization ?? 0}% session`);
    }
    results.push(usage);
  }
  return results;
}

async function waitForLoginSignal(page: Page, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const currentUrl = page.url();
    if (/claude\.ai\/(new|recents|chat|settings)/.test(currentUrl)) {
      return true;
    }

    try {
      const ok = await page.evaluate(async () => {
        try {
          const res = await fetch("https://claude.ai/api/organizations");
          return res.ok;
        } catch {
          return false;
        }
      });
      if (ok) {
        return true;
      }
    } catch {
      // Ignore transient navigation errors while the user is logging in.
    }

    await page.waitForTimeout(2000);
  }
  return false;
}

async function assertLoggedIn(page: Page): Promise<void> {
  const orgs = await fetchOrganizationsFromPage(page);
  if (!orgs || orgs.length === 0) {
    throw new Error("No organizations found");
  }
}

async function fetchOrganizationsFromPage(page: Page): Promise<Organization[]> {
  const orgsResponse = await page.evaluate(async () => {
    const res = await fetch("https://claude.ai/api/organizations");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
  return orgsResponse as Organization[];
}

async function fetchUsageFromPage(page: Page, uuid: string): Promise<UsageResponse> {
  const usageResponse = await page.evaluate(async (orgUuid: string) => {
    const res = await fetch(`https://claude.ai/api/organizations/${orgUuid}/usage`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, uuid);
  return usageResponse as UsageResponse;
}

async function fetchUsageViaRequest(
  name: string,
  storagePath: string
): Promise<AccountUsage | null> {
  if (!fs.existsSync(storagePath)) {
    return null;
  }

  const api = await request.newContext({
    baseURL: CLAUDE_URL,
    storageState: storagePath,
    extraHTTPHeaders: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  try {
    const orgsRes = await api.get("/api/organizations");
    if (orgsRes.status() === 401) {
      return {
        name,
        plan: "unknown",
        orgUuid: "",
        usage: {} as UsageResponse,
        error: "Session expired. Run: claudestatus refresh " + name,
      };
    }

    if (orgsRes.status() === 403) {
      const contentType = orgsRes.headers()["content-type"] ?? "";
      if (contentType.includes("text/html")) {
        return null;
      }
      return {
        name,
        plan: "unknown",
        orgUuid: "",
        usage: {} as UsageResponse,
        error: "Session expired. Run: claudestatus refresh " + name,
      };
    }

    if (!orgsRes.ok()) {
      return null;
    }

    const orgs = (await orgsRes.json()) as Organization[];
    if (!orgs || orgs.length === 0) {
      return {
        name,
        plan: "unknown",
        orgUuid: "",
        usage: {} as UsageResponse,
        error: "No organizations found",
      };
    }

    const org = orgs[0];
    const plan = org.capabilities.includes("claude_max")
      ? "max"
      : org.capabilities.includes("chat")
        ? "pro"
        : "unknown";

    const usageRes = await api.get(`/api/organizations/${org.uuid}/usage`);
    if (usageRes.status() === 401) {
      return {
        name,
        plan: "unknown",
        orgUuid: "",
        usage: {} as UsageResponse,
        error: "Session expired. Run: claudestatus refresh " + name,
      };
    }

    if (usageRes.status() === 403) {
      const contentType = usageRes.headers()["content-type"] ?? "";
      if (contentType.includes("text/html")) {
        return null;
      }
      return {
        name,
        plan: "unknown",
        orgUuid: "",
        usage: {} as UsageResponse,
        error: "Session expired. Run: claudestatus refresh " + name,
      };
    }

    if (!usageRes.ok()) {
      return null;
    }

    const usage = (await usageRes.json()) as UsageResponse;

    await api.storageState({ path: storagePath });

    return {
      name,
      plan: plan as "pro" | "max" | "unknown",
      orgUuid: org.uuid,
      usage,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("401")) {
      return {
        name,
        plan: "unknown",
        orgUuid: "",
        usage: {} as UsageResponse,
        error: "Session expired. Run: claudestatus refresh " + name,
      };
    }
    return null;
  } finally {
    await api.dispose();
  }
}
