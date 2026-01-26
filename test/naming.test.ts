import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

test("package.json uses scoped claudestatus name and bin", () => {
  const pkg = readJson(path.join(root, "package.json"));
  assert.equal(pkg.name, "@howells/claudestatus");
  assert.ok(pkg.bin && pkg.bin.claudestatus);
});

test("CLI help text references claudestatus", () => {
  const cliPath = path.join(root, "src", "cli.ts");
  const cliSource = fs.readFileSync(cliPath, "utf-8");
  assert.match(cliSource, /\.name\("claudestatus"\)/);
  assert.match(cliSource, /claudestatus add/);
});

test("package ships dist and builds before publish", () => {
  const pkg = readJson(path.join(root, "package.json"));
  assert.ok(Array.isArray(pkg.files));
  assert.ok(pkg.files.includes("dist"));
  assert.ok(pkg.files.includes("README.md"));
  assert.ok(pkg.files.includes("LICENSE"));
  assert.ok(pkg.files.includes("package.json"));
  assert.equal(pkg.scripts?.prepublishOnly, "npm run build");
});

test("src CLI begins with shebang", () => {
  const cliSource = fs.readFileSync(path.join(root, "src", "cli.ts"), "utf-8");
  const firstLine = cliSource.split("\n")[0];
  assert.equal(firstLine, "#!/usr/bin/env node");
});
