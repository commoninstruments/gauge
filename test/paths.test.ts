import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  getAccountPath,
  getDataDir,
  getProfileDir,
  getStorageStatePath,
} from "../src/paths.js";

const expectedDir = path.join(os.homedir(), ".claudestatus");
const RE_DIRNAME = /__dirname/;
const RE_DIST = /\/dist\//;
const RE_NODE_MODULES = /node_modules/;

test("getDataDir returns ~/.claudestatus", () => {
  assert.equal(getDataDir(), expectedDir);
});

test("getAccountPath returns file inside data dir", () => {
  const result = getAccountPath("test");
  assert.ok(result.startsWith(expectedDir));
  assert.ok(result.endsWith("test.json"));
});

test("getStorageStatePath returns file inside data dir", () => {
  const result = getStorageStatePath("test");
  assert.ok(result.startsWith(expectedDir));
  assert.ok(result.endsWith("test-storage.json"));
});

test("getProfileDir returns dir inside data dir", () => {
  const result = getProfileDir("test");
  assert.ok(result.startsWith(expectedDir));
  assert.ok(result.includes("profile-test"));
});

test("no paths contain __dirname, dist, or node_modules", () => {
  const paths = [
    getDataDir(),
    getAccountPath("x"),
    getStorageStatePath("x"),
    getProfileDir("x"),
  ];
  for (const p of paths) {
    assert.doesNotMatch(p, RE_DIRNAME);
    assert.doesNotMatch(p, RE_DIST);
    assert.doesNotMatch(p, RE_NODE_MODULES);
  }
});
