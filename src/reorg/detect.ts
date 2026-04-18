
/**
 * src/reorg/detect.js — Chain reorganization detection
 *
 * Compares the stored rollback guard with the new one returned
 * by HyperSync. If the parent hash for an overlapping block
 * doesn't match, a reorg has occurred.
 */

function pick(obj, camelKey, snakeKey) {
  if (!obj) return undefined;
  return obj[camelKey] ?? obj[snakeKey];
}

/**
 * Detect whether a chain reorg has occurred.
 *
 * @param {import('../db/registry.ts').RegistryService} registry
 * @param {object} newGuard  Rollback guard from the latest HyperSync response
 * @returns {number|false}   The block number where the reorg occurred, or false
 */
export function detectReorg(registry, newGuard) {
  if (!newGuard) return false;

  const stored = registry.getRollbackGuard();
  if (!stored) return false;

  const storedHash = stored.block_hash;
  const storedBlock = Number(stored.block_number);
  const newFirstParent = pick(newGuard, "firstParentHash", "first_parent_hash");
  const newFirstBlockRaw = pick(newGuard, "firstBlockNumber", "first_block_number");
  const newFirstBlock = Number(newFirstBlockRaw);

  if (!Number.isFinite(newFirstBlock)) {
    return false;
  }

  if (newFirstBlock <= storedBlock && newFirstParent && storedHash) {
    if (newFirstBlock === storedBlock && newFirstParent !== storedHash) {
      return storedBlock;
    }
  }

  return false;
}
