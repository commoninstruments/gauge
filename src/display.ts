import chalk from "chalk";
import Table from "cli-table3";
import type { AccountUsage, UsageLimit } from "./types.js";

function formatResetTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs < 0) return "now";

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins}m`;
  } else if (diffHours < 24) {
    const mins = diffMins % 60;
    return mins > 0 ? `${diffHours}h ${mins}m` : `${diffHours}h`;
  } else {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const hours = date.getHours();
    const ampm = hours >= 12 ? "pm" : "am";
    const hour12 = hours % 12 || 12;
    return `${days[date.getDay()]} ${hour12}${ampm}`;
  }
}

function usageBar(percent: number, width = 10): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  let color = chalk.green;
  if (percent >= 90) color = chalk.red;
  else if (percent >= 70) color = chalk.yellow;

  return color("█".repeat(filled)) + chalk.gray("░".repeat(empty));
}

function formatUsageCell(limit: UsageLimit | null): string[] {
  if (!limit) return [chalk.gray("—"), ""];

  const bar = usageBar(limit.utilization);
  const pct = limit.utilization.toString().padStart(2) + "%";
  const reset = chalk.gray("↻ " + formatResetTime(limit.resets_at));

  return [`${bar} ${pct}`, reset];
}

type Availability = {
  status: "available" | "wait" | "error";
  waitLabel: string;
  waitMs: number;
  reason: "weekly" | "session" | "none";
};

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
    const waitMs = Math.max(0, new Date(weekly.resets_at).getTime() - Date.now());
    return {
      status: waitMs <= 0 ? "available" : "wait",
      waitLabel: formatResetTime(weekly.resets_at),
      waitMs,
      reason: "weekly",
    };
  }

  if (session && session.utilization >= 100) {
    const waitMs = Math.max(0, new Date(session.resets_at).getTime() - Date.now());
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

function pickNextAccount(accounts: AccountUsage[]): {
  account: AccountUsage;
  availability: Availability;
} | null {
  const available = accounts.filter((a) => !a.error);
  if (available.length === 0) return null;

  const scored = available.map((account) => ({
    account,
    availability: getAvailability(account),
    score:
      (account.usage.five_hour?.utilization ?? 0) +
      (account.usage.seven_day?.utilization ?? 0),
  }));

  const usable = scored.filter((entry) => entry.availability.status === "available");
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

export function displayUsageTable(accounts: AccountUsage[]): void {
  console.log();
  console.log(chalk.bold("  Claude Usage Dashboard"));
  console.log();

  const table = new Table({
    head: [
      chalk.bold("Account"),
      chalk.bold("Plan"),
      chalk.bold("Next Use"),
    ],
    style: {
      head: [],
      border: [],
    },
    colWidths: [14, 6, 26],
  });

  for (const account of accounts) {
    const availability = getAvailability(account);
    const nextUseLabel = formatNextUseLabel(availability);

    if (account.error) {
      table.push([
        chalk.yellow(account.name),
        chalk.gray("?"),
        chalk.red(nextUseLabel),
      ]);
      continue;
    }

    const planBadge =
      account.plan === "max" ? chalk.magenta("Max") : chalk.cyan("Pro");

    const nextUseCell =
      availability.status === "available"
        ? chalk.green(nextUseLabel)
        : chalk.yellow(nextUseLabel);

    table.push([account.name, planBadge, nextUseCell]);
  }

  console.log(table.toString());
  console.log();

  // Recommendation
  const next = pickNextAccount(accounts);
  if (next) {
    const nextUseLabel = formatNextUseLabel(next.availability);
    console.log(
      chalk.cyan("  💡 Recommendation: ") +
        chalk.bold(next.account.name) +
        chalk.gray(` (${nextUseLabel})`)
    );
    console.log();
  }
}

export function displayQuickRecommendation(accounts: AccountUsage[]): void {
  const next = pickNextAccount(accounts);
  if (!next) {
    console.log(chalk.red("No accounts available. Run: claudestatus add <name>"));
    return;
  }

  const nextUseLabel = formatNextUseLabel(next.availability);
  console.log(`${next.account.name} (${nextUseLabel})`);
}
