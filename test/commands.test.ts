import assert from "node:assert/strict";
import { test } from "node:test";
import { __test, runAddCommand } from "../src/commands.js";
import type { AccountUsage, UsageResponse } from "../src/types.js";

function buildUsage(
  fiveHour: Partial<UsageResponse["five_hour"]> | null,
  sevenDay: Partial<UsageResponse["seven_day"]> | null,
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

test("pickRecommendation returns an account window for available session usage", () => {
  const inNinetyMinutes = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  const accounts: AccountUsage[] = [
    {
      name: "personal",
      plan: "pro",
      orgUuid: "org-1",
      usage: buildUsage(
        { utilization: 20, resets_at: inNinetyMinutes },
        { utilization: 10, resets_at: inNinetyMinutes },
      ),
    },
  ];

  const recommendation = __test.pickRecommendation(accounts);
  assert.equal(recommendation.account?.name, "personal");
  assert.equal(recommendation.account_window?.basis, "available_session");
  assert.match(recommendation.account_window?.label ?? "", /1h (29|30)m/);
});

test("pickRecommendation returns weekly window when session has not started", () => {
  const inTwoDays = new Date(
    Date.now() + 2 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const accounts: AccountUsage[] = [
    {
      name: "siteinspire",
      plan: "max_20x",
      orgUuid: "org-2",
      usage: buildUsage(
        { utilization: 0, resets_at: null },
        { utilization: 14, resets_at: inTwoDays },
      ),
    },
  ];

  const recommendation = __test.pickRecommendation(accounts);
  assert.equal(recommendation.account?.name, "siteinspire");
  assert.equal(recommendation.account_window?.basis, "available_weekly");
  assert.match(recommendation.account_window?.label ?? "", /2d/);
});

test("runAddCommand dry-runs provider-scoped Cursor accounts", async () => {
  const result = await runAddCommand("work", {
    dryRun: true,
    provider: "cursor",
    storageStateFile: "./cursor-state.json",
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.data.provider, "cursor");
  assert.equal(result.data.auth_mode, "headless-storage-state");
  assert.match(JSON.stringify(result.data.writes), /cursor-work/);
});

test("runAddCommand dry-runs provider-scoped Codex accounts", async () => {
  const result = await runAddCommand("work", {
    codexHome: "/tmp/codex-work",
    dryRun: true,
    provider: "codex",
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.data.provider, "codex");
  assert.equal(result.data.auth_mode, "codex-home");
  assert.match(JSON.stringify(result.data.writes), /codex-work/);
});

test("runAddCommand rejects unsupported providers", async () => {
  await assert.rejects(
    () =>
      runAddCommand("work", {
        dryRun: true,
        provider: "unknown",
      }),
    /Unsupported provider/,
  );
});
