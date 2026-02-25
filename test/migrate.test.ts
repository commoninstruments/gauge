import assert from "node:assert/strict";
import { test } from "node:test";
import { migrateIfNeeded } from "../src/migrate.js";

test("migrateIfNeeded is importable and returns boolean", () => {
  const result = migrateIfNeeded();
  assert.equal(typeof result, "boolean");
});
