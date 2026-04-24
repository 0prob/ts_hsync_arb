
/**
 * src/state/watcher.js — HyperSync Event Watcher
 *
 * Replaces RPC polling with a live HyperSync loop built on `client.get()`.
 *
 * Why not `stream` / `streamEvents` here?
 *   The uploaded HyperSync documentation warns that stream/collect helpers
 *   are not designed for use at the chain tip where rollbacks may occur.
 *   This watcher therefore implements a manual polling loop over `get()` and
 *   handles `rollbackGuard` explicitly.
 */

import { client, LogField, BlockField, Decoder, JoinMode } from "../hypersync/client.ts";
import {
  buildHyperSyncLogQuery,
  DEFAULT_HYPERSYNC_BLOCK_FIELDS,
} from "../hypersync/query_policy.ts";
import { topic0ForSignature } from "../hypersync/topics.ts";
import { detectReorg } from "../reorg/detect.ts";
import { fetchAndNormalizeBalancerPool } from "./poll_balancer.ts";
import { fetchAndNormalizeCurvePool } from "./poll_curve.ts";
import {
  commitWatcherState,
  commitWatcherStatesBatch,
  handleWatcherLogs,
  mergeWatcherState,
  persistWatcherState,
  persistWatcherStates,
  reloadWatcherCache,
} from "./watcher_state_ops.ts";
import {
  HYPERSYNC_BATCH_SIZE,
  HYPERSYNC_MAX_ADDRESS_FILTER,
  HYPERSYNC_MAX_FILTERS_PER_REQUEST,
} from "../config/index.ts";
import { logger } from "../utils/logger.ts";

const WATCHER_LOOKBACK_BLOCKS = 100;
const WATCHER_IDLE_SLEEP_MS = 1_000;
const WATCHER_TRANSIENT_ERROR_SLEEP_MS = 5_000;
const WATCHER_INTEGRITY_ERROR_SLEEP_MS = 15_000;
const WATCHER_TRANSIENT_ERROR_SLEEP_MAX_MS = 30_000;
const WATCHER_MAX_CONSECUTIVE_INTEGRITY_ERRORS = 3;

const V2_SYNC = "event Sync(uint112 reserve0, uint112 reserve1)";
const V3_SWAP = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
const V3_MINT = "event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)";
const V3_BURN = "event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)";
const BAL_BALANCE = "event PoolBalanceChanged(bytes32 indexed poolId, address indexed liquidityProvider, address[] tokens, int256[] deltas, uint256[] protocolFeeAmounts)";
const CURVE_EXCHANGE_STABLE = "event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)";
const CURVE_EXCHANGE_CRYPTO = "event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)";

const SIGNATURES = [
  V2_SYNC,
  V3_SWAP,
  V3_MINT,
  V3_BURN,
  BAL_BALANCE,
  CURVE_EXCHANGE_STABLE,
  CURVE_EXCHANGE_CRYPTO,
];

export const WATCHER_TOPIC0 = {
  V2_SYNC: topic0ForSignature(V2_SYNC),
  V3_SWAP: topic0ForSignature(V3_SWAP),
  V3_MINT: topic0ForSignature(V3_MINT),
  V3_BURN: topic0ForSignature(V3_BURN),
  BAL_BALANCE: topic0ForSignature(BAL_BALANCE),
  CURVE_EXCHANGE_STABLE: topic0ForSignature(CURVE_EXCHANGE_STABLE),
  CURVE_EXCHANGE_CRYPTO: topic0ForSignature(CURVE_EXCHANGE_CRYPTO),
} as const;

const TOPICS = Object.values(WATCHER_TOPIC0);

const LOG_FIELDS = [
  LogField.Address,
  LogField.Data,
  LogField.Topic0,
  LogField.Topic1,
  LogField.Topic2,
  LogField.Topic3,
  LogField.BlockNumber,
  LogField.TransactionHash,
  LogField.LogIndex,
  LogField.TransactionIndex,
];
export const watcherLogger: any = logger.child({ component: "watcher" });

function compareRollbackGuards(a: any, b: any) {
  return (
    Number(a?.block_number ?? a?.blockNumber ?? a?.first_block_number) ===
      Number(b?.block_number ?? b?.blockNumber ?? b?.first_block_number) &&
    String(a?.block_hash ?? a?.blockHash ?? a?.first_parent_hash ?? "") ===
      String(b?.block_hash ?? b?.blockHash ?? b?.first_parent_hash ?? "")
  );
}

function numericLogField(value: any) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function watcherLogIdentityKey(log: any) {
  const txHash = String(log?.transactionHash ?? "").toLowerCase();
  const logIndex = Number(log?.logIndex);
  if (txHash && Number.isFinite(logIndex) && logIndex >= 0) {
    return `${txHash}:${logIndex}`;
  }

  const blockNumber = Number(log?.blockNumber);
  const transactionIndex = Number(log?.transactionIndex);
  if (
    Number.isFinite(blockNumber) &&
    blockNumber >= 0 &&
    Number.isFinite(transactionIndex) &&
    transactionIndex >= 0 &&
    Number.isFinite(logIndex) &&
    logIndex >= 0
  ) {
    return `${blockNumber}:${transactionIndex}:${logIndex}:${String(log?.address ?? "").toLowerCase()}`;
  }

  return null;
}

export function sortWatcherLogs(logs: any[]) {
  if (!Array.isArray(logs) || logs.length <= 1) return logs ?? [];
  return [...logs].sort((a: any, b: any) => {
    const byBlock = numericLogField(a?.blockNumber) - numericLogField(b?.blockNumber);
    if (byBlock !== 0) return byBlock;

    const byTxIndex = numericLogField(a?.transactionIndex) - numericLogField(b?.transactionIndex);
    if (byTxIndex !== 0) return byTxIndex;

    const byLogIndex = numericLogField(a?.logIndex) - numericLogField(b?.logIndex);
    if (byLogIndex !== 0) return byLogIndex;

    return String(a?.address ?? "").localeCompare(String(b?.address ?? ""));
  });
}

export function dedupeWatcherLogs(logs: any[]) {
  if (!Array.isArray(logs) || logs.length <= 1) return logs ?? [];

  const seen = new Set<string>();
  const deduped = [];
  for (const log of logs) {
    const identity = watcherLogIdentityKey(log);
    if (!identity) {
      deduped.push(log);
      continue;
    }
    if (seen.has(identity)) continue;
    seen.add(identity);
    deduped.push(log);
  }
  return deduped;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function normalizeWatchedAddresses(addresses: any[]) {
  if (!Array.isArray(addresses) || addresses.length === 0) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const address of addresses) {
    if (typeof address !== "string") continue;
    const next = address.trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(next) || seen.has(next)) continue;
    seen.add(next);
    normalized.push(next);
  }
  return normalized;
}

export function watcherCheckpointFromNextBlock(nextBlock: any, currentLastBlock: any, archiveHeight?: any) {
  if (!Number.isFinite(nextBlock)) {
    throw new Error("HyperSync response did not include a finite nextBlock cursor; cannot advance watcher safely.");
  }

  const requestedFromBlock = Math.max(0, Number(currentLastBlock) + 1);
  if (nextBlock < requestedFromBlock) {
    throw new Error(
      `HyperSync nextBlock cursor regressed from requested block ${requestedFromBlock} to ${nextBlock}; cannot advance watcher safely.`,
    );
  }

  const rawArchiveHeight = archiveHeight;
  const numericArchiveHeight = Number(rawArchiveHeight);
  if (
    nextBlock === requestedFromBlock &&
    (rawArchiveHeight == null || !Number.isFinite(numericArchiveHeight))
  ) {
    throw new Error(
      `HyperSync nextBlock cursor stalled at ${nextBlock} without archive height; cannot advance watcher safely.`,
    );
  }
  if (
    nextBlock === requestedFromBlock &&
    Number.isFinite(numericArchiveHeight) &&
    numericArchiveHeight > requestedFromBlock
  ) {
    throw new Error(
      `HyperSync nextBlock cursor stalled at ${nextBlock} before archive height ${numericArchiveHeight}; cannot advance watcher safely.`,
    );
  }

  if (nextBlock > 0) {
    return nextBlock - 1;
  }
  return Math.max(0, currentLastBlock);
}

export function watcherProgressMeta(
  nextBlock: any,
  currentLastBlock: any,
  archiveHeight: any,
  logCount = 0,
  shardSummary: { archiveHeights?: number[] | null } | null = null,
) {
  const numericNextBlock = Number(nextBlock);
  const numericArchiveHeight = Number(archiveHeight);
  const checkpointBlock = watcherCheckpointFromNextBlock(numericNextBlock, currentLastBlock, archiveHeight);
  const requestedFromBlock = Math.max(0, Number(currentLastBlock) + 1);
  const advancedBlocks = Math.max(0, checkpointBlock - Number(currentLastBlock));
  const caughtUp =
    Number.isFinite(numericNextBlock) &&
    Number.isFinite(numericArchiveHeight) &&
    numericNextBlock >= numericArchiveHeight;
  const hadLogs = Number(logCount) > 0;
  const archiveHeights = Array.isArray(shardSummary?.archiveHeights) && shardSummary.archiveHeights.length > 0
    ? [...shardSummary.archiveHeights]
    : null;

  let waitReason = null;
  if (!hadLogs) {
    waitReason = "empty_poll";
  } else if (caughtUp) {
    waitReason = "caught_up";
  }

  return {
    requestedFromBlock,
    nextBlock: numericNextBlock,
    archiveHeight: Number.isFinite(numericArchiveHeight) ? numericArchiveHeight : null,
    checkpointBlock,
    advancedBlocks,
    hadLogs,
    caughtUp,
    waitReason,
    constrainedBySlowestShardArchiveHeight: Array.isArray(archiveHeights) && archiveHeights.length > 1,
    shardArchiveHeights: archiveHeights,
  };
}

export function watcherErrorBackoffMeta(
  error: unknown,
  consecutivePollErrors: number,
  backoffMs: number,
  currentLastBlock: any,
  errorCategory: string | null = null,
) {
  const err = error as { message?: string; name?: string } | null | undefined;
  return {
    error: String(err?.message ?? error ?? "Unknown watcher error"),
    errorName: err?.name ?? null,
    errorCategory,
    consecutivePollErrors: Math.max(1, Number(consecutivePollErrors) || 1),
    backoffMs: Math.max(0, Number(backoffMs) || 0),
    currentLastBlock: Math.max(0, Number(currentLastBlock) || 0),
  };
}

export function classifyWatcherPollError(error: unknown) {
  const message = String((error as { message?: string } | null | undefined)?.message ?? error ?? "").toLowerCase();
  if (
    message.includes("did not include a finite nextblock cursor") ||
    message.includes("stalled at") ||
    message.includes("regressed from requested block") ||
    message.includes("mismatched rollback guards") ||
    message.includes("incomplete shard metadata") ||
    message.includes("inconsistent chain views")
  ) {
    return "integrity";
  }
  return "transient";
}

export function watcherErrorBackoffMs(error: unknown, consecutivePollErrors: number) {
  const category = classifyWatcherPollError(error);
  if (category === "integrity") {
    return WATCHER_INTEGRITY_ERROR_SLEEP_MS;
  }

  const streak = Math.max(1, Number(consecutivePollErrors) || 1);
  return Math.min(
    WATCHER_TRANSIENT_ERROR_SLEEP_MS * Math.max(1, 2 ** (streak - 1)),
    WATCHER_TRANSIENT_ERROR_SLEEP_MAX_MS,
  );
}

export function watcherShouldHaltAfterIntegrityError(consecutiveIntegrityErrors: number) {
  return Math.max(0, Number(consecutiveIntegrityErrors) || 0) >= WATCHER_MAX_CONSECUTIVE_INTEGRITY_ERRORS;
}

export function watcherReorgMeta(
  reorgBlock: any,
  rollbackResult: { poolsRemoved?: any; statesRemoved?: any } | null | undefined,
  changedAddrs: unknown,
  checkpointBlock: any,
) {
  const changedAddrCount = Array.isArray(changedAddrs)
    ? changedAddrs.length
    : changedAddrs instanceof Set
      ? changedAddrs.size
      : 0;
  return {
    reorgBlock: Math.max(0, Number(reorgBlock) || 0),
    checkpointBlock: Math.max(0, Number(checkpointBlock) || 0),
    poolsRemoved: Math.max(0, Number(rollbackResult?.poolsRemoved) || 0),
    statesRemoved: Math.max(0, Number(rollbackResult?.statesRemoved) || 0),
    cacheEntriesReloaded: changedAddrCount,
  };
}

export function watcherHaltMeta(
  error: unknown,
  consecutiveIntegrityPollErrors: number,
  haltThreshold: number,
  currentLastBlock: any,
) {
  const err = error as { message?: string; name?: string } | null | undefined;
  return {
    reason: String(err?.message ?? error ?? "Unknown watcher halt reason"),
    errorName: err?.name ?? null,
    consecutiveIntegrityPollErrors: Math.max(0, Number(consecutiveIntegrityPollErrors) || 0),
    haltThreshold: Math.max(0, Number(haltThreshold) || 0),
    currentLastBlock: Math.max(0, Number(currentLastBlock) || 0),
  };
}

export class StateWatcher {
  private _registry: any;
  private _cache: any;
  private _decoder: any;
  private _running: boolean;
  private _closed: boolean;
  private _lastBlock: number;
  private _checkpointKey: string;
  private _loopPromise: Promise<void> | null;
  private _watchedAddresses: string[];
  private _watchedAddressSet: Set<string>;
  private _pendingEnrichment: Map<string, any>;
  private _enrichmentEpoch: number;
  private _sleepTimer: ReturnType<typeof setTimeout> | null;
  private _sleepResolve: (() => void) | null;
  private _consecutivePollErrors: number;
  private _consecutiveIntegrityPollErrors: number;
  private _haltMeta: Record<string, unknown> | null;
  onBatch: ((batch: any) => void) | null;
  onReorg: ((reorg: any) => void) | null;
  onHalt: ((event: Record<string, unknown>) => void) | null;

  constructor(registry: any, stateCache: any) {
    this._registry = registry;
    this._cache = stateCache;
    this._decoder = Decoder.fromSignatures(SIGNATURES);
    this._running = false;
    this._closed = false;
    this._lastBlock = 0;
    this._checkpointKey = "HYPERSYNC_WATCHER";
    this._loopPromise = null;
    this._watchedAddresses = [];
    this._watchedAddressSet = new Set();
    this._pendingEnrichment = new Map();
    this._enrichmentEpoch = 0;
    this._sleepTimer = null;
    this._sleepResolve = null;
    this._consecutivePollErrors = 0;
    this._consecutiveIntegrityPollErrors = 0;
    this._haltMeta = null;

    this.onBatch = null;
    this.onReorg = null;
    this.onHalt = null;
  }

  async start(fromBlock: any) {
    if (this._running) return;
    this._running = true;
    this._closed = false;

    if (fromBlock != null) {
      this._lastBlock = Math.max(0, Number(fromBlock));
    } else {
      const cp = this._registry.getCheckpoint(this._checkpointKey);
      if (cp && Number.isFinite(Number(cp.last_block))) {
        this._lastBlock = Math.max(0, Number(cp.last_block));
      } else {
        const globalCheckpoint = Number(this._registry.getGlobalCheckpoint?.());
        if (Number.isFinite(globalCheckpoint) && globalCheckpoint >= 0) {
          this._lastBlock = Math.max(0, globalCheckpoint);
          watcherLogger.info(
            { startBlock: this._lastBlock },
            "No watcher checkpoint found; resuming from global checkpoint"
          );
        } else {
          try {
            const height = Number(await client.getHeight());
            this._lastBlock = Math.max(0, height - WATCHER_LOOKBACK_BLOCKS);
            watcherLogger.info(
              { startBlock: this._lastBlock, lookbackBlocks: WATCHER_LOOKBACK_BLOCKS },
              "No checkpoint found; starting from lookback block"
            );
          } catch {
            this._lastBlock = 0;
          }
        }
      }
    }

    this._watchedAddresses = Array.from(this._cache.keys());
    this._watchedAddressSet = new Set(this._watchedAddresses);
    this._loopPromise = this._loop();
  }

  wait() {
    return this._loopPromise ?? Promise.resolve();
  }

  async addPools(newAddresses: any) {
    if (this._closed || !newAddresses || newAddresses.length === 0) return;

    const added = [];
    for (const address of newAddresses) {
      const addr = address.toLowerCase();
      if (this._watchedAddressSet.has(addr)) continue;
      this._watchedAddressSet.add(addr);
      added.push(addr);
    }
    if (added.length === 0) return;

    watcherLogger.info({ addedPools: added.length }, "Adding new pools to watcher filter");
    this._watchedAddresses.push(...added);
  }

  async restart() {
    const resumeBlock = this._lastBlock;
    await this.stop();
    this._lastBlock = resumeBlock;
    this._running = true;
    this._closed = false;
    this._loopPromise = this._loop();
  }

  async stop() {
    this._running = false;
    this._closed = true;
    this._wakeSleep();
    if (this._loopPromise) {
      await this._loopPromise.catch(() => {});
      this._loopPromise = null;
    }
    if (this._pendingEnrichment.size > 0) {
      await Promise.allSettled(
        [...this._pendingEnrichment.values()].map((entry: any) => entry.promise)
      );
    }
  }

  get lastBlock() {
    return this._lastBlock;
  }

  get haltMeta() {
    return this._haltMeta;
  }

  _buildQueries() {
    const watchedAddresses = normalizeWatchedAddresses(this._watchedAddresses);
    // HyperSync enforces a 2 MB HTTP request-body limit. Instead of dropping to
    // topic-only filtering once the address set grows, shard the address list
    // across multiple filters and requests so the watcher stays selective at
    // larger pool counts without overflowing request payload limits.
    const logFilters =
      watchedAddresses.length > 0
        ? chunk(watchedAddresses, HYPERSYNC_MAX_ADDRESS_FILTER).map((addresses) => ({
            address: addresses,
            topics: [TOPICS],
          }))
        : [{ topics: [TOPICS] }];

    return chunk(logFilters, HYPERSYNC_MAX_FILTERS_PER_REQUEST).map((logs) =>
      buildHyperSyncLogQuery({
        fromBlock: this._lastBlock + 1,
        logs,
        maxNumLogs: HYPERSYNC_BATCH_SIZE,
        joinMode: JoinMode.JoinNothing,
        logFields: LOG_FIELDS,
        blockFields: DEFAULT_HYPERSYNC_BLOCK_FIELDS,
      })
    );
  }

  async _pollOnce() {
    const queries = this._buildQueries();
    const logs = [];
    let rollbackGuard = null;
    let nextBlock = Number.POSITIVE_INFINITY;
    let archiveHeight = Number.POSITIVE_INFINITY;
    const shardArchiveHeights = new Set<number>();

    const responses = await Promise.all(queries.map((query) => client.get(query)));
    if (!this._running) {
      return null;
    }

    for (const res of responses) {
      if (res.rollbackGuard) {
        if (!rollbackGuard) {
          rollbackGuard = res.rollbackGuard;
        } else if (!compareRollbackGuards(rollbackGuard, res.rollbackGuard)) {
          throw new Error("Watcher shard responses returned mismatched rollback guards; refusing to merge inconsistent chain views.");
        }
      }

      if (Array.isArray(res.data?.logs) && res.data.logs.length > 0) {
        logs.push(...res.data.logs);
      }

      const rawShardNextBlock = res.nextBlock;
      const shardNextBlock = Number(rawShardNextBlock);
      if (rawShardNextBlock == null || !Number.isFinite(shardNextBlock)) {
        throw new Error("Watcher shard response did not include a finite nextBlock cursor; cannot merge incomplete shard metadata.");
      }
      nextBlock = Math.min(nextBlock, shardNextBlock);

      const shardArchiveHeight = Number(res.archiveHeight);
      if (Number.isFinite(shardArchiveHeight)) {
        archiveHeight = Math.min(archiveHeight, shardArchiveHeight);
        shardArchiveHeights.add(shardArchiveHeight);
      }
    }

    if (shardArchiveHeights.size > 1) {
      watcherLogger.warn(
        { archiveHeights: [...shardArchiveHeights].sort((a, b) => a - b) },
        "Watcher shard responses returned inconsistent archive heights; using the slowest shard height",
      );
    }

    return {
      rollbackGuard,
      data: { logs: dedupeWatcherLogs(sortWatcherLogs(logs)) },
      nextBlock: Number.isFinite(nextBlock) ? nextBlock : null,
      archiveHeight: Number.isFinite(archiveHeight) ? archiveHeight : null,
      shardSummary: {
        archiveHeights: [...shardArchiveHeights].sort((a, b) => a - b),
      },
    };
  }

  _wakeSleep() {
    if (this._sleepTimer) {
      clearTimeout(this._sleepTimer);
      this._sleepTimer = null;
    }
    const resolve = this._sleepResolve;
    this._sleepResolve = null;
    resolve?.();
  }

  async _sleep(ms: number) {
    if (!this._running || ms <= 0) return;
    await new Promise<void>((resolve) => {
      this._sleepResolve = () => {
        this._sleepTimer = null;
        this._sleepResolve = null;
        resolve();
      };
      this._sleepTimer = setTimeout(() => {
        this._sleepTimer = null;
        const currentResolve = this._sleepResolve;
        this._sleepResolve = null;
        currentResolve?.();
      }, ms);
    });
  }

  async _loop() {
    const addrCount = this._watchedAddresses.length;
    const shardCount = Math.max(1, Math.ceil(addrCount / HYPERSYNC_MAX_ADDRESS_FILTER));
    const requestCount = Math.max(1, Math.ceil(shardCount / HYPERSYNC_MAX_FILTERS_PER_REQUEST));
    const filterMode =
      addrCount === 0
        ? "topic-only (no pools yet)"
        : shardCount === 1
          ? `${addrCount} pool address(es)`
          : `${addrCount} pool address(es) across ${shardCount} filter shard(s) and ${requestCount} request(s)`;
    watcherLogger.info(
      { fromBlock: this._lastBlock + 1, filterMode },
      "Starting manual HyperSync loop"
    );

    while (this._running) {
      try {
        const res = await this._pollOnce();
        if (!res) break;
        if (!this._running) break;
        if (this._consecutivePollErrors > 0) {
          watcherLogger.info(
            {
              consecutivePollErrors: this._consecutivePollErrors,
              consecutiveIntegrityPollErrors: this._consecutiveIntegrityPollErrors,
              resumedFromBlock: this._lastBlock + 1,
            },
            "Watcher poll recovered after errors"
          );
          this._consecutivePollErrors = 0;
          this._consecutiveIntegrityPollErrors = 0;
        }

        if (res.rollbackGuard) {
          const reorgBlock = detectReorg(this._registry, res.rollbackGuard);
          if (reorgBlock !== false) {
            watcherLogger.warn({ reorgBlock }, "Reorg detected; rolling back registry state");
            this._advanceEnrichmentEpoch();
            const rb = this._registry.rollbackToBlock(reorgBlock);
            const checkpointBlock = Math.max(0, reorgBlock - 1);
            this._lastBlock = checkpointBlock;
            const changedAddrs = this._reloadCacheFromRegistry();
            watcherLogger.warn(
              watcherReorgMeta(reorgBlock, rb, changedAddrs, checkpointBlock),
              "Watcher reorg rollback summary"
            );
            this._registry.setCheckpoint(this._checkpointKey, this._lastBlock);
            this._registry.setRollbackGuard(res.rollbackGuard);
            if (this.onReorg) {
              this.onReorg({
                reorgBlock,
                changedAddrs,
              });
            }
            continue;
          }
          this._registry.setRollbackGuard(res.rollbackGuard);
        }

        const logs = res.data?.logs ?? [];
        let changedAddrs = new Set();
        if (logs.length > 0) {
          changedAddrs = await this._handleLogs(logs);
        }

        const nextBlock = Number(res.nextBlock);
        const archiveHeight = Number(res.archiveHeight);
        const progress = watcherProgressMeta(
          nextBlock,
          this._lastBlock,
          archiveHeight,
          logs.length,
          res.shardSummary ?? null,
        );
        const checkpointBlock = progress.checkpointBlock;
        if (checkpointBlock > this._lastBlock) {
          this._lastBlock = checkpointBlock;
          this._registry.setCheckpoint(this._checkpointKey, this._lastBlock);
        }

        if (this.onBatch && changedAddrs.size > 0) {
          this.onBatch(changedAddrs);
        }

        if (
          progress.advancedBlocks > 0 ||
          progress.waitReason != null ||
          progress.constrainedBySlowestShardArchiveHeight
        ) {
          watcherLogger.info(progress, "Watcher poll progress");
        }

        if (logs.length === 0 || progress.caughtUp) {
          await this._sleep(WATCHER_IDLE_SLEEP_MS);
        }
      } catch (err: any) {
        if (!this._running) break;
        this._consecutivePollErrors += 1;
        const errorCategory = classifyWatcherPollError(err);
        if (errorCategory === "integrity") {
          this._consecutiveIntegrityPollErrors += 1;
        } else {
          this._consecutiveIntegrityPollErrors = 0;
        }
        const backoffMs = watcherErrorBackoffMs(err, this._consecutivePollErrors);
        watcherLogger.error(
          {
            ...watcherErrorBackoffMeta(err, this._consecutivePollErrors, backoffMs, this._lastBlock, errorCategory),
            consecutiveIntegrityPollErrors: this._consecutiveIntegrityPollErrors,
          },
          "HyperSync poll error"
        );
        if (
          errorCategory === "integrity" &&
          watcherShouldHaltAfterIntegrityError(this._consecutiveIntegrityPollErrors)
        ) {
          const haltMeta = watcherHaltMeta(
            err,
            this._consecutiveIntegrityPollErrors,
            WATCHER_MAX_CONSECUTIVE_INTEGRITY_ERRORS,
            this._lastBlock,
          );
          this._haltMeta = haltMeta;
          watcherLogger.error(
            haltMeta,
            "Watcher halted after repeated integrity failures"
          );
          this._running = false;
          this._closed = true;
          this.onHalt?.(haltMeta);
          this._wakeSleep();
          break;
        }
        await this._sleep(backoffMs);
      }
    }
  }

  async _handleLogs(logs: any) {
    const decoded = await this._decoder.decodeLogs(logs);
    return handleWatcherLogs({
      logs,
      decoded,
      registry: this._registry,
      cache: this._cache,
      closed: () => this._closed,
      topic0: WATCHER_TOPIC0,
      refreshBalancer: this._refreshBalancer.bind(this),
      refreshCurve: this._refreshCurve.bind(this),
      enqueueEnrichment: this._enqueueEnrichment.bind(this),
      commitStates: this._commitStates.bind(this),
    });
  }

  _enqueueEnrichment(addr: any, taskFn: any) {
    if (this._closed) return Promise.resolve();
    const pending = this._pendingEnrichment.get(addr);
    if (pending) {
      pending.dirty = true;
      return pending.promise;
    }

    const entry: { dirty: boolean; promise: any; epoch: number } = {
      dirty: false,
      promise: null,
      epoch: this._enrichmentEpoch,
    };
    entry.promise = (async () => {
      try {
        do {
          entry.dirty = false;
          if (this._closed || entry.epoch !== this._enrichmentEpoch) break;
          await taskFn(entry.epoch);
        } while (entry.dirty && !this._closed && entry.epoch === this._enrichmentEpoch);
      } finally {
        if (this._pendingEnrichment.get(addr) === entry) {
          this._pendingEnrichment.delete(addr);
        }
      }
    })();

    this._pendingEnrichment.set(addr, entry);
    return entry.promise;
  }

  async _refreshBalancer(addr: any, pool: any, expectedEpoch = this._enrichmentEpoch) {
    const { normalized } = await fetchAndNormalizeBalancerPool(pool);
    if (this._closed || expectedEpoch !== this._enrichmentEpoch) return;
    const state = this._mergeState(addr, normalized);
    this._commitState(addr, state, { blockNumber: this._lastBlock }, expectedEpoch);
  }

  async _refreshCurve(addr: any, pool: any, expectedEpoch = this._enrichmentEpoch) {
    const { normalized } = await fetchAndNormalizeCurvePool(pool);
    if (this._closed || expectedEpoch !== this._enrichmentEpoch) return;
    const state = this._mergeState(addr, normalized);
    this._commitState(addr, state, { blockNumber: this._lastBlock }, expectedEpoch);
  }

  _commitState(addr: any, state: any, rawLog: any, expectedEpoch = this._enrichmentEpoch) {
    if (this._closed || expectedEpoch !== this._enrichmentEpoch) return;
    commitWatcherState(this._cache, this._persistState.bind(this), addr, state, rawLog);
  }

  _commitStates(updates: any[], expectedEpoch = this._enrichmentEpoch) {
    if (this._closed || expectedEpoch !== this._enrichmentEpoch) return [];
    return commitWatcherStatesBatch(this._cache, this._persistStates.bind(this), updates);
  }

  _mergeState(addr: any, nextState: any) {
    return mergeWatcherState(this._cache, addr, nextState);
  }

  _persistState(addr: any, state: any, rawLog: any) {
    persistWatcherState(this._registry, addr, state, rawLog, this._lastBlock);
  }

  _persistStates(states: any[]) {
    persistWatcherStates(this._registry, states, this._lastBlock);
  }

  _reloadCacheFromRegistry() {
    const nextAddrs: any[] = reloadWatcherCache(this._registry, this._cache, this._pendingEnrichment) as unknown as any[];
    this._watchedAddresses = [...nextAddrs];
    this._watchedAddressSet = new Set(this._watchedAddresses);
    return nextAddrs;
  }

  _advanceEnrichmentEpoch() {
    this._enrichmentEpoch += 1;
    this._pendingEnrichment.clear();
    return this._enrichmentEpoch;
  }
}
