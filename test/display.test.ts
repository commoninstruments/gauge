import { test } from "node:test";
import assert from "node:assert/strict";
import type { AccountUsage, UsageResponse } from "../src/types.js";
import { displayQuickRecommendation, displayUsageTable } from "../src/display.js";

function captureOutput(fn: () => void): string {
  const original = console.log;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return logs.join("\n");
}

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, "");
}

function buildUsage(
  fiveHour: Partial<UsageResponse["five_hour"]>,
  sevenDay: Partial<UsageResponse["seven_day"]>
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

test("displayUsageTable shows usage columns and next use", () => {
  const now = new Date();
  const inThirtyMinutes = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();

  const accounts: AccountUsage[] = [
    {
      name: "ready",
      plan: "max",
      orgUuid: "org-1",
      usage: buildUsage({ utilization: 40, resets_at: inThirtyMinutes }, { utilization: 70, resets_at: inTwoDays }),
    },
    {
      name: "session-blocked",
      plan: "pro",
      orgUuid: "org-2",
      usage: buildUsage({ utilization: 100, resets_at: inThirtyMinutes }, { utilization: 20, resets_at: inTwoDays }),
    },
    {
      name: "weekly-blocked",
      plan: "pro",
      orgUuid: "org-3",
      usage: buildUsage({ utilization: 20, resets_at: inThirtyMinutes }, { utilization: 100, resets_at: inTwoDays }),
    },
  ];

  const output = stripAnsi(captureOutput(() => displayUsageTable(accounts)));

  assert.match(output, /5hr Session/);
  assert.match(output, /Weekly All/);
  assert.match(output, /Weekly Sonnet/);
  assert.match(output, /Next Use/);
  assert.match(output, /Use now/);
  assert.match(output, /Wait/);
});

test("displayQuickRecommendation prefers available accounts", () => {
  const now = new Date();
  const inThirtyMinutes = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

  const accounts: AccountUsage[] = [
    {
      name: "available",
      plan: "pro",
      orgUuid: "org-1",
      usage: buildUsage({ utilization: 10, resets_at: inThirtyMinutes }, { utilization: 10, resets_at: inThirtyMinutes }),
    },
    {
      name: "blocked",
      plan: "max",
      orgUuid: "org-2",
      usage: buildUsage({ utilization: 100, resets_at: inThirtyMinutes }, { utilization: 100, resets_at: inThirtyMinutes }),
    },
  ];

  const output = stripAnsi(captureOutput(() => displayQuickRecommendation(accounts)));

  assert.match(output, /available/);
  assert.match(output, /Use now/);
});
