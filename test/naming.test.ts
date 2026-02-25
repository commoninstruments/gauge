import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

test("package.json uses scoped claudeusage name and bin", () => {
  const pkg = readJson(path.join(root, "package.json"));
  assert.equal(pkg.name, "@howells/claudeusage");
  assert.ok(pkg.bin?.claudeusage);
});

test("CLI help text references claudeusage", () => {
  const cliPath = path.join(root, "src", "cli.ts");
  const cliSource = fs.readFileSync(cliPath, "utf-8");
  assert.match(cliSource, /\.name\("claudeusage"\)/);
  assert.match(cliSource, /claudeusage add/);
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

test("engines.node includes 18", () => {
  const pkg = readJson(path.join(root, "package.json"));
  assert.ok(pkg.engines?.node);
  assert.match(pkg.engines.node, /18/);
});

test("dependencies has playwright-core, not playwright", () => {
  const pkg = readJson(path.join(root, "package.json"));
  assert.ok(pkg.dependencies["playwright-core"]);
  assert.equal(pkg.dependencies.playwright, undefined);
});
