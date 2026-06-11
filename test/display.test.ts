import assert from "node:assert/strict";
import { test } from "node:test";
import {
  displayQuickRecommendation,
  displayUsageTable,
  formatDashboard,
} from "../src/display.js";
import type {
  AccountUsage,
  UnifiedAccount,
  UsageResponse,
} from "../src/types.js";

function captureOutput(fn: () => void): string {
  const original = process.stdout.write;
  let output = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return output;
}

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, "");
}

function buildUsage(
  fiveHour: Partial<UsageResponse["five_hour"]>,
  sevenDay: Partial<UsageResponse["seven_day"]>,
): UsageResponse {
  return {
    five_hour: fiveHour as UsageResponse["five_hour"],
    seven_day: sevenDay as UsageResponse["seven_day"],
    seven_day_oauth_apps: null,
    seven_day_opus: null,
    seven_day_sonnet: null,
    seven_day_cowork: null,
    iguana_necktie: null,
    extra_usage: null,
  };
}

test("displayUsageTable shows dashboard with usage and status", () => {
  const now = new Date();
  const inThirtyMinutes = new Date(
    now.getTime() + 30 * 60 * 1000,
  ).toISOString();
  const inTwoDays = new Date(
    now.getTime() + 2 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const accounts: AccountUsage[] = [
    {
      name: "ready",
      plan: "max",
      orgUuid: "org-1",
      usage: buildUsage(
        { utilization: 40, resets_at: inThirtyMinutes },
        { utilization: 70, resets_at: inTwoDays },
      ),
    },
    {
      name: "session-blocked",
      plan: "pro",
      orgUuid: "org-2",
      usage: buildUsage(
        { utilization: 100, resets_at: inThirtyMinutes },
        { utilization: 20, resets_at: inTwoDays },
      ),
    },
    {
      name: "weekly-blocked",
      plan: "pro",
      orgUuid: "org-3",
      usage: buildUsage(
        { utilization: 20, resets_at: inThirtyMinutes },
        { utilization: 100, resets_at: inTwoDays },
      ),
    },
  ];

  const output = stripAnsi(captureOutput(() => displayUsageTable(accounts)));

  assert.match(output, /3 accounts/);
  assert.match(output, /1 available/);
  assert.match(output, /ready/);
  assert.match(output, /session-blocked/);
  assert.match(output, /weekly-blocked/);
  assert.match(output, /used 40%/);
  assert.match(output, /resets/);
  assert.match(output, /blocked/);
  assert.match(output, /wait/);
  assert.match(output, /29m/);
  assert.match(output, /1d 23h/);
  assert.match(output, /Max/);
  assert.match(output, /ready/);
});

test("displayUsageTable sorts available accounts first", () => {
  const now = new Date();
  const inThirtyMinutes = new Date(
    now.getTime() + 30 * 60 * 1000,
  ).toISOString();
  const inTwoDays = new Date(
    now.getTime() + 2 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const accounts: AccountUsage[] = [
    {
      name: "blocked-first",
      plan: "pro",
      orgUuid: "org-1",
      usage: buildUsage(
        { utilization: 100, resets_at: inThirtyMinutes },
        { utilization: 100, resets_at: inTwoDays },
      ),
    },
    {
      name: "available-second",
      plan: "pro",
      orgUuid: "org-2",
      usage: buildUsage(
        { utilization: 10, resets_at: inThirtyMinutes },
        { utilization: 10, resets_at: inTwoDays },
      ),
    },
  ];

  const output = stripAnsi(captureOutput(() => displayUsageTable(accounts)));

  // Available account should appear before blocked one in output
  const availPos = output.indexOf("available-second");
  const blockedPos = output.indexOf("blocked-first");
  assert.ok(
    availPos < blockedPos,
    "Available account should appear before blocked account",
  );
});

test("displayUsageTable shows error accounts with error message", () => {
  const accounts: AccountUsage[] = [
    {
      name: "broken",
      plan: "pro",
      orgUuid: "org-1",
      usage: buildUsage(null, null),
      error: "Session expired",
    },
  ];

  const output = stripAnsi(captureOutput(() => displayUsageTable(accounts)));

  assert.match(output, /broken/);
  assert.match(output, /error/);
  assert.match(output, /No accounts available/);
});

test("displayUsageTable shows blended session availability and earliest reset", () => {
  const now = new Date();
  const future = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  const accounts: AccountUsage[] = [
    {
      name: "full-metrics",
      plan: "max",
      orgUuid: "org-1",
      usage: {
        five_hour: { utilization: 30, resets_at: future },
        seven_day: { utilization: 50, resets_at: future },
        seven_day_sonnet: { utilization: 60, resets_at: future },
        seven_day_opus: { utilization: 20, resets_at: future },
        seven_day_cowork: null,
        seven_day_oauth_apps: null,
        iguana_necktie: null,
        extra_usage: null,
      },
    },
  ];

  const output = stripAnsi(captureOutput(() => displayUsageTable(accounts)));

  assert.match(output, /full-metrics/);
  assert.match(output, /used 30%/);
  assert.match(output, /resets/);
  assert.match(output, /59m|1h/);
});

test("displayQuickRecommendation prefers available accounts", () => {
  const now = new Date();
  const inThirtyMinutes = new Date(
    now.getTime() + 30 * 60 * 1000,
  ).toISOString();

  const accounts: AccountUsage[] = [
    {
      name: "available",
      plan: "pro",
      orgUuid: "org-1",
      usage: buildUsage(
        { utilization: 10, resets_at: inThirtyMinutes },
        { utilization: 10, resets_at: inThirtyMinutes },
      ),
    },
    {
      name: "blocked",
      plan: "max",
      orgUuid: "org-2",
      usage: buildUsage(
        { utilization: 100, resets_at: inThirtyMinutes },
        { utilization: 100, resets_at: inThirtyMinutes },
      ),
    },
  ];

  const output = stripAnsi(
    captureOutput(() => displayQuickRecommendation(accounts)),
  );

  assert.match(output, /available/);
  assert.match(output, /available/);
  assert.match(output, /Pro/);
});

test("displayUsageTable shows selected specific Max tier in recommendation", () => {
  const now = new Date();
  const future = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  const accounts: AccountUsage[] = [
    {
      name: "max-twenty",
      plan: "max_20x",
      orgUuid: "org-1",
      usage: buildUsage(
        { utilization: 10, resets_at: future },
        { utilization: 20, resets_at: future },
      ),
    },
    {
      name: "max-five",
      plan: "max_5x",
      orgUuid: "org-2",
      usage: buildUsage(
        { utilization: 30, resets_at: future },
        { utilization: 40, resets_at: future },
      ),
    },
  ];

  const output = stripAnsi(captureOutput(() => displayUsageTable(accounts)));

  assert.match(output, /Max 20x/);
});

test("formatDashboard shows provider plan and Cursor renewal separately", () => {
  const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const cursor: UnifiedAccount = {
    provider: "cursor",
    label: "work",
    email: "work@example.com",
    plan: "Cursor Enterprise",
    renewsAt: future,
    session: { usedPercent: 80, resetsAt: future },
    weekly: null,
  };

  const output = stripAnsi(formatDashboard({ cursor: [cursor] }));

  assert.match(output, /ready · Cursor Enterprise/);
  assert.match(output, /used 80%/);
  assert.match(output, /renews/);
  assert.doesNotMatch(output, /resets/);
});

test("formatDashboard highlights the current provider account", () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const account: UnifiedAccount = {
    provider: "codex",
    label: "work",
    email: "work@example.com",
    plan: "Pro 20x",
    current: true,
    session: { usedPercent: 10, resetsAt: future },
    weekly: null,
  };

  const output = stripAnsi(formatDashboard({ codex: [account] }));

  assert.match(output, /work/);
  assert.match(output, /ready · Pro 20x · current/);
  assert.match(output, /current = active local CLI account/);
});
