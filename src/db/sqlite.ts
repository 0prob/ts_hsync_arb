// @ts-nocheck
/**
 * src/db/sqlite.js — small compatibility layer over node:sqlite
 *
 * The existing registry helpers expect a better-sqlite3-like API with:
 *   - db.prepare(sql).run/get/all(...)
 *   - db.exec(sql)
 *   - db.pragma("key = value")
 *   - db.transaction(fn)
 *
 * This adapter keeps that surface stable while using Node's built-in SQLite.
 */

import { DatabaseSync } from "node:sqlite";

class CompatStatement {
  constructor(statement) {
    this.statement = statement;
  }

  run(...params) {
    return this.statement.run(...params);
  }

  get(...params) {
    return this.statement.get(...params);
  }

  all(...params) {
    return this.statement.all(...params);
  }

  iterate(...params) {
    return this.statement.iterate(...params);
  }
}

export class CompatDatabase {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this._statementCache = new Map();
    this._savepointId = 0;
  }

  prepare(sql) {
    // Cache by SQL text to preserve existing statement reuse behavior.
    if (!this._statementCache.has(sql)) {
      this._statementCache.set(sql, new CompatStatement(this.db.prepare(sql)));
    }
    return this._statementCache.get(sql);
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  pragma(sql) {
    return this.db.exec(`PRAGMA ${sql}`);
  }

  transaction(fn) {
    return (...args) => {
      const nested = this.db.isTransaction;
      const savepoint = `sp_${++this._savepointId}`;

      if (nested) {
        this.db.exec(`SAVEPOINT ${savepoint}`);
      } else {
        this.db.exec("BEGIN IMMEDIATE");
      }

      try {
        const result = fn(...args);
        if (nested) {
          this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
        } else {
          this.db.exec("COMMIT");
        }
        return result;
      } catch (error) {
        if (nested) {
          this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
        } else {
          this.db.exec("ROLLBACK");
        }
        throw error;
      }
    };
  }

  close() {
    this._statementCache.clear();
    this.db.close();
  }
}
