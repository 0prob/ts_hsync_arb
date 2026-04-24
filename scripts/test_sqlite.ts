import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CompatDatabase } from "../src/db/sqlite.ts";

function makeTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-test-"));
  return {
    dir,
    dbPath: path.join(dir, "test.sqlite"),
  };
}

function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const { dir, dbPath } = makeTempDbPath();
  try {
    const db = new CompatDatabase(dbPath);
    db.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    db.statement("insertItem", "INSERT INTO items (value) VALUES (?)").run("alpha");
    assert.equal(
      db.statement("countItems", "SELECT COUNT(*) AS count FROM items").get().count,
      1,
      "named statements should execute normally when the key and SQL remain stable",
    );

    assert.throws(
      () => db.statement("countItems", "SELECT value FROM items LIMIT 1"),
      /key collision/i,
      "reusing a named statement key for different SQL should fail loudly instead of silently reusing the old query",
    );

    db.close();
  } finally {
    cleanup(dir);
  }
}

{
  const { dir, dbPath } = makeTempDbPath();
  try {
    const db = new CompatDatabase(dbPath);
    db.exec(`
      CREATE TABLE counters (
        id INTEGER PRIMARY KEY,
        value INTEGER NOT NULL
      );
      INSERT INTO counters (id, value) VALUES (1, 0);
    `);

    const outer = db.transaction(() => {
      db.prepare("UPDATE counters SET value = value + 1 WHERE id = 1").run();
      const inner = db.transaction(() => {
        db.prepare("UPDATE counters SET value = value + 10 WHERE id = 1").run();
        throw new Error("inner fail");
      });
      assert.throws(
        () => inner(),
        /inner fail/,
        "nested transactions should propagate inner failures",
      );
      db.prepare("UPDATE counters SET value = value + 100 WHERE id = 1").run();
    });

    outer();

    assert.equal(
      db.prepare("SELECT value FROM counters WHERE id = 1").get().value,
      101,
      "nested transaction failures should roll back only to the savepoint and preserve outer transaction work",
    );

    const asyncTxn = db.transaction(async () => {
      db.prepare("UPDATE counters SET value = value + 1000 WHERE id = 1").run();
    });

    assert.throws(
      () => asyncTxn(),
      /does not support async functions/,
      "transaction should reject async callbacks because the adapter only provides synchronous transaction semantics",
    );

    assert.equal(
      db.prepare("SELECT value FROM counters WHERE id = 1").get().value,
      101,
      "rejecting async transaction callbacks should also roll back their writes",
    );

    db.close();
  } finally {
    cleanup(dir);
  }
}

console.log("SQLite checks passed.");
