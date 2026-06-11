import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AccountDetails } from "./accounts.js";
import { getStorageStatePath } from "./paths.js";
import type { RateWindow, UnifiedAccount } from "./types.js";

const CODEX_TOKEN_REFRESH_URL = "https://auth.openai.com/oauth/token";
const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_TOKEN_REFRESH_AFTER_MS = 8 * 24 * 60 * 60 * 1000;
const CURSOR_BASE_URL = "https://cursor.com";

interface CodexSource {
  email?: string;
  homePath: string;
  label?: string;
}

interface CodexCredentials {
  accessToken: string;
  accountId?: string;
  idToken?: string;
  lastRefresh?: Date;
  refreshToken?: string;
}

interface CursorSession {
  cookieHeader: string;
  label: string;
}

function home(...parts: string[]): string {
  return path.join(os.homedir(), ...parts);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function dateValue(value: unknown): Date | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
}

function labelFromEmail(email: string): string {
  const domain = email.split("@")[1] ?? email;
  return domain.split(".")[0] ?? email;
}

function normalizeReset(value: unknown): string | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
  }
  const numeric = numberValue(value);
  if (numeric === undefined) return null;
  const milliseconds = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  return new Date(milliseconds).toISOString();
}

function toRateWindow(value: unknown): RateWindow | null {
  if (!isRecord(value)) return null;
  const usedPercent = numberValue(
    value.used_percent ?? value.usedPercent ?? value.totalPercentUsed,
  );
  const resetsAt = normalizeReset(value.reset_at ?? value.resetsAt);
  if (usedPercent === undefined || !resetsAt) return null;
  return { usedPercent, resetsAt };
}

function decodeJwtPayload(token: string | undefined): Record<string, unknown> {
  if (!token) return {};
  const part = token.split(".")[1];
  if (!part) return {};
  try {
    return JSON.parse(
      Buffer.from(part, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function titleCaseWords(raw: string): string {
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatCodexPlan(raw: unknown): string {
  const value = stringValue(raw)?.toLowerCase();
  if (!value) return "Pro";
  if (value === "pro") return "Pro 20x";
  if (["prolite", "pro_lite", "pro-lite", "pro lite"].includes(value))
    return "Pro 5x";
  return titleCaseWords(value);
}

function errorAccount(
  provider: "codex" | "cursor",
  label: string,
  message: string,
  email = "",
): UnifiedAccount {
  return {
    provider,
    label,
    email,
    plan: "",
    session: null,
    weekly: null,
    error: message,
  };
}

function discoverCodexSources(): CodexSource[] {
  const sources: CodexSource[] = [];
  const addSource = (source: CodexSource): void => {
    const authPath = path.join(source.homePath, "auth.json");
    if (!fs.existsSync(authPath)) return;
    if (sources.some((existing) => existing.homePath === source.homePath))
      return;
    sources.push(source);
  };

  if (process.env.CODEX_HOME) {
    addSource({ homePath: process.env.CODEX_HOME });
    return sources;
  }

  addSource({ homePath: home(".codex") });

  return sources;
}

function codexSourcesFromAccounts(accounts: AccountDetails[]): CodexSource[] {
  return accounts
    .filter((account) => account.provider === "codex" && account.codexHome)
    .map((account) => ({
      homePath: account.codexHome ?? "",
      label: account.name,
    }));
}

function loadCodexCredentials(homePath: string): CodexCredentials {
  const authPath = path.join(homePath, "auth.json");
  const auth = readJson(authPath);
  if (!isRecord(auth)) throw new Error("Invalid Codex auth.json");

  const apiKey = stringValue(auth.OPENAI_API_KEY);
  if (apiKey) return { accessToken: apiKey };

  const tokens = isRecord(auth.tokens) ? auth.tokens : {};
  const accessToken = stringValue(tokens.access_token ?? tokens.accessToken);
  if (!accessToken) throw new Error("Codex access token missing");

  return {
    accessToken,
    accountId: stringValue(tokens.account_id ?? tokens.accountId),
    idToken: stringValue(tokens.id_token ?? tokens.idToken),
    lastRefresh: dateValue(tokens.last_refresh ?? tokens.lastRefresh),
    refreshToken: stringValue(tokens.refresh_token ?? tokens.refreshToken),
  };
}

function shouldRefreshCodex(credentials: CodexCredentials): boolean {
  if (!credentials.refreshToken || !credentials.lastRefresh) return false;
  return (
    Date.now() - credentials.lastRefresh.getTime() >
    CODEX_TOKEN_REFRESH_AFTER_MS
  );
}

async function refreshCodexCredentials(
  source: CodexSource,
  credentials: CodexCredentials,
): Promise<CodexCredentials> {
  if (!credentials.refreshToken) return credentials;

  const response = await fetch(CODEX_TOKEN_REFRESH_URL, {
    body: JSON.stringify({
      client_id: CODEX_OAUTH_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
      scope: "openid profile email",
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Codex token refresh failed (${response.status})`);
  }

  const body = (await response.json()) as unknown;
  if (!isRecord(body)) throw new Error("Invalid Codex token refresh response");
  const accessToken = stringValue(body.access_token);
  if (!accessToken) throw new Error("Codex token refresh returned no token");

  const refreshed: CodexCredentials = {
    accessToken,
    accountId: credentials.accountId,
    idToken: stringValue(body.id_token) ?? credentials.idToken,
    lastRefresh: new Date(),
    refreshToken: stringValue(body.refresh_token) ?? credentials.refreshToken,
  };

  writeRefreshedCodexAuth(source.homePath, refreshed);
  return refreshed;
}

function writeRefreshedCodexAuth(
  homePath: string,
  credentials: CodexCredentials,
): void {
  const authPath = path.join(homePath, "auth.json");
  const auth = readJson(authPath);
  if (!isRecord(auth)) return;
  const tokens = isRecord(auth.tokens) ? auth.tokens : {};
  auth.tokens = {
    ...tokens,
    access_token: credentials.accessToken,
    id_token: credentials.idToken,
    last_refresh: credentials.lastRefresh?.toISOString(),
    refresh_token: credentials.refreshToken,
  };
  fs.writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`, {
    mode: 0o600,
  });
}

function codexBaseUrl(homePath: string): string {
  const config = readFileIfExists(path.join(homePath, "config.toml"));
  const match = config?.match(/^\s*chatgpt_base_url\s*=\s*["']([^"']+)["']/m);
  return match?.[1] ?? "https://chatgpt.com/backend-api/";
}

function readFileIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function codexUsageUrl(baseUrl: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const pathName = base.includes("/backend-api/")
    ? "wham/usage"
    : "api/codex/usage";
  return new URL(pathName, base).toString();
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "gauge",
      ...headers,
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

async function fetchCodexAccount(source: CodexSource): Promise<UnifiedAccount> {
  const initialCredentials = loadCodexCredentials(source.homePath);
  const credentials = shouldRefreshCodex(initialCredentials)
    ? await refreshCodexCredentials(source, initialCredentials)
    : initialCredentials;
  const identity = decodeJwtPayload(credentials.idToken);
  const email =
    source.email ??
    stringValue(identity.email) ??
    stringValue(identity["https://api.openai.com/auth/email"]) ??
    "";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${credentials.accessToken}`,
  };
  if (credentials.accountId) {
    headers["ChatGPT-Account-Id"] = credentials.accountId;
  }

  const usage = await fetchJson(
    codexUsageUrl(codexBaseUrl(source.homePath)),
    headers,
  );
  if (!isRecord(usage)) throw new Error("Invalid Codex usage response");
  const rateLimit = isRecord(usage.rate_limit) ? usage.rate_limit : {};
  const session = toRateWindow(rateLimit.primary_window);
  const weekly = toRateWindow(rateLimit.secondary_window);
  const label = source.label ?? (email ? labelFromEmail(email) : "codex");

  return {
    provider: "codex",
    label,
    email,
    plan: formatCodexPlan(usage.plan_type),
    session,
    weekly,
  };
}

export async function fetchCodexAccounts(
  configuredAccounts: AccountDetails[] = [],
): Promise<UnifiedAccount[]> {
  const configuredSources = codexSourcesFromAccounts(configuredAccounts);
  const sources =
    configuredSources.length > 0 ? configuredSources : discoverCodexSources();
  const accounts = await Promise.all(
    sources.map(async (source) => {
      try {
        return await fetchCodexAccount(source);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const label =
          source.label ??
          (source.email ? labelFromEmail(source.email) : "codex");
        return errorAccount("codex", label, message, source.email);
      }
    }),
  );
  return uniquifyAccountLabels(accounts);
}

function parseStorageStateCookies(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.cookies)) return null;
  const pairs: string[] = [];
  for (const cookie of value.cookies) {
    if (!isRecord(cookie)) continue;
    const name = stringValue(cookie.name);
    const cookieValue = stringValue(cookie.value);
    const domain = stringValue(cookie.domain) ?? "";
    if (!name || !cookieValue) continue;
    if (!/cursor\.(com|sh)$/i.test(domain.replace(/^\./, ""))) continue;
    pairs.push(`${name}=${cookieValue}`);
  }
  return pairs.length > 0 ? pairs.join("; ") : null;
}

function parseCookieFile(filePath: string): string | null {
  const text = readFileIfExists(filePath);
  if (!text) return null;
  try {
    return parseStorageStateCookies(JSON.parse(text)) ?? text.trim();
  } catch {
    return text.trim();
  }
}

function cursorSessionsFromAccounts(
  accounts: AccountDetails[],
): CursorSession[] {
  const sessions: CursorSession[] = [];
  for (const account of accounts) {
    if (account.provider !== "cursor") continue;
    const storagePath = getStorageStatePath(account.authKey);
    sessions.push({
      cookieHeader: parseCookieFile(storagePath) ?? "",
      label: account.name,
    });
  }
  return sessions;
}

function discoverCursorSessions(): CursorSession[] {
  const sessions: CursorSession[] = [];
  const add = (
    cookieHeader: string | null | undefined,
    label: string,
  ): void => {
    if (!cookieHeader) return;
    const trimmed = cookieHeader.trim();
    if (!trimmed) return;
    if (sessions.some((session) => session.cookieHeader === trimmed)) return;
    sessions.push({ cookieHeader: trimmed, label });
  };

  add(process.env.GAUGE_CURSOR_COOKIE, "cursor");
  add(
    process.env.GAUGE_CURSOR_COOKIE_FILE
      ? parseCookieFile(process.env.GAUGE_CURSOR_COOKIE_FILE)
      : null,
    "cursor",
  );
  add(
    process.env.GAUGE_CURSOR_STORAGE_STATE_FILE
      ? parseCookieFile(process.env.GAUGE_CURSOR_STORAGE_STATE_FILE)
      : null,
    "cursor",
  );
  add(
    process.env.GAUGE_CURSOR_STORAGE_STATE_JSON
      ? parseStorageStateCookies(
          parseJsonString(process.env.GAUGE_CURSOR_STORAGE_STATE_JSON),
        )
      : null,
    "cursor",
  );

  return sessions;
}

function parseJsonString(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function ratioPercent(used: unknown, limit: unknown): number | undefined {
  const usedNumber = numberValue(used);
  const limitNumber = numberValue(limit);
  if (
    usedNumber === undefined ||
    limitNumber === undefined ||
    limitNumber <= 0
  ) {
    return undefined;
  }
  return (usedNumber / limitNumber) * 100;
}

function cursorUsagePercent(usage: Record<string, unknown>): number {
  const individual = isRecord(usage.individualUsage)
    ? usage.individualUsage
    : {};
  const team = isRecord(usage.teamUsage) ? usage.teamUsage : {};
  const plan = isRecord(individual.plan) ? individual.plan : {};
  const overall = isRecord(individual.overall) ? individual.overall : {};
  const pooled = isRecord(team.pooled) ? team.pooled : {};

  return (
    numberValue(plan.totalPercentUsed) ??
    averagePercent(plan.autoPercentUsed, plan.apiPercentUsed) ??
    numberValue(plan.apiPercentUsed) ??
    numberValue(plan.autoPercentUsed) ??
    ratioPercent(plan.used, plan.limit) ??
    ratioPercent(overall.used, overall.limit) ??
    ratioPercent(pooled.used, pooled.limit) ??
    0
  );
}

function cursorSecondaryPercent(
  usage: Record<string, unknown>,
): number | undefined {
  const individual = isRecord(usage.individualUsage)
    ? usage.individualUsage
    : {};
  const team = isRecord(usage.teamUsage) ? usage.teamUsage : {};
  const plan = isRecord(individual.plan) ? individual.plan : {};
  const onDemand = isRecord(individual.onDemand)
    ? individual.onDemand
    : isRecord(team.onDemand)
      ? team.onDemand
      : {};

  return (
    numberValue(plan.autoPercentUsed) ??
    numberValue(plan.apiPercentUsed) ??
    ratioPercent(onDemand.used, onDemand.limit)
  );
}

function averagePercent(left: unknown, right: unknown): number | undefined {
  const values = [numberValue(left), numberValue(right)].filter(
    (value): value is number => value !== undefined,
  );
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatCursorPlan(raw: unknown): string {
  const value = stringValue(raw);
  if (!value) return "Cursor";
  const normalized = value.toLowerCase();
  if (normalized.includes("enterprise")) return "Cursor Enterprise";
  if (normalized.includes("team")) return "Cursor Team";
  if (normalized.includes("pro")) return "Cursor Pro";
  if (normalized.includes("hobby")) return "Cursor Hobby";
  return `Cursor ${titleCaseWords(value)}`;
}

async function fetchCursorAccount(
  session: CursorSession,
): Promise<UnifiedAccount> {
  const cookieHeader = session.cookieHeader;
  if (!cookieHeader) {
    throw new Error(
      `No Cursor storage state. Run: gauge refresh cursor ${session.label}`,
    );
  }
  const [usage, user] = await Promise.all([
    fetchJson(`${CURSOR_BASE_URL}/api/usage-summary`, { Cookie: cookieHeader }),
    fetchJson(`${CURSOR_BASE_URL}/api/auth/me`, { Cookie: cookieHeader }).catch(
      () => null,
    ),
  ]);
  if (!isRecord(usage)) throw new Error("Invalid Cursor usage response");
  const end = normalizeReset(usage.billingCycleEnd);
  const secondaryPercent = cursorSecondaryPercent(usage);
  const userInfo = isRecord(user) ? user : {};
  const email = stringValue(userInfo.email) ?? "";

  return {
    provider: "cursor",
    label: email ? labelFromEmail(email) : session.label,
    email,
    plan: formatCursorPlan(usage.membershipType),
    renewsAt: end,
    session: end
      ? {
          usedPercent: cursorUsagePercent(usage),
          resetsAt: end,
        }
      : null,
    weekly:
      end && secondaryPercent !== undefined
        ? {
            usedPercent: secondaryPercent,
            resetsAt: end,
          }
        : null,
  };
}

export async function fetchCursorAccounts(
  configuredAccounts: AccountDetails[] = [],
): Promise<UnifiedAccount[]> {
  const configuredSessions = cursorSessionsFromAccounts(configuredAccounts);
  const sessions =
    configuredSessions.length > 0
      ? configuredSessions
      : discoverCursorSessions();
  const accounts = await Promise.all(
    sessions.map(async (session) => {
      try {
        return await fetchCursorAccount(session);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorAccount("cursor", session.label, message);
      }
    }),
  );
  return uniquifyAccountLabels(accounts);
}

function uniquifyAccountLabels(accounts: UnifiedAccount[]): UnifiedAccount[] {
  const totals = new Map<string, number>();
  for (const account of accounts) {
    totals.set(account.label, (totals.get(account.label) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  return accounts.map((account) => {
    if ((totals.get(account.label) ?? 0) <= 1) return account;
    const index = (seen.get(account.label) ?? 0) + 1;
    seen.set(account.label, index);
    return {
      ...account,
      label: index === 1 ? account.label : `${account.label} ${index}`,
    };
  });
}

export const __test = {
  cursorSecondaryPercent,
  cursorUsagePercent,
  decodeJwtPayload,
  formatCodexPlan,
  parseStorageStateCookies,
  toRateWindow,
};
