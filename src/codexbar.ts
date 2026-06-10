import { spawnSync } from "node:child_process";
import type { Provider, RateWindow, UnifiedAccount } from "./types.js";

interface CbWindow {
  usedPercent: number;
  resetsAt: string;
  windowMinutes?: number;
}

interface CbUsage {
  primary: CbWindow | null;
  secondary: CbWindow | null;
  accountEmail?: string;
  loginMethod?: string;
  identity?: {
    loginMethod?: string;
    accountEmail?: string;
  };
}

interface CbEntry {
  provider: string;
  error?: { message: string };
  usage?: CbUsage;
  account?: string;
}

function labelFromEmail(email: string): string {
  const domain = email.split("@")[1] ?? email;
  return domain.split(".")[0] ?? email;
}

function normalizePlan(raw: string | undefined): string {
  if (!raw) return "Pro";
  const m = raw.toLowerCase();
  if (m.includes("enterprise")) return "Enterprise";
  if (m.includes("20x") || m.includes("max_20") || m.includes("max 20"))
    return "Max 20x";
  if (m.includes("5x") || m.includes("max_5") || m.includes("max 5"))
    return "Max 5x";
  if (m.includes("max")) return "Max";
  return "Pro";
}

function mapEntry(entry: CbEntry): UnifiedAccount | null {
  const provider = entry.provider as Provider;
  if (entry.error) {
    return {
      provider,
      label: entry.account ? labelFromEmail(entry.account) : provider,
      email: entry.account ?? "",
      plan: "",
      session: null,
      weekly: null,
      error: entry.error.message,
    };
  }
  const u = entry.usage;
  if (!u) return null;
  const email =
    u.accountEmail ?? u.identity?.accountEmail ?? entry.account ?? "";
  const plan = normalizePlan(u.loginMethod ?? u.identity?.loginMethod);
  const toWindow = (w: CbWindow | null): RateWindow | null =>
    w ? { usedPercent: w.usedPercent, resetsAt: w.resetsAt } : null;
  return {
    provider,
    label: labelFromEmail(email),
    email,
    plan,
    session: toWindow(u.primary),
    weekly: toWindow(u.secondary),
  };
}

function runCodexbar(args: string[]): CbEntry[] {
  const result = spawnSync("codexbar", ["usage", ...args], {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.error) return [];
  const out = result.stdout ?? "";
  if (!out.trim()) return [];
  try {
    return JSON.parse(out) as CbEntry[];
  } catch {
    return [];
  }
}

export function fetchCodexAccounts(): UnifiedAccount[] {
  const entries = runCodexbar([
    "--provider",
    "codex",
    "--all-accounts",
    "--json",
  ]);
  return entries.map(mapEntry).filter((a): a is UnifiedAccount => a !== null);
}

export function fetchCursorAccounts(): UnifiedAccount[] {
  const entries = runCodexbar(["--provider", "cursor", "--json"]);
  return entries.map(mapEntry).filter((a): a is UnifiedAccount => a !== null);
}
