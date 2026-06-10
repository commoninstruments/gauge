import fs from "node:fs";
import {
  type APIResponse,
  chromium,
  type Page,
  request,
} from "playwright-core";
import { assertChromeInstalled } from "./chrome.js";
import { getProfileDir, getStorageStatePath, lockFile } from "./paths.js";
import type {
  AccountUsage,
  Organization,
  Plan,
  UsageResponse,
} from "./types.js";

function derivePlan(org: Organization): Plan {
  const tier = org.rate_limit_tier ?? "";
  if (tier.includes("claude_max_20x")) {
    return "max_20x";
  }
  if (tier.includes("claude_max_5x")) {
    return "max_5x";
  }
  if (tier.includes("claude_max")) {
    return "max";
  }
  if (org.capabilities.includes("claude_max")) {
    return "max";
  }
  if (org.capabilities.includes("chat")) {
    return "pro";
  }
  return "unknown";
}

const CLAUDE_URL = "https://claude.ai";
const LOGIN_URL_RE = /claude\.ai\/(new|recents|chat|settings)/;
const LOGIN_TIMEOUT_MS = 300_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

/** Open a Chrome browser for the user to log in and persist the session. */
export async function addAccount(
  name: string,
  options: { quiet?: boolean } = {},
): Promise<boolean> {
  assertChromeInstalled();
  const profileDir = getProfileDir(name);
  const quiet = options.quiet ?? false;

  // Use launchPersistentContext with a real Chrome executable
  // This creates a more realistic browser fingerprint
  if (!quiet) {
    console.log(`\nOpening browser for account "${name}"...`);
    console.log(
      "Please log in to Claude. The browser will close automatically when done.",
    );
    console.log(
      "(If Cloudflare blocks you, try logging in first in your regular Chrome)\n",
    );
  }

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
    if (!quiet) {
      console.error("Login timed out. Please try again.");
    }
    await context.close();
    return false;
  }

  if (!quiet) {
    console.log("Login detected, verifying...");
  }

  // Give it a moment for cookies to settle
  await page.waitForTimeout(2000);

  try {
    await assertLoggedIn(page);
  } catch {
    if (!quiet) {
      console.error(
        "Login verification failed. Please make sure you're logged in.",
      );
    }
    await context.close();
    return false;
  }

  const storagePath = getStorageStatePath(name);
  await context.storageState({ path: storagePath });
  lockFile(storagePath);

  await context.close();
  return true;
}

/** Fetch usage data for a single account, falling back to browser if the API request fails. */
export async function fetchUsageForAccount(
  name: string,
): Promise<AccountUsage> {
  const profileDir = getProfileDir(name);
  const storagePath = getStorageStatePath(name);

  if (!(fs.existsSync(profileDir) || fs.existsSync(storagePath))) {
    return {
      name,
      plan: "unknown",
      orgUuid: "",
      usage: {} as UsageResponse,
      error: `No saved session. Run: gauge add ${name}`,
    };
  }

  const requestResult = await fetchUsageViaRequest(name, storagePath);
  if (requestResult) {
    return requestResult;
  }

  assertChromeInstalled();

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
    await page.goto(`${CLAUDE_URL}/settings/usage`, {
      waitUntil: "domcontentloaded",
    });

    // Check if we hit Cloudflare
    const content = await page.content();
    if (
      content.includes("Just a moment") ||
      content.includes("challenge-platform") ||
      content.includes("cf-turnstile")
    ) {
      throw new Error(`Cloudflare block - run: gauge refresh ${name}`);
    }

    const orgs = await fetchOrganizationsFromPage(page);
    const org = orgs?.[0];
    if (!org) {
      throw new Error("No organizations found");
    }

    const plan = derivePlan(org);

    const usageResponse = await fetchUsageFromPage(page, org.uuid);

    await context.storageState({ path: storagePath });
    lockFile(storagePath);

    await context.close();

    return {
      name,
      plan,
      orgUuid: org.uuid,
      usage: usageResponse as UsageResponse,
    };
  } catch (error) {
    await context.close();
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("401") || message.includes("403")) {
      return expiredError(name);
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

/** Fetch usage data for multiple accounts sequentially. */
export async function fetchAllUsage(
  accountNames: string[],
  options: { quiet?: boolean } = {},
): Promise<AccountUsage[]> {
  // Fetch sequentially - parallel would open too many browser windows
  const results: AccountUsage[] = [];
  const quiet = options.quiet ?? false;
  for (const name of accountNames) {
    if (!quiet) {
      process.stdout.write(`  Checking ${name}...`);
    }
    const usage = await fetchUsageForAccount(name);
    if (!quiet) {
      if (usage.error) {
        console.log(" error");
      } else {
        console.log(` ${usage.usage.five_hour?.utilization ?? 0}% session`);
      }
    }
    results.push(usage);
  }
  return results;
}

async function waitForLoginSignal(
  page: Page,
  timeoutMs: number,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const currentUrl = page.url();
    if (LOGIN_URL_RE.test(currentUrl)) {
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
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  });
  return orgsResponse as Organization[];
}

async function fetchUsageFromPage(
  page: Page,
  uuid: string,
): Promise<UsageResponse> {
  const usageResponse = await page.evaluate(async (orgUuid: string) => {
    const res = await fetch(
      `https://claude.ai/api/organizations/${encodeURIComponent(orgUuid)}/usage`,
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }, uuid);
  return usageResponse as UsageResponse;
}

function expiredError(name: string): AccountUsage {
  return {
    name,
    plan: "unknown",
    orgUuid: "",
    usage: {} as UsageResponse,
    error: `Session expired. Run: gauge refresh ${name}`,
  };
}

function checkResponse(
  name: string,
  res: APIResponse,
): AccountUsage | null | "ok" {
  if (res.status() === 401) {
    return expiredError(name);
  }
  if (res.status() === 403) {
    const contentType = res.headers()["content-type"] ?? "";
    return contentType.includes("text/html") ? null : expiredError(name);
  }
  return res.ok() ? "ok" : null;
}

async function fetchUsageViaRequest(
  name: string,
  storagePath: string,
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
    const orgsCheck = checkResponse(name, orgsRes);
    if (orgsCheck !== "ok") {
      return orgsCheck;
    }

    const orgs = (await orgsRes.json()) as Organization[];
    const org = orgs?.[0];
    if (!org) {
      return {
        name,
        plan: "unknown",
        orgUuid: "",
        usage: {} as UsageResponse,
        error: "No organizations found",
      };
    }

    const plan = derivePlan(org);

    const usageRes = await api.get(
      `/api/organizations/${encodeURIComponent(org.uuid)}/usage`,
    );
    const usageCheck = checkResponse(name, usageRes);
    if (usageCheck !== "ok") {
      return usageCheck;
    }

    const usage = (await usageRes.json()) as UsageResponse;

    await api.storageState({ path: storagePath });
    lockFile(storagePath);

    return {
      name,
      plan,
      orgUuid: org.uuid,
      usage,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("401")) {
      return expiredError(name);
    }
    return null;
  } finally {
    await api.dispose();
  }
}
