// @ts-nocheck
/**
 * src/execution/nonce_manager.js — Per-account nonce manager
 *
 * Tracks and increments nonces locally to allow rapid sequential
 * transaction submission without waiting for on-chain confirmation.
 *
 * Features:
 *   - Fetches current on-chain nonce on first use
 *   - Increments locally for subsequent transactions
 *   - Resync: re-fetches from chain (e.g. after a revert)
 *   - Thread-safe: uses a pending counter for concurrent submissions
 *
 * Usage:
 *   const nm = new NonceManager(rpcUrl);
 *   const nonce = await nm.next(address);
 *   // submit tx with this nonce
 *   nm.confirm(address);   // increment confirmed counter
 *   nm.resync(address);    // re-fetch from chain on next call
 */

import { executionClient } from "./gas.ts";

export class NonceManager {
  /**
   * Uses the write-capable execution client backed by POLYGON_RPC.
   * The rpcUrl parameter is kept for backward-compatibility but ignored.
   *
   * @param {string} [_rpcUrl]  Ignored — executionClient is used instead
   */
  constructor(_rpcUrl) {
    this._client = executionClient;

    /**
     * Map of address → { nonce: bigint, pending: number, dirty: boolean }
     * dirty: true means we need to resync from chain
     */
    this._state = new Map();
  }

  // ─── Helpers ─────────────────────────────────────────────────

  _key(address) {
    return address.toLowerCase();
  }

  async _fetchOnchain(address) {
    const count = await this._client.getTransactionCount({
      address,
      blockTag: "pending", // Include mempool txs in count
    });
    return BigInt(count);
  }

  // ─── Public API ──────────────────────────────────────────────

  /**
   * Get the next nonce for an address.
   *
   * On first call or after resync(), fetches from chain.
   * On subsequent calls, increments locally.
   *
   * @param {string} address  Sender address (0x-prefixed)
   * @returns {Promise<bigint>}  Nonce to use for the next transaction
   */
  async next(address) {
    const key = this._key(address);

    if (!this._state.has(key) || this._state.get(key).dirty) {
      const onchain = await this._fetchOnchain(address);
      this._state.set(key, { nonce: onchain, pending: 0, dirty: false });
      console.log(`[nonce_manager] ${address}: synced nonce=${onchain}`);
    }

    const entry = this._state.get(key);
    const nonce = entry.nonce + BigInt(entry.pending);
    entry.pending++;

    return nonce;
  }

  /**
   * Confirm a transaction was submitted (regardless of mined/reverted).
   * Increments the base nonce by 1.
   *
   * @param {string} address
   */
  confirm(address) {
    const key = this._key(address);
    const entry = this._state.get(key);
    if (!entry) return;

    entry.nonce++;
    if (entry.pending > 0) entry.pending--;
  }

  /**
   * Mark a transaction as reverted/dropped.
   * Decrements pending but does NOT increment base nonce.
   *
   * @param {string} address
   */
  revert(address) {
    const key = this._key(address);
    const entry = this._state.get(key);
    if (!entry) return;

    if (entry.pending > 0) entry.pending--;
  }

  /**
   * Force a resync from chain on next call to next().
   *
   * @param {string} address
   */
  resync(address) {
    const key = this._key(address);
    const entry = this._state.get(key);
    if (entry) {
      entry.dirty = true;
      entry.pending = 0;
    }
    console.log(`[nonce_manager] ${address}: marked for resync`);
  }

  /**
   * Get current local nonce state without fetching.
   *
   * @param {string} address
   * @returns {{ nonce: bigint, pending: number } | null}
   */
  peek(address) {
    const entry = this._state.get(this._key(address));
    if (!entry) return null;
    return { nonce: entry.nonce, pending: entry.pending };
  }

  /**
   * Reset all nonce state (e.g. on startup).
   */
  reset() {
    this._state.clear();
  }
}
