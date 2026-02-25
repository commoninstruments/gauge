import assert from "node:assert/strict";
import { test } from "node:test";
import {
  displayQuickRecommendation,
  displayUsageTable,
} from "../src/display.js";
import type { AccountUsage, UsageResponse } from "../src/types.js";

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

test("displayUsageTable shows card layout with metrics and status", () => {
  const now = new Date();
  const inThirtyMinutes = new Date(
    now.getTime() + 30 * 60 * 1000
  ).toISOString();
  const inTwoDays = new Date(
    now.getTime() + 2 * 24 * 60 * 60 * 1000
  ).toISOString();

  const accounts: AccountUsage[] = [
    {
      name: "ready",
      plan: "max",
      orgUuid: "org-1",
      usage: buildUsage(
        { utilization: 40, resets_at: inThirtyMinutes },
        { utilization: 70, resets_at: inTwoDays }
      ),
    },
    {
      name: "session-blocked",
      plan: "pro",
      orgUuid: "org-2",
      usage: buildUsage(
        { utilization: 100, resets_at: inThirtyMinutes },
        { utilization: 20, resets_at: inTwoDays }
      ),
    },
    {
      name: "weekly-blocked",
      plan: "pro",
      orgUuid: "org-3",
      usage: buildUsage(
        { utilization: 20, resets_at: inThirtyMinutes },
        { utilization: 100, resets_at: inTwoDays }
      ),
    },
  ];

  const output = stripAnsi(captureOutput(() => displayUsageTable(accounts)));

  // Fleet summary header
  assert.match(output, /3 accounts/);
  assert.match(output, /1 available/);
  assert.match(output, /avg load/);

  // Account names appear
  assert.match(output, /ready/);
  assert.match(output, /session-blocked/);
  assert.match(output, /weekly-blocked/);

  // Metric labels (new format)
  assert.match(output, /5hr/);
  assert.match(output, /Weekly/);

  // Status badges
  assert.match(output, /Use now/);
  assert.match(output, /Wait/);

  // Plan badges
  assert.match(output, /Max/);
  assert.match(output, /Pro/);

  // Recommendation footer
  assert.match(output, /Best:/);
  assert.match(output, /ready/);
});

test("displayUsageTable sorts available accounts first", () => {
  const now = new Date();
  const inThirtyMinutes = new Date(
    now.getTime() + 30 * 60 * 1000
  ).toISOString();
  const inTwoDays = new Date(
    now.getTime() + 2 * 24 * 60 * 60 * 1000
  ).toISOString();

  const accounts: AccountUsage[] = [
    {
      name: "blocked-first",
      plan: "pro",
      orgUuid: "org-1",
      usage: buildUsage(
        { utilization: 100, resets_at: inThirtyMinutes },
        { utilization: 100, resets_at: inTwoDays }
      ),
    },
    {
      name: "available-second",
      plan: "pro",
      orgUuid: "org-2",
      usage: buildUsage(
        { utilization: 10, resets_at: inThirtyMinutes },
        { utilization: 10, resets_at: inTwoDays }
      ),
    },
  ];

  const output = stripAnsi(captureOutput(() => displayUsageTable(accounts)));

  // Available account should appear before blocked one in output
  const availPos = output.indexOf("available-second");
  const blockedPos = output.indexOf("blocked-first");
  assert.ok(
    availPos < blockedPos,
    "Available account should appear before blocked account"
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
  assert.match(output, /Error/);
  assert.match(output, /Session expired/);
});

test("displayUsageTable shows all non-null metrics", () => {
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

  assert.match(output, /5hr/);
  assert.match(output, /Weekly/);
  assert.match(output, /Sonnet/);
  assert.match(output, /Opus/);
  // Cowork and OAuth should NOT appear (they're null)
  assert.doesNotMatch(output, /Cowork/);
  assert.doesNotMatch(output, /OAuth/);
});

test("displayQuickRecommendation prefers available accounts", () => {
  const now = new Date();
  const inThirtyMinutes = new Date(
    now.getTime() + 30 * 60 * 1000
  ).toISOString();

  const accounts: AccountUsage[] = [
    {
      name: "available",
      plan: "pro",
      orgUuid: "org-1",
      usage: buildUsage(
        { utilization: 10, resets_at: inThirtyMinutes },
        { utilization: 10, resets_at: inThirtyMinutes }
      ),
    },
    {
      name: "blocked",
      plan: "max",
      orgUuid: "org-2",
      usage: buildUsage(
        { utilization: 100, resets_at: inThirtyMinutes },
        { utilization: 100, resets_at: inThirtyMinutes }
      ),
    },
  ];

  const output = stripAnsi(
    captureOutput(() => displayQuickRecommendation(accounts))
  );

  assert.match(output, /available/);
  assert.match(output, /Use now/);
});

test("displayUsageTable shows specific Max tier badges", () => {
  const now = new Date();
  const future = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  const accounts: AccountUsage[] = [
    {
      name: "max-twenty",
      plan: "max_20x",
      orgUuid: "org-1",
      usage: buildUsage(
        { utilization: 10, resets_at: future },
        { utilization: 20, resets_at: future }
      ),
    },
    {
      name: "max-five",
      plan: "max_5x",
      orgUuid: "org-2",
      usage: buildUsage(
        { utilization: 30, resets_at: future },
        { utilization: 40, resets_at: future }
      ),
    },
  ];

  const output = stripAnsi(captureOutput(() => displayUsageTable(accounts)));

  assert.match(output, /Max 20x/);
  assert.match(output, /Max 5x/);
});
