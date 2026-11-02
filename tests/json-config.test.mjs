import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { JsonConfig } from "../src/json-config.mjs";

function configFile(t, text) {
  const dir = mkdtempSync(path.join(tmpdir(), "elecwhat-config-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "config.json");
  if (text !== undefined) writeFileSync(file, text);
  return file;
}

test("saving a new config preserves defaults across a reload", (t) => {
  const file = configFile(t);
  const config = new JsonConfig(file, { spellcheck: false });
  assert.equal(config.get("missing", "fallback"), "fallback");
  config.set("quit-on-close", true);
  const reloaded = new JsonConfig(file);
  assert.equal(reloaded.get("spellcheck"), false);
  assert.equal(reloaded.get("quit-on-close"), true);
});

test("updating JSONC preserves comments and unrelated settings", (t) => {
  const file = configFile(t, '{\n  // Keep this comment\n  "spellcheck": false,\n  "quit-on-close": false,\n}\n');
  const config = new JsonConfig(file);
  assert.equal(config.parseError, null);
  config.set("quit-on-close", true);
  assert.match(readFileSync(file, "utf8"), /\/\/ Keep this comment/);
  const reloaded = new JsonConfig(file);
  assert.equal(reloaded.get("spellcheck"), false);
  assert.equal(reloaded.get("quit-on-close"), true);
});

for (const contents of ['{"broken":', "[]", "null", '"text"', "42", "true"]) {
  test(`invalid config ${contents} uses defaults without overwriting the file`, (t) => {
    const file = configFile(t, contents);
    const config = new JsonConfig(file, { spellcheck: false });
    assert.ok(config.parseError instanceof Error);
    assert.equal(config.get("spellcheck"), false);
    assert.doesNotThrow(() => config.set("quit-on-close", true));
    assert.equal(readFileSync(file, "utf8"), contents);
  });
}

test("an unreadable config reports an error and uses defaults", (t) => {
  const file = configFile(t);
  const config = new JsonConfig(path.dirname(file), { spellcheck: false });
  assert.ok(config.parseError instanceof Error);
  assert.equal(config.get("spellcheck"), false);
});
