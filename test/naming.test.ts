import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

test("package.json uses claudestatus name and bin", () => {
  const pkg = readJson(path.join(root, "package.json"));
  assert.equal(pkg.name, "claudestatus");
  assert.ok(pkg.bin && pkg.bin.claudestatus);
});

test("CLI help text references claudestatus", () => {
  const cliPath = path.join(root, "src", "cli.ts");
  const cliSource = fs.readFileSync(cliPath, "utf-8");
  assert.match(cliSource, /\.name\("claudestatus"\)/);
  assert.match(cliSource, /claudestatus add/);
});
