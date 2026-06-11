import assert from "node:assert/strict";
import test from "node:test";
import { __test } from "../src/provider-usage.js";

function jwt(payload: Record<string, unknown>): string {
  return [
    "header",
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}

test("decodes Codex identity claims from JWT payloads", () => {
  const payload = __test.decodeJwtPayload(
    jwt({ email: "person@example.com", plan: "pro" }),
  );

  assert.equal(payload.email, "person@example.com");
  assert.equal(payload.plan, "pro");
});

test("maps Codex usage windows from API reset seconds", () => {
  const window = __test.toRateWindow({
    reset_at: 1_734_105_600,
    used_percent: 42.5,
  });

  assert.deepEqual(window, {
    resetsAt: "2024-12-13T16:00:00.000Z",
    usedPercent: 42.5,
  });
});

test("formats known Codex plan names", () => {
  assert.equal(__test.formatCodexPlan("pro"), "Pro 20x");
  assert.equal(__test.formatCodexPlan("pro_lite"), "Pro 5x");
  assert.equal(__test.formatCodexPlan("team_enterprise"), "Team Enterprise");
});

test("extracts only Cursor cookies from Playwright storage state", () => {
  const header = __test.parseStorageStateCookies({
    cookies: [
      {
        domain: ".cursor.com",
        name: "WorkosCursorSessionToken",
        value: "cursor-token",
      },
      { domain: ".example.com", name: "ignored", value: "nope" },
      {
        domain: ".cursor.sh",
        name: "authjs.session-token",
        value: "cursor-sh",
      },
    ],
  });

  assert.equal(
    header,
    "WorkosCursorSessionToken=cursor-token; authjs.session-token=cursor-sh",
  );
});

test("maps Cursor primary and secondary percentages", () => {
  const usage = {
    individualUsage: {
      plan: {
        apiPercentUsed: 20,
        autoPercentUsed: 40,
        totalPercentUsed: 60,
      },
    },
  };

  assert.equal(__test.cursorUsagePercent(usage), 60);
  assert.equal(__test.cursorSecondaryPercent(usage), 40);
});
