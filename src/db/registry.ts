
/**
 * src/db/registry.js — SQLite-backed pool registry
 *
 * Responsibilities:
 *   - Pool CRUD (insert, update, remove, query)
 *   - Per-protocol checkpoint tracking for resume-from-crash
 *   - Rollback guard persistence for reorg detection
 *   - Pool state storage for swap simulation
 *   - Batch operations and snapshot I/O
 *   - Token decimals tracking
 *   - Fee tier detection and storage
 *   - Disabled pool tracking
 *   - Liquidity-change detection
 *   - Pool metadata validation
 */

import fs from "fs";
import path from "path";
import { CompatDatabase } from "./sqlite.ts";
import { RegistryMetaCache } from "./registry_meta_cache.ts";
import {
  getCheckpoint as getCheckpointRecord,
  getGlobalCheckpoint as getGlobalCheckpointRecord,
  getRollbackGuard as getRollbackGuardRecord,
  rollbackToBlock as rollbackRegistryToBlock,
  setCheckpoint as setCheckpointRecord,
  setRollbackGuard as setRollbackGuardRecord,
} from "./registry_checkpoints.ts";
import {
  getArbHistory as getArbHistoryRecords,
  getArbStats as getArbStatsRecord,
  logArbResult as logArbResultRecord,
} from "./registry_history.ts";
import {
  batchUpsertTokenMeta as batchUpsertTokenMetaRecords,
  getPoolFee as getPoolFeeRecord,
  getTokenDecimals as getTokenDecimalsRecord,
  getTokenMeta as getTokenMetaRecord,
  upsertPoolFee as upsertPoolFeeRecord,
  upsertTokenMeta as upsertTokenMetaRecord,
} from "./registry_assets.ts";
import {
  batchUpdateStates as batchUpdateStatesRecord,
  batchUpsertPools as batchUpsertPoolsRecord,
  batchRemovePools as batchRemovePoolsRecord,
  detectLiquidityChange as detectLiquidityChangeRecord,
  disablePool as disablePoolRecord,
  enablePool as enablePoolRecord,
  getActivePoolCount as getActivePoolCountRecord,
  getPoolAddressesForProtocol as getPoolAddressesForProtocolRecord,
  getPool as getPoolRecord,
  getPoolCount as getPoolCountRecord,
  getPoolCountForProtocol as getPoolCountForProtocolRecord,
  getPoolCountByProtocol as getPoolCountByProtocolRecord,
  getPools as getPoolsRecord,
  getPoolsWithState as getPoolsWithStateRecord,
  getStaleStatePools as getStaleStatePoolsRecord,
  hasRecentLiquidityEvent as hasRecentLiquidityEventRecord,
  loadSnapshot as loadSnapshotRecord,
  recordLiquidityEvent as recordLiquidityEventRecord,
  removePool as removePoolRecord,
  saveSnapshot as saveSnapshotRecord,
  updatePoolState as updatePoolStateRecord,
  upsertPool as upsertPoolRecord,
  validateAllPools as validateAllPoolsRecord,
  validatePoolMetadata as validatePoolMetadataRecord,
} from "./registry_pools.ts";

export class RegistryService {
  db: CompatDatabase;
  _metaCache: RegistryMetaCache;
  _tokenMetaCache: Map<string, Record<string, unknown> | null>;
  _tokenDecimalsCache: Map<string, number>;
  _stmtFn: (key: string, sql: string) => ReturnType<CompatDatabase["prepare"]>;
  _invalidatePoolMetaCacheFn: () => void;
  _recordLiquidityEventFn: (...args: any[]) => void;
  constructor(dbPath: string) {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.db = new CompatDatabase(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this._initSchema();
    this._stmtFn = this._stmt.bind(this);
    this._invalidatePoolMetaCacheFn = this._invalidatePoolMetaCache.bind(this);
    this._recordLiquidityEventFn = this.recordLiquidityEvent.bind(this);
    this._metaCache = new RegistryMetaCache(this._stmtFn);
    this._tokenMetaCache = new Map();
    this._tokenDecimalsCache = new Map();
  }

  // ─── Schema ──────────────────────────────────────────────────

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pools (
        address TEXT PRIMARY KEY,
        protocol TEXT NOT NULL,
        tokens TEXT NOT NULL,
        created_block INTEGER NOT NULL,
        created_tx TEXT NOT NULL,
        metadata TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS pool_state (
        address TEXT PRIMARY KEY,
        last_updated_block INTEGER NOT NULL,
        state_data TEXT NOT NULL,
        FOREIGN KEY (address) REFERENCES pools(address)
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        protocol TEXT PRIMARY KEY,
        last_block INTEGER NOT NULL,
        last_block_hash TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS rollback_guard (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        block_number INTEGER NOT NULL,
        block_hash TEXT NOT NULL,
        timestamp INTEGER,
        first_block_number INTEGER,
        first_parent_hash TEXT
      );

      -- Token metadata: decimals, symbol, name
      CREATE TABLE IF NOT EXISTS token_meta (
        address TEXT PRIMARY KEY,
        decimals INTEGER NOT NULL,
        symbol TEXT,
        name TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Pool fee tiers: per-pool fee in basis points
      CREATE TABLE IF NOT EXISTS pool_fees (
        address TEXT PRIMARY KEY,
        fee_bps INTEGER NOT NULL,
        fee_raw TEXT,
        protocol TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Liquidity change log: detect significant liquidity events
      CREATE TABLE IF NOT EXISTS liquidity_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL,
        block_number INTEGER NOT NULL,
        event_type TEXT NOT NULL,  -- 'large_change', 'near_empty', 'disabled'
        old_value TEXT,
        new_value TEXT,
        recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Arbitrage execution history: one row per executed arb
      CREATE TABLE IF NOT EXISTS arb_history (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_hash          TEXT,
        block_number     INTEGER,
        start_token      TEXT NOT NULL,
        hop_count        INTEGER NOT NULL,
        amount_in        TEXT NOT NULL,   -- raw bigint as string
        amount_out       TEXT NOT NULL,
        gross_profit     TEXT NOT NULL,
        net_profit       TEXT NOT NULL,
        gas_used         INTEGER,
        gas_price_wei    TEXT,
        pools            TEXT NOT NULL,   -- JSON array of pool addresses
        protocols        TEXT NOT NULL,   -- JSON array of protocol names
        status           TEXT NOT NULL DEFAULT 'success', -- 'success' | 'reverted' | 'dropped'
        recorded_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_pools_protocol ON pools(protocol);
      CREATE INDEX IF NOT EXISTS idx_pools_status ON pools(status);
      CREATE INDEX IF NOT EXISTS idx_pools_status_protocol ON pools(status, protocol);
      CREATE INDEX IF NOT EXISTS idx_pool_state_block ON pool_state(last_updated_block);
      CREATE INDEX IF NOT EXISTS idx_liquidity_events_addr ON liquidity_events(address);
      CREATE INDEX IF NOT EXISTS idx_liquidity_events_addr_block ON liquidity_events(address, block_number);
      CREATE INDEX IF NOT EXISTS idx_arb_history_recorded ON arb_history(recorded_at);
      CREATE INDEX IF NOT EXISTS idx_arb_history_token ON arb_history(start_token);
    `);

    // Migrations for existing databases
    const migrations = [
      `ALTER TABLE pools ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
      `CREATE INDEX IF NOT EXISTS idx_pools_status_protocol ON pools(status, protocol)`,
      `CREATE INDEX IF NOT EXISTS idx_liquidity_events_addr_block ON liquidity_events(address, block_number)`,
    ];

    for (const migration of migrations) {
      try {
        this.db.exec(migration);
      } catch (_) {
        // Column already exists — expected on non-fresh databases
      }
    }
  }

  // ─── Pool CRUD ───────────────────────────────────────────────

  _stmt(key: string, sql: string) {
    return this.db.statement(key, sql);
  }

  _invalidatePoolMetaCache() {
    this._metaCache.invalidate();
  }

  invalidatePoolMetaCache() {
    this._invalidatePoolMetaCache();
  }

  _getPoolMetaCache() {
    return this._metaCache.getAll();
  }

  _normalizeTokenAddress(address: string | null | undefined) {
    if (typeof address !== "string") return null;
    const trimmed = address.trim().toLowerCase();
    return trimmed || null;
  }

  _normalizeTokenText(value: string | null | undefined) {
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
  }

  _cacheTokenMetaEntry(meta: {
    address?: string | null;
    decimals?: number | null;
    symbol?: string | null;
    name?: string | null;
  } | null | undefined) {
    const normalizedAddress = this._normalizeTokenAddress(meta?.address);
    if (!normalizedAddress) return null;

    const cachedMeta = meta == null
      ? null
      : {
          address: normalizedAddress,
          decimals: meta.decimals,
          symbol: this._normalizeTokenText(meta.symbol ?? null),
          name: this._normalizeTokenText(meta.name ?? null),
        };

    this._tokenMetaCache.set(normalizedAddress, cachedMeta);
    if (cachedMeta?.decimals != null) {
      this._tokenDecimalsCache.set(normalizedAddress, cachedMeta.decimals);
    }
    return cachedMeta;
  }

  upsertPool(metadata: Record<string, unknown>) {
    return upsertPoolRecord(
      this.db,
      this._stmtFn,
      this._invalidatePoolMetaCacheFn,
      metadata
    );
  }

  removePool(address: string) {
    return removePoolRecord(
      this._stmtFn,
      this._invalidatePoolMetaCacheFn,
      address
    );
  }

  batchRemovePools(addresses: string[]) {
    return batchRemovePoolsRecord(
      this._stmtFn,
      this._invalidatePoolMetaCacheFn,
      this.db,
      addresses
    );
  }

  updatePoolState(state: Record<string, unknown>) {
    return updatePoolStateRecord(this._stmtFn, state);
  }

  getPools(opts = {}) {
    return getPoolsRecord(this.db, opts);
  }

  getActivePools() {
    return this.getPools({ status: "active" });
  }

  getActivePoolsMeta() {
    return this._metaCache.getActive();
  }

  getPoolMeta(address: string) {
    return this._metaCache.get(address);
  }

  getPool(address: string) {
    return getPoolRecord(this._stmtFn, address);
  }

  getPoolCount() {
    return getPoolCountRecord(this._stmtFn);
  }

  getActivePoolCount() {
    return getActivePoolCountRecord(this._stmtFn);
  }

  getPoolCountForProtocol(protocol: string, status: string | null = null) {
    return getPoolCountForProtocolRecord(this._stmtFn, protocol, status);
  }

  getPoolAddressesForProtocol(protocol: string, status: string | null = null) {
    return getPoolAddressesForProtocolRecord(this._stmtFn, protocol, status);
  }

  // ─── Checkpoint Management ───────────────────────────────────

  getCheckpoint(protocol: string) {
    return getCheckpointRecord(this.db, protocol);
  }

  setCheckpoint(protocol: string, block: number, blockHash: string | null = null) {
    setCheckpointRecord(this.db, protocol, block, blockHash);
  }

  getGlobalCheckpoint() {
    return getGlobalCheckpointRecord(this.db);
  }

  // ─── Rollback Guard ──────────────────────────────────────────

  setRollbackGuard(guard: Record<string, unknown>) {
    setRollbackGuardRecord(this.db, guard);
  }

  getRollbackGuard() {
    return getRollbackGuardRecord(this.db);
  }

  // ─── Rollback (Reorg) Handling ───────────────────────────────

  rollbackToBlock(block: number) {
    const result = rollbackRegistryToBlock(this.db, block);
    this._invalidatePoolMetaCache();
    return result;
  }

  // ─── Batch Operations ────────────────────────────────────────

  batchUpsertPools(poolList: Record<string, unknown>[]) {
    batchUpsertPoolsRecord(
      this.db,
      this._stmtFn,
      this._invalidatePoolMetaCacheFn,
      poolList
    );
  }

  /**
   * Batch update pool states in a single transaction.
   *
   * @param {Array<{ pool_address: string, block: number, data: Object }>} stateList
   */
  batchUpdateStates(stateList: Record<string, unknown>[]) {
    batchUpdateStatesRecord(this.db, this._stmtFn, stateList);
  }

  /**
   * Get all active pools that have state data.
   * Returns pools joined with their latest state.
   */
  getPoolsWithState(opts = {}) {
    return getPoolsWithStateRecord(this.db, opts);
  }

  /**
   * Get pools that need state refresh (no state or state older than given block).
   *
   * @param {number} staleThreshold  Block number; pools with state older than this are included
   * @returns {Array}
   */
  getStaleStatePools(staleThreshold: number) {
    return getStaleStatePoolsRecord(this.db, staleThreshold);
  }

  /**
   * Get pool count by protocol.
   * @returns {Object} e.g. { QUICKSWAP_V2: 3622, UNISWAP_V3: 3513, ... }
   */
  getPoolCountByProtocol() {
    return getPoolCountByProtocolRecord(this._stmtFn);
  }

  // ─── Snapshot I/O ────────────────────────────────────────────

  loadSnapshot(snapshotPath: string) {
    loadSnapshotRecord(this.batchUpsertPools.bind(this), snapshotPath);
  }

  saveSnapshot(snapshotPath: string) {
    saveSnapshotRecord(this.getPools.bind(this), snapshotPath);
  }

  // ─── Token Decimals ───────────────────────────────────────────

  /**
   * Upsert token metadata (decimals, symbol, name).
   *
   * @param {string} address   Token address (lowercase)
   * @param {number} decimals  Token decimals (e.g. 18, 6, 8)
   * @param {string} [symbol]  Token symbol
   * @param {string} [name]    Token name
   */
  upsertTokenMeta(address: string, decimals: number, symbol: string | null = null, name: string | null = null) {
    upsertTokenMetaRecord(this.db, address, decimals, symbol, name);
    this._cacheTokenMetaEntry({ address, decimals, symbol, name });
  }

  /**
   * Get token metadata for a given address.
   *
   * @param {string} address
   * @returns {{ address, decimals, symbol, name } | null}
   */
  getTokenMeta(address: string) {
    const normalizedAddress = this._normalizeTokenAddress(address);
    if (!normalizedAddress) return null;
    if (this._tokenMetaCache.has(normalizedAddress)) {
      return this._tokenMetaCache.get(normalizedAddress) ?? null;
    }
    const meta = getTokenMetaRecord(this.db, normalizedAddress);
    return this._cacheTokenMetaEntry(meta);
  }

  /**
   * Get decimals for multiple tokens at once.
   *
   * @param {string[]} addresses
   * @returns {Map<string, number>}  address → decimals
   */
  getTokenDecimals(addresses: string[]) {
    const result = new Map<string, number>();
    if (!Array.isArray(addresses) || addresses.length === 0) return result;

    const misses: string[] = [];
    const seen = new Set<string>();
    for (const address of addresses) {
      const normalizedAddress = this._normalizeTokenAddress(address);
      if (!normalizedAddress || seen.has(normalizedAddress)) continue;
      seen.add(normalizedAddress);

      const cachedDecimals = this._tokenDecimalsCache.get(normalizedAddress);
      if (cachedDecimals != null) {
        result.set(normalizedAddress, cachedDecimals);
      } else {
        misses.push(normalizedAddress);
      }
    }

    if (misses.length === 0) return result;

    const fetched = getTokenDecimalsRecord(this.db, misses);
    for (const [address, decimals] of fetched.entries()) {
      this._tokenDecimalsCache.set(address, decimals);
      result.set(address, decimals);
      if (this._tokenMetaCache.has(address)) {
        const meta = this._tokenMetaCache.get(address);
        if (meta) {
          this._tokenMetaCache.set(address, { ...meta, decimals });
        }
      }
    }

    return result;
  }

  /**
   * Batch upsert token metadata.
   *
   * @param {Array<{ address: string, decimals: number, symbol?: string, name?: string }>} tokens
   */
  batchUpsertTokenMeta(tokens: Array<{ address: string; decimals: number; symbol?: string; name?: string }>) {
    batchUpsertTokenMetaRecords(this.db, tokens);
    for (const token of tokens) {
      const normalizedAddress = this._normalizeTokenAddress(token?.address);
      if (!normalizedAddress) continue;
      const prior = this._tokenMetaCache.get(normalizedAddress);
      const next = {
        address: normalizedAddress,
        decimals: token.decimals,
        symbol: this._normalizeTokenText(token.symbol ?? prior?.symbol as string | null | undefined),
        name: this._normalizeTokenText(token.name ?? prior?.name as string | null | undefined),
      };
      this._cacheTokenMetaEntry(next);
    }
  }

  // ─── Fee Tiers ────────────────────────────────────────────────

  /**
   * Store or update the fee tier for a pool.
   *
   * @param {string} poolAddress  Lowercase pool address
   * @param {number} feeBps       Fee in basis points (e.g. 30 = 0.3%)
   * @param {string} [feeRaw]     Raw fee value from contract (e.g. "3000" for V3)
   * @param {string} [protocol]   Protocol name
   */
  upsertPoolFee(poolAddress: any, feeBps: any, feeRaw = null, protocol = null) {
    upsertPoolFeeRecord(this.db, poolAddress, feeBps, feeRaw, protocol);
  }

  /**
   * Get fee tier for a pool.
   *
   * @param {string} poolAddress
   * @returns {{ feeBps: number, feeRaw: string|null } | null}
   */
  getPoolFee(poolAddress: any) {
    return getPoolFeeRecord(this.db, poolAddress);
  }

  // ─── Disabled Pool Tracking ───────────────────────────────────

  /**
   * Disable a pool (soft-remove from arb consideration).
   * Sets status = 'disabled' (distinct from 'removed' which is for reorg cleanup).
   *
   * @param {string} poolAddress
   * @param {string} [reason]  Why the pool is being disabled
   */
  disablePool(poolAddress: any, reason = "manual") {
    disablePoolRecord(
      this.db,
      this._stmtFn,
      this._invalidatePoolMetaCacheFn,
      this._recordLiquidityEventFn,
      poolAddress,
      reason
    );
    console.log(`[registry] Disabled pool ${poolAddress}: ${reason}`);
  }

  /**
   * Re-enable a previously disabled pool.
   *
   * @param {string} poolAddress
   */
  enablePool(poolAddress: any) {
    enablePoolRecord(
      this._stmtFn,
      this._invalidatePoolMetaCacheFn,
      poolAddress
    );
  }

  /**
   * Get all disabled pools.
   *
   * @returns {Array}
   */
  getDisabledPools() {
    return this.getPools({ status: "disabled" });
  }

  // ─── Liquidity Change Detection ───────────────────────────────

  /**
   * Record a liquidity event for a pool.
   *
   * @param {string} poolAddress
   * @param {number} blockNumber
   * @param {string} eventType   'large_change' | 'near_empty' | 'disabled'
   * @param {*}      [oldValue]  Previous value
   * @param {*}      [newValue]  New value
   */
  recordLiquidityEvent(poolAddress: any, blockNumber: any, eventType: any, oldValue: any, newValue: any) {
    recordLiquidityEventRecord(
      this._stmtFn,
      poolAddress,
      blockNumber,
      eventType,
      oldValue,
      newValue
    );
  }

  /**
   * Check if a pool has had a large liquidity change recently.
   *
   * @param {string} poolAddress
   * @param {number} sinceBlock  Only look at events after this block
   * @returns {boolean}
   */
  hasRecentLiquidityEvent(poolAddress: any, sinceBlock: any) {
    return hasRecentLiquidityEventRecord(this._stmtFn, poolAddress, sinceBlock);
  }

  /**
   * Detect and record large liquidity changes given new vs old state.
   *
   * For V2 pools: checks if reserves changed by more than threshold%.
   * For V3 pools: checks if liquidity changed by more than threshold%.
   *
   * @param {string} poolAddress
   * @param {Object} oldState   Previous canonical state
   * @param {Object} newState   New canonical state
   * @param {number} blockNumber
   * @param {number} [thresholdPct=50]  % change threshold
   * @returns {boolean}  true if a significant change was detected
   */
  detectLiquidityChange(poolAddress: any, oldState: any, newState: any, blockNumber: any, thresholdPct = 50) {
    return detectLiquidityChangeRecord(
      this._recordLiquidityEventFn,
      poolAddress,
      oldState,
      newState,
      blockNumber,
      thresholdPct
    );
  }

  // ─── Metadata Validation ──────────────────────────────────────

  /**
   * Validate pool metadata and return a list of issues found.
   *
   * Checks:
   *   - tokens array has >= 2 entries
   *   - token addresses are valid (42-char 0x hex)
   *   - no duplicate tokens
   *   - V3 pools have fee and tickSpacing
   *   - Balancer pools have poolId
   *
   * @param {Object} pool  Registry pool record
   * @returns {string[]}   Array of validation issue strings (empty = valid)
   */
  validatePoolMetadata(pool: any) {
    return validatePoolMetadataRecord(pool);
  }

  /**
   * Validate all active pools and return pools with issues.
   *
   * @returns {Array<{ pool: Object, issues: string[] }>}
   */
  validateAllPools() {
    return validateAllPoolsRecord(
      this.getActivePools.bind(this),
      this.validatePoolMetadata.bind(this)
    );
  }

  // ─── Arbitrage History ────────────────────────────────────────

  /**
   * Log a completed arbitrage execution to the history table.
   *
   * @param {Object} arb
   * @param {string}   [arb.txHash]        Transaction hash (null if not yet confirmed)
   * @param {number}   [arb.blockNumber]   Block the arb was included in
   * @param {string}    arb.startToken     Start/end token address (lowercase)
   * @param {number}    arb.hopCount       Number of hops (2, 3, or 4)
   * @param {bigint}    arb.amountIn       Input amount
   * @param {bigint}    arb.amountOut      Output amount
   * @param {bigint}    arb.grossProfit    Gross profit (amountOut - amountIn)
   * @param {bigint}    arb.netProfit      Net profit after gas/slippage
   * @param {number}   [arb.gasUsed]       Actual gas consumed
   * @param {bigint}   [arb.gasPriceWei]   Gas price at execution time
   * @param {string[]}  arb.pools          Ordered list of pool addresses
   * @param {string[]}  arb.protocols      Ordered list of protocol names
   * @param {string}   [arb.status]        'success' | 'reverted' | 'dropped'
   */
  logArbResult(arb: any) {
    logArbResultRecord(this.db, arb);
  }

  /**
   * Retrieve recent arb history entries.
   *
   * @param {Object} [opts]
   * @param {number}  [opts.limit=100]     Max rows to return
   * @param {string}  [opts.startToken]    Filter by start token
   * @param {string}  [opts.status]        Filter by status ('success' | 'reverted' | 'dropped')
   * @param {string}  [opts.since]         ISO datetime lower bound for recorded_at
   * @returns {Array<Object>}
   */
  getArbHistory(opts = {}) {
    return getArbHistoryRecords(this.db, opts);
  }

  /**
   * Get aggregate profit statistics across all recorded arbs.
   *
   * Returns total/average net profit for successful arbs,
   * along with counts per status and per hop count.
   *
   * @param {Object} [opts]
   * @param {string} [opts.since]  ISO datetime lower bound
   * @returns {Object}
   */
  getArbStats(opts = {}) {
    return getArbStatsRecord(this.db, opts);
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  close() {
    this._metaCache.invalidate();
    this.db.close();
  }
}
