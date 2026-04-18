import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyFieldMask,
  paginateItems,
  renderCommandResult,
  resolveOutputFormat,
} from "../src/output.js";

test("resolveOutputFormat defaults to json for non-tty", () => {
  assert.equal(resolveOutputFormat(undefined, false), "json");
  assert.equal(resolveOutputFormat(undefined, true), "human");
});

test("applyFieldMask keeps only requested nested fields", () => {
  const masked = applyFieldMask(
    {
      accounts: [
        {
          name: "personal",
          plan: "pro",
          usage: { five_hour: { utilization: 20 } },
        },
      ],
      recommendation: { account: { name: "personal" }, status: "use_now" },
    },
    "accounts.name,recommendation.account.name",
  );

  assert.deepEqual(masked, {
    accounts: [{ name: "personal" }],
    recommendation: { account: { name: "personal" } },
  });
});

test("paginateItems returns all pages for page-all reads", () => {
  const pages = paginateItems(
    [{ name: "a" }, { name: "b" }, { name: "c" }],
    { pageAll: true, pageSize: 2 },
    "accounts",
  );

  assert.equal(pages.length, 2);
  assert.equal(pages[0]?.page_info.index, 1);
  assert.equal(pages[1]?.page_info.index, 2);
});

test("renderCommandResult emits ndjson pages", () => {
  const rendered = renderCommandResult(
    {
      command: "list",
      data: { accounts: [] },
      human: "",
      paginated: {
        itemName: "accounts",
        items: [{ name: "a" }, { name: "b" }],
      },
    },
    { format: "ndjson", pageAll: true, pageSize: 1 },
    { cwd: process.cwd(), isTTY: false },
  );

  const lines = rendered.content.trim().split("\n");
  assert.equal(lines.length, 2);
  const first = JSON.parse(lines[0] ?? "{}");
  assert.equal(first.ok, true);
  assert.equal(first.data.accounts[0]?.name, "a");
});
