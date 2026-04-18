import chalk from "chalk";
import type { AccountUsage, UsageLimit } from "./types.js";

const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function formatResetTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs < 0) {
    return "now";
  }

  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 60) {
    return `${diffMins}m`;
  }
  if (diffHours < 24) {
    const mins = diffMins % 60;
    return mins > 0 ? `${diffHours}h ${mins}m` : `${diffHours}h`;
  }
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hours = date.getHours();
  const ampm = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 || 12;
  return `${days[date.getDay()]} ${hour12}${ampm}`;
}

function usageBar(percent: number, width = 35): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  let color = chalk.green;
  if (percent >= 90) {
    color = chalk.red;
  } else if (percent >= 70) {
    color = chalk.yellow;
  }

  return color("█".repeat(filled)) + chalk.gray("░".repeat(empty));
}

interface Availability {
  reason: "weekly" | "session" | "none";
  status: "available" | "wait" | "error";
  waitLabel: string;
  waitMs: number;
}

function getAvailability(account: AccountUsage): Availability {
  if (account.error) {
    return {
      status: "error",
      waitLabel: account.error,
      waitMs: Number.POSITIVE_INFINITY,
      reason: "none",
    };
  }

  const weekly = account.usage.seven_day;
  const session = account.usage.five_hour;

  if (weekly && weekly.utilization >= 100) {
    const waitMs = Math.max(
      0,
      new Date(weekly.resets_at).getTime() - Date.now(),
    );
    return {
      status: waitMs <= 0 ? "available" : "wait",
      waitLabel: formatResetTime(weekly.resets_at),
      waitMs,
      reason: "weekly",
    };
  }

  if (session && session.utilization >= 100) {
    const waitMs = Math.max(
      0,
      new Date(session.resets_at).getTime() - Date.now(),
    );
    return {
      status: waitMs <= 0 ? "available" : "wait",
      waitLabel: formatResetTime(session.resets_at),
      waitMs,
      reason: "session",
    };
  }

  return {
    status: "available",
    waitLabel: "now",
    waitMs: 0,
    reason: "none",
  };
}

function formatNextUseLabel(availability: Availability): string {
  if (availability.status === "available" || availability.waitLabel === "now") {
    return "Use now";
  }

  if (availability.reason === "weekly") {
    return `Wait until ${availability.waitLabel}`;
  }

  return `Wait ${availability.waitLabel}`;
}

const METRIC_LABELS: Record<string, string> = {
  five_hour: "5hr",
  seven_day: "Weekly",
  seven_day_sonnet: "Sonnet",
  seven_day_opus: "Opus",
  seven_day_cowork: "Cowork",
  seven_day_oauth_apps: "OAuth",
};

const METRIC_KEYS = Object.keys(METRIC_LABELS) as Array<
  keyof typeof METRIC_LABELS
>;

interface ActiveMetric {
  label: string;
  limit: UsageLimit;
}

function getActiveMetrics(usage: AccountUsage["usage"]): ActiveMetric[] {
  const metrics: ActiveMetric[] = [];
  for (const key of METRIC_KEYS) {
    const limit = usage[key as keyof typeof usage];
    const label = METRIC_LABELS[key];
    if (label && limit && typeof limit === "object" && "utilization" in limit) {
      metrics.push({ label, limit: limit as UsageLimit });
    }
  }
  return metrics;
}

function formatMetricRow(label: string, limit: UsageLimit): string {
  const bar = usageBar(limit.utilization);
  const pct = `${limit.utilization}%`.padStart(4);
  const reset = chalk.gray(`↻ ${formatResetTime(limit.resets_at)}`);
  return `    ${label.padEnd(9)}${bar}  ${pct}  ${reset}`;
}

function statusIcon(availability: Availability): string {
  switch (availability.status) {
    case "available":
      return chalk.green("●");
    case "wait":
      return chalk.yellow("▲");
    case "error":
      return chalk.red("✗");
    default:
      return "?";
  }
}

function planBadge(plan: AccountUsage["plan"]): string {
  if (plan === "max_20x") {
    return chalk.magenta("Max 20x");
  }
  if (plan === "max_5x") {
    return chalk.magenta("Max 5x");
  }
  if (plan === "max") {
    return chalk.magenta("Max");
  }
  if (plan === "pro") {
    return chalk.cyan("Pro");
  }
  return chalk.gray("?");
}

function availabilityBadge(availability: Availability): string {
  if (availability.status === "available") {
    return chalk.green("Use now");
  }
  if (availability.status === "error") {
    return chalk.red("Error");
  }
  if (availability.reason === "weekly") {
    return chalk.yellow(`Wait until ${availability.waitLabel}`);
  }
  return chalk.yellow(`Wait ${availability.waitLabel}`);
}

const CARD_WIDTH = 56;
const SEPARATOR = "╌".repeat(CARD_WIDTH);

function formatAccountCard(
  account: AccountUsage,
  availability: Availability,
): string {
  const lines: string[] = [];

  const icon = statusIcon(availability);
  const badge = planBadge(account.plan);
  const avail = availabilityBadge(availability);
  const headerRight = `${badge} · ${avail}`;

  // Build header: icon + name on left, plan + availability on right
  // We strip ANSI for length calculation to align properly
  const stripAnsi = (s: string) => s.replace(ANSI_RE, "");
  const nameStr = `  ${icon} ${chalk.bold(account.name)}`;
  const nameLen = stripAnsi(nameStr).length;
  const rightLen = stripAnsi(headerRight).length;
  const gap = Math.max(1, CARD_WIDTH + 2 - nameLen - rightLen);
  lines.push(`${nameStr}${" ".repeat(gap)}${headerRight}`);

  // Separator
  lines.push(`  ${chalk.gray(SEPARATOR)}`);

  if (account.error) {
    const errorMsg = account.error.includes("expired")
      ? `Session expired — run: claudeusage refresh ${account.name}`
      : account.error;
    lines.push(`    ${chalk.red(errorMsg)}`);
  } else {
    const metrics = getActiveMetrics(account.usage);
    for (const { label, limit } of metrics) {
      lines.push(formatMetricRow(label, limit));
    }
  }

  return lines.join("\n");
}

interface ScoredAccount {
  account: AccountUsage;
  availability: Availability;
  score: number;
}

function sortByRecommendation(accounts: AccountUsage[]): ScoredAccount[] {
  const scored: ScoredAccount[] = accounts.map((account) => {
    const availability = getAvailability(account);
    const score =
      (account.usage.five_hour?.utilization ?? 0) +
      (account.usage.seven_day?.utilization ?? 0);
    return { account, availability, score };
  });

  return scored.sort((a, b) => {
    const order = { available: 0, wait: 1, error: 2 };
    const statusDiff =
      order[a.availability.status] - order[b.availability.status];
    if (statusDiff !== 0) {
      return statusDiff;
    }

    if (a.availability.status === "wait" && b.availability.status === "wait") {
      return a.availability.waitMs - b.availability.waitMs;
    }

    return a.score - b.score;
  });
}

function pickNextAccount(accounts: AccountUsage[]): {
  account: AccountUsage;
  availability: Availability;
} | null {
  const available = accounts.filter((a) => !a.error);
  if (available.length === 0) {
    return null;
  }

  const scored = available.map((account) => ({
    account,
    availability: getAvailability(account),
    score:
      (account.usage.five_hour?.utilization ?? 0) +
      (account.usage.seven_day?.utilization ?? 0),
  }));

  const usable = scored.filter(
    (entry) => entry.availability.status === "available",
  );
  if (usable.length > 0) {
    return usable.reduce((a, b) => (a.score <= b.score ? a : b));
  }

  return scored.reduce((a, b) => {
    if (a.availability.waitMs === b.availability.waitMs) {
      return a.score <= b.score ? a : b;
    }
    return a.availability.waitMs <= b.availability.waitMs ? a : b;
  });
}

function formatRecommendationWindow(account: AccountUsage): string | null {
  if (account.error) {
    return null;
  }

  if (account.usage.five_hour?.resets_at) {
    return `for ${formatResetTime(account.usage.five_hour.resets_at)}`;
  }

  if (account.usage.seven_day?.resets_at) {
    return `weekly reset ${formatResetTime(account.usage.seven_day.resets_at)}`;
  }

  if ((account.usage.five_hour?.utilization ?? 0) === 0) {
    return "session not started";
  }

  return null;
}

/** Print the full usage dashboard to stdout. */
export function displayUsageTable(accounts: AccountUsage[]): void {
  console.log(formatUsageTable(accounts));
}

/** Format the full usage dashboard as a string with ANSI colors. */
export function formatUsageTable(accounts: AccountUsage[]): string {
  const sorted = sortByRecommendation(accounts);

  // Fleet summary
  const total = accounts.length;
  const availableCount = sorted.filter(
    (s) => s.availability.status === "available",
  ).length;
  const nonError = sorted.filter((s) => s.availability.status !== "error");
  const avgLoad =
    nonError.length > 0
      ? Math.round(
          nonError.reduce((sum, s) => sum + s.score / 2, 0) / nonError.length,
        )
      : 0;

  const lines: string[] = [];
  lines.push("");
  lines.push(chalk.bold("  Claude Usage Dashboard"));
  lines.push(
    chalk.gray(
      `  ${total} account${total === 1 ? "" : "s"} · ${availableCount} available · ${avgLoad}% avg load`,
    ),
  );

  // Account cards
  for (const { account, availability } of sorted) {
    lines.push("");
    lines.push(formatAccountCard(account, availability));
  }

  // Footer separator + recommendation
  lines.push("");
  lines.push(`  ${chalk.gray("─".repeat(CARD_WIDTH + 1))}`);

  const next = pickNextAccount(accounts);
  if (next) {
    const label = formatNextUseLabel(next.availability);
    const timeWindow = formatRecommendationWindow(next.account);
    lines.push(
      `  ${chalk.cyan("→")} Best: ${chalk.bold(next.account.name)} ${chalk.gray(
        `(${timeWindow ? `${label}, ${timeWindow}` : label})`,
      )}`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

/** Print a one-line recommendation to stdout. */
export function displayQuickRecommendation(accounts: AccountUsage[]): void {
  console.log(formatQuickRecommendation(accounts));
}

/** Format a one-line recommendation string for the best available account. */
export function formatQuickRecommendation(accounts: AccountUsage[]): string {
  const next = pickNextAccount(accounts);
  if (!next) {
    return chalk.red("No accounts available. Run: claudeusage add <name>");
  }

  const nextUseLabel = formatNextUseLabel(next.availability);
  const timeWindow = formatRecommendationWindow(next.account);
  return timeWindow
    ? `${next.account.name} (${nextUseLabel}, ${timeWindow})`
    : `${next.account.name} (${nextUseLabel})`;
}
