import chalk from "chalk";
import type {
  AccountUsage,
  Plan,
  Provider,
  RateWindow,
  UnifiedAccount,
} from "./types.js";

// ─── ANSI-aware string helpers ────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const visLen = (s: string): number => s.replace(ANSI_RE, "").length;
const pad = (s: string, w: number): string =>
  s + " ".repeat(Math.max(0, w - visLen(s)));
const trunc = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;

// ─── Time helpers ─────────────────────────────────────────────────────────────

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return h % 24 > 0 ? `${d}d ${h % 24}h` : `${d}d`;
  if (h > 0) return m % 60 > 0 ? `${h}h ${m % 60}m` : `${h}h`;
  return `${m}m`;
}

// ─── Status ───────────────────────────────────────────────────────────────────

interface AccountStatus {
  kind: "available" | "waiting" | "error";
  waitMs: number;
  displayWindow: RateWindow | null;
}

function getStatus(account: UnifiedAccount): AccountStatus {
  if (account.error) {
    return { kind: "error", waitMs: Infinity, displayWindow: null };
  }
  const { session, weekly } = account;
  const blocked = ([weekly, session] as Array<RateWindow | null>).filter(
    (w): w is RateWindow => !!w && w.usedPercent >= 100,
  );
  if (blocked.length > 0) {
    const waitMs = Math.min(
      ...blocked.map((w) =>
        Math.max(0, new Date(w.resetsAt).getTime() - Date.now()),
      ),
    );
    const displayWindow = blocked.reduce((a, b) =>
      new Date(a.resetsAt).getTime() < new Date(b.resetsAt).getTime() ? a : b,
    );
    return {
      kind: waitMs > 0 ? "waiting" : "available",
      waitMs,
      displayWindow,
    };
  }
  return {
    kind: "available",
    waitMs: 0,
    displayWindow: pickAvailableWindow(session, weekly),
  };
}

function pickAvailableWindow(
  session: RateWindow | null,
  weekly: RateWindow | null,
): RateWindow | null {
  const candidates = [session, weekly].filter(
    (window): window is RateWindow => window !== null,
  );
  return (
    candidates
      .filter((window) => window.resetsAt)
      .sort((left, right) =>
        new Date(left.resetsAt).getTime() - new Date(right.resetsAt).getTime(),
      )[0] ?? null
  );
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const INDENT = "   ";
const COL_LABEL = 20;
const COL_CELL = 15;
const LINE_W = COL_LABEL + 2 + (COL_CELL + 2) * 3 - 2; // 54

const PROVIDER_NAME: Record<Provider, string> = {
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
};

// ─── Grid cell ────────────────────────────────────────────────────────────────

function gridCell(account: UnifiedAccount | null): string {
  if (!account) return pad(chalk.dim("─"), COL_CELL);

  const status = getStatus(account);
  if (status.kind === "error") return pad(chalk.red("✗"), COL_CELL);

  if (status.kind === "available") {
    const window = status.displayWindow;
    const sessionAvailablePercent = account.session
      ? Math.max(0, 100 - account.session.usedPercent)
      : null;
    const availableLabel =
      sessionAvailablePercent === null ? "ok" : `${sessionAvailablePercent}%`;

    if (window?.resetsAt) {
      const wait = timeUntil(window.resetsAt);
      return pad(
        chalk.green("●") + chalk.dim(`  ${availableLabel} ${wait}`),
        COL_CELL,
      );
    }

    return pad(chalk.green("●") + chalk.dim(`  ${availableLabel}`), COL_CELL);
  }

  const wait = timeUntil(
    new Date(Date.now() + status.waitMs).toISOString(),
  );
  return pad(chalk.yellow("▲") + chalk.dim(`  ${wait}`), COL_CELL);
}

// ─── Grid row ─────────────────────────────────────────────────────────────────

export interface GridRow {
  label: string;
  claude: UnifiedAccount | null;
  codex: UnifiedAccount | null;
  cursor: UnifiedAccount | null;
  minWaitMs: number;
}

export function buildGrid(groups: ProviderGroups): GridRow[] {
  const map = new Map<string, GridRow>();
  const get = (label: string): GridRow => {
    if (!map.has(label)) {
      map.set(label, {
        label,
        claude: null,
        codex: null,
        cursor: null,
        minWaitMs: Infinity,
      });
    }
    return map.get(label)!;
  };

  for (const a of groups.claude ?? []) get(a.label).claude = a;
  for (const a of groups.codex ?? []) get(a.label).codex = a;
  for (const a of groups.cursor ?? []) get(a.label).cursor = a;

  for (const row of map.values()) {
    const present = [row.claude, row.codex, row.cursor].filter(
      (a): a is UnifiedAccount => a !== null,
    );
    row.minWaitMs = Math.min(...present.map((a) => getStatus(a).waitMs));
  }

  return [...map.values()].sort((a, b) => {
    if (a.minWaitMs !== b.minWaitMs) return a.minWaitMs - b.minWaitMs;
    return a.label.localeCompare(b.label);
  });
}

function renderRow(row: GridRow, selected = false): string {
  const indent = selected ? ` ${chalk.cyan("›")} ` : INDENT;
  const label = pad(chalk.white(trunc(row.label, COL_LABEL)), COL_LABEL);
  const cells = [gridCell(row.claude), gridCell(row.codex), gridCell(row.cursor)];
  return `${indent}${label}  ${cells.join("  ")}`;
}

// ─── Header / footer ──────────────────────────────────────────────────────────

function gridHeader(): string {
  const labelBlank = " ".repeat(COL_LABEL);
  const cols = (["claude", "codex", "cursor"] as Provider[])
    .map((p) => pad(chalk.dim(PROVIDER_NAME[p]), COL_CELL))
    .join("  ");
  return `${INDENT}${labelBlank}  ${cols}`;
}

function bestAccount(
  groups: ProviderGroups,
): { account: UnifiedAccount; status: AccountStatus } | null {
  const all = (Object.values(groups).flat().filter(Boolean) as UnifiedAccount[]).filter(
    (a) => !a.error,
  );
  return (
    all
      .map((a) => ({ account: a, status: getStatus(a) }))
      .sort((x, y) => {
        const rank = { available: 0, waiting: 1, error: 2 };
        const diff = rank[x.status.kind] - rank[y.status.kind];
        return diff !== 0 ? diff : x.status.waitMs - y.status.waitMs;
      })[0] ?? null
  );
}

function recommendationLine(groups: ProviderGroups): string {
  const best = bestAccount(groups);
  if (!best) return `${INDENT}${chalk.dim("No accounts available.")}`;
  const { account, status } = best;
  const arrow =
    status.kind === "available" ? chalk.green("→") : chalk.yellow("→");
  const label = chalk.white(account.label);
  const meta = chalk.dim(
    `${PROVIDER_NAME[account.provider]} · ${account.plan}`,
  );
  const timing =
    status.kind === "available" && status.displayWindow
      ? chalk.dim(`↻ ${timeUntil(status.displayWindow.resetsAt)}`)
      : status.kind === "waiting"
        ? chalk.yellow(
            `wait ${timeUntil(new Date(Date.now() + status.waitMs).toISOString())}`,
          )
        : "";
  return `${INDENT}${arrow}  ${label}  ${meta}${timing ? `  ${timing}` : ""}`;
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export type ProviderGroups = Partial<Record<Provider, UnifiedAccount[]>>;

export function formatInteractiveDashboard(
  groups: ProviderGroups,
  rows: GridRow[],
  selectedIndex: number,
  statusMessage?: string | null,
): string {
  const all = Object.values(groups)
    .flat()
    .filter(Boolean) as UnifiedAccount[];
  const totalAvailable = all.filter(
    (a) => getStatus(a).kind === "available",
  ).length;

  const lines: string[] = [""];
  lines.push(
    `${INDENT}${chalk.bold("gauge")}  ${chalk.dim(`·  ${all.length} account${all.length === 1 ? "" : "s"}  ·  ${totalAvailable} available`)}`,
  );
  lines.push("");
  lines.push(gridHeader());
  lines.push("");
  for (const [i, row] of rows.entries()) {
    lines.push(renderRow(row, i === selectedIndex));
  }
  lines.push("");
  lines.push(`${INDENT}${chalk.dim("─".repeat(LINE_W))}`);

  if (statusMessage) {
    lines.push(`${INDENT}${chalk.dim(statusMessage)}`);
    lines.push("");
  } else {
    lines.push(recommendationLine(groups));
    const canRefresh = rows[selectedIndex]?.claude?.error != null;
    const hintParts = [chalk.dim("↑↓  j/k  navigate")];
    if (canRefresh) hintParts.push(chalk.dim("r  re-auth"));
    hintParts.push(chalk.dim("q  quit"));
    lines.push(`${INDENT}${hintParts.join(chalk.dim("   ·   "))}`);
  }
  lines.push("");

  return lines.join("\n");
}

export function formatDashboard(groups: ProviderGroups): string {
  const all = Object.values(groups).flat().filter(Boolean) as UnifiedAccount[];
  const totalAvailable = all.filter(
    (a) => getStatus(a).kind === "available",
  ).length;
  const rows = buildGrid(groups);

  const lines: string[] = [""];
  lines.push(
    `${INDENT}${chalk.bold("gauge")}  ${chalk.dim(`·  ${all.length} account${all.length === 1 ? "" : "s"}  ·  ${totalAvailable} available`)}`,
  );
  lines.push("");
  lines.push(gridHeader());
  lines.push("");
  for (const row of rows) lines.push(renderRow(row));
  lines.push("");
  lines.push(`${INDENT}${chalk.dim("─".repeat(LINE_W))}`);
  lines.push(recommendationLine(groups));
  lines.push("");

  return lines.join("\n");
}

export function displayDashboard(groups: ProviderGroups): void {
  process.stdout.write(formatDashboard(groups));
}

// ─── Legacy AccountUsage entrypoints ─────────────────────────────────────────

export function formatUsageTable(accounts: AccountUsage[]): string {
  return formatDashboard({ claude: accounts.map(claudeToUnified) });
}

export function formatQuickRecommendation(accounts: AccountUsage[]): string {
  return `${recommendationLine({ claude: accounts.map(claudeToUnified) })}\n`;
}

export function displayUsageTable(accounts: AccountUsage[]): void {
  process.stdout.write(formatUsageTable(accounts));
}

export function displayQuickRecommendation(accounts: AccountUsage[]): void {
  process.stdout.write(formatQuickRecommendation(accounts));
}

// ─── Claude AccountUsage → UnifiedAccount ────────────────────────────────────

export function claudeToUnified(account: AccountUsage): UnifiedAccount {
  const planLabel: Record<Plan, string> = {
    pro: "Pro",
    max: "Max",
    max_5x: "Max 5x",
    max_20x: "Max 20x",
    unknown: "",
  };
  return {
    provider: "claude",
    label: account.name,
    email: account.name,
    plan: planLabel[account.plan] ?? "",
    session: account.usage.five_hour
      ? {
          usedPercent: account.usage.five_hour.utilization,
          resetsAt: account.usage.five_hour.resets_at,
        }
      : null,
    weekly: account.usage.seven_day
      ? {
          usedPercent: account.usage.seven_day.utilization,
          resetsAt: account.usage.seven_day.resets_at,
        }
      : null,
    error: account.error,
  };
}
