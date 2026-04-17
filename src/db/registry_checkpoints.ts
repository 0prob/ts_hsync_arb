// @ts-nocheck
/**
 * src/db/registry_checkpoints.js — Checkpoint, rollback-guard, and reorg helpers
 */

const STMT_CACHE_KEY = Symbol.for("registry_checkpoints_stmt_cache");

function checkpointStmt(db, key, sql) {
  let cache = db[STMT_CACHE_KEY];
  if (!cache) {
    cache = new Map();
    Object.defineProperty(db, STMT_CACHE_KEY, { value: cache });
  }
  if (!cache.has(key)) {
    cache.set(key, db.prepare(sql));
  }
  return cache.get(key);
}

export function getCheckpoint(db, protocol) {
  return (
    checkpointStmt(
      db,
      "getCheckpoint",
      `SELECT last_block, last_block_hash FROM checkpoints WHERE protocol = ?`
    )
      .get(protocol) || null
  );
}

export function setCheckpoint(db, protocol, block, blockHash = null) {
  checkpointStmt(
    db,
    "setCheckpoint",
      `INSERT INTO checkpoints (protocol, last_block, last_block_hash, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(protocol) DO UPDATE SET
         last_block      = excluded.last_block,
         last_block_hash = excluded.last_block_hash,
         updated_at      = excluded.updated_at`
  )
    .run(protocol, block, blockHash);
}

export function getGlobalCheckpoint(db) {
  const row = checkpointStmt(
    db,
    "getGlobalCheckpoint",
    `SELECT MIN(last_block) as min_block FROM checkpoints`
  ).get();
  return row?.min_block ?? null;
}

export function setRollbackGuard(db, guard) {
  checkpointStmt(
    db,
    "setRollbackGuard",
      `INSERT INTO rollback_guard (id, block_number, block_hash, timestamp, first_block_number, first_parent_hash)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         block_number       = excluded.block_number,
         block_hash         = excluded.block_hash,
         timestamp          = excluded.timestamp,
         first_block_number = excluded.first_block_number,
         first_parent_hash  = excluded.first_parent_hash`
  )
    .run(
      guard.blockNumber ?? guard.block_number,
      guard.hash ?? guard.block_hash,
      guard.timestamp ?? null,
      guard.firstBlockNumber ?? guard.first_block_number ?? null,
      guard.firstParentHash ?? guard.first_parent_hash ?? null
    );
}

export function getRollbackGuard(db) {
  return checkpointStmt(db, "getRollbackGuard", `SELECT * FROM rollback_guard WHERE id = 1`).get() || null;
}

export function rollbackToBlock(db, block) {
  const deleteState = checkpointStmt(
    db,
    "rollbackDeleteState",
    `DELETE FROM pool_state WHERE last_updated_block >= ?`
  );
  const deletePools = checkpointStmt(
    db,
    "rollbackDeletePools",
    `DELETE FROM pools WHERE created_block >= ?`
  );
  const resetCheckpoints = checkpointStmt(
    db,
    "rollbackResetCheckpoints",
    `UPDATE checkpoints SET last_block = ? WHERE last_block > ?`
  );

  return db.transaction(() => {
    const stateResult = deleteState.run(block);
    const poolResult = deletePools.run(block);
    resetCheckpoints.run(block - 1, block - 1);
    return {
      poolsRemoved: poolResult.changes,
      statesRemoved: stateResult.changes,
    };
  })();
}
