
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

import { client, LogField, Decoder, JoinMode } from "../hypersync/client.ts";
import {
  buildHyperSyncLogQuery,
  DEFAULT_HYPERSYNC_BLOCK_FIELDS,
} from "../hypersync/query_policy.ts";
import { compareHyperSyncLogs, hyperSyncLogIdentityKey } from "../hypersync/logs.ts";
import { topic0ForSignature } from "../hypersync/topics.ts";
import { detectReorg } from "../reorg/detect.ts";
import { fetchAndNormalizeBalancerPool } from "./poll_balancer.ts";
import { fetchAndNormalizeCurvePool } from "./poll_curve.ts";
import { fetchAndNormalizeDodoPool } from "./poll_dodo.ts";
import { fetchAndNormalizeWoofiPool } from "./poll_woofi.ts";
import { fetchV3PoolState } from "./uniswap_v3.ts";
import { parsePoolTokens } from "./pool_record.ts";
import { metadataWithRegistryTokenDecimals } from "./pool_metadata.ts";
import { normalizeV3State } from "./normalizer.ts";
import { normalizeProtocolKey } from "../protocols/classification.ts";
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
  HYPERSYNC_MAX_BLOCKS_PER_REQUEST,
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
const WATCHER_SHARD_TRANSIENT_RETRY_ATTEMPTS = 3;
const WATCHER_SHARD_TRANSIENT_RETRY_BASE_MS = 250;
const WATCHER_SHARD_ARCHIVE_HEIGHT_WARN_SPREAD = 25;
const WATCHER_ENRICHMENT_RETRY_BASE_MS = 30_000;
const WATCHER_ENRICHMENT_RETRY_MAX_MS = 300_000;

const V2_SYNC = "event Sync(uint112 reserve0, uint112 reserve1)";
const V3_SWAP = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
const V3_MINT = "event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)";
const V3_BURN = "event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)";
const BAL_BALANCE = "event PoolBalanceChanged(bytes32 indexed poolId, address indexed liquidityProvider, address[] tokens, int256[] deltas, uint256[] protocolFeeAmounts)";
const CURVE_EXCHANGE_STABLE = "event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)";
const CURVE_EXCHANGE_CRYPTO = "event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)";
const DODO_SWAP = "event DODOSwap(address fromToken, address toToken, uint256 fromAmount, uint256 toAmount, address trader, address receiver)";
const WOOFI_SWAP = "event WooSwap(address indexed fromToken, address indexed toToken, uint256 fromAmount, uint256 toAmount, address from, address indexed to, address rebateTo, uint256 swapVol, uint256 swapFee)";

const SIGNATURES = [
  V2_SYNC,
  V3_SWAP,
  V3_MINT,
  V3_BURN,
  BAL_BALANCE,
  CURVE_EXCHANGE_STABLE,
  CURVE_EXCHANGE_CRYPTO,
  DODO_SWAP,
  WOOFI_SWAP,
];

export const WATCHER_TOPIC0 = {
  V2_SYNC: topic0ForSignature(V2_SYNC),
  V3_SWAP: topic0ForSignature(V3_SWAP),
  V3_MINT: topic0ForSignature(V3_MINT),
  V3_BURN: topic0ForSignature(V3_BURN),
  BAL_BALANCE: topic0ForSignature(BAL_BALANCE),
  CURVE_EXCHANGE_STABLE: topic0ForSignature(CURVE_EXCHANGE_STABLE),
  CURVE_EXCHANGE_CRYPTO: topic0ForSignature(CURVE_EXCHANGE_CRYPTO),
  DODO_SWAP: topic0ForSignature(DODO_SWAP),
  WOOFI_SWAP: topic0ForSignature(WOOFI_SWAP),
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
  const aHeadBlock = Number(a?.block_number ?? a?.blockNumber);
  const bHeadBlock = Number(b?.block_number ?? b?.blockNumber);
  const aHeadHash = String(a?.block_hash ?? a?.blockHash ?? a?.hash ?? "");
  const bHeadHash = String(b?.block_hash ?? b?.blockHash ?? b?.hash ?? "");
  if (
    Number.isFinite(aHeadBlock) &&
    Number.isFinite(bHeadBlock) &&
    aHeadHash &&
    bHeadHash &&
    (aHeadBlock !== bHeadBlock || aHeadHash !== bHeadHash)
  ) {
    return false;
  }

  const aFirstBlock = Number(a?.first_block_number ?? a?.firstBlockNumber);
  const bFirstBlock = Number(b?.first_block_number ?? b?.firstBlockNumber);
  const aFirstParent = String(a?.first_parent_hash ?? a?.firstParentHash ?? "");
  const bFirstParent = String(b?.first_parent_hash ?? b?.firstParentHash ?? "");
  if (
    Number.isFinite(aFirstBlock) &&
    Number.isFinite(bFirstBlock) &&
    aFirstParent &&
    bFirstParent &&
    (aFirstBlock !== bFirstBlock || aFirstParent !== bFirstParent)
  ) {
    return false;
  }

  return true;
}

function isRollbackGuardMismatchError(error: unknown) {
  const message = String((error as { message?: string } | null | undefined)?.message ?? error ?? "").toLowerCase();
  return message.includes("mismatched rollback guards") || message.includes("inconsistent chain views");
}

function watcherShardRetryDelayMs(attempt: number) {
  return WATCHER_SHARD_TRANSIENT_RETRY_BASE_MS * Math.max(1, 2 ** Math.max(0, attempt));
}

function watcherShardFailureError(failures: Array<{ shardIndex: number; reason: unknown }>) {
  const detail = failures
    .map(({ shardIndex, reason }) => {
      const err = reason as { message?: string } | null | undefined;
      return `shard ${shardIndex}: ${String(err?.message ?? reason ?? "unknown error")}`;
    })
    .join("; ");
  const err: any = new Error(`Watcher shard request failed (${detail})`);
  err.name = "WatcherShardRequestError";
  err.shardFailures = failures.map(({ shardIndex, reason }) => {
    const err = reason as { message?: string; name?: string } | null | undefined;
    return {
      shardIndex,
      errorName: err?.name ?? null,
      error: String(err?.message ?? reason ?? "unknown error"),
    };
  });
  return err;
}

export function watcherShardArchiveHeightMeta(archiveHeights: Iterable<number>) {
  const heights = [...archiveHeights].filter(Number.isFinite).sort((a, b) => a - b);
  const min = heights.length > 0 ? heights[0] : null;
  const max = heights.length > 0 ? heights[heights.length - 1] : null;
  const spread = min != null && max != null ? max - min : 0;
  return {
    archiveHeights: heights,
    archiveHeightSpread: spread,
    logLevel: heights.length > 1 && spread > WATCHER_SHARD_ARCHIVE_HEIGHT_WARN_SPREAD ? "warn" : "debug",
  };
}

function mergeRollbackGuards(base: any, next: any) {
  if (!base) return next;
  if (!next) return base;
  const merged = { ...base, ...next } as Record<string, unknown>;
  const headBlock = next?.block_number ?? next?.blockNumber ?? base?.block_number ?? base?.blockNumber;
  const headHash = next?.block_hash ?? next?.blockHash ?? next?.hash ?? base?.block_hash ?? base?.blockHash ?? base?.hash;
  const firstBlock =
    next?.first_block_number ?? next?.firstBlockNumber ?? base?.first_block_number ?? base?.firstBlockNumber;
  const firstParent =
    next?.first_parent_hash ?? next?.firstParentHash ?? base?.first_parent_hash ?? base?.firstParentHash;

  if (headBlock != null) merged.block_number = headBlock;
  if (headHash != null) {
    merged.block_hash = headHash;
    merged.hash = headHash;
  }
  if (firstBlock != null) merged.first_block_number = firstBlock;
  if (firstParent != null) merged.first_parent_hash = firstParent;

  delete merged.blockNumber;
  delete merged.blockHash;
  delete merged.firstBlockNumber;
  delete merged.firstParentHash;

  return merged;
}

export function sortWatcherLogs(logs: any[]) {
  if (!Array.isArray(logs) || logs.length <= 1) return logs ?? [];
  return [...logs].sort(compareHyperSyncLogs);
}

export function dedupeWatcherLogs(logs: any[]) {
  if (!Array.isArray(logs) || logs.length <= 1) return logs ?? [];

  const seen = new Set<string>();
  const deduped = [];
  for (const log of logs) {
    const identity = hyperSyncLogIdentityKey(log);
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

function parseWatcherBlock(name: string, value: any) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error(`Watcher ${name} must be a finite non-negative safe integer.`);
  }
  return numeric;
}

function parseOptionalWatcherBlock(name: string, value: any) {
  if (value == null) return null;
  return parseWatcherBlock(name, value);
}

export function watcherCheckpointFromNextBlock(nextBlock: any, currentLastBlock: any, archiveHeight?: any) {
  const numericNextBlock = Number(nextBlock);
  if (!Number.isSafeInteger(numericNextBlock) || numericNextBlock < 0) {
    throw new Error("HyperSync response did not include a finite nextBlock cursor; cannot advance watcher safely.");
  }

  const numericCurrentLastBlock = parseWatcherBlock("currentLastBlock", currentLastBlock);
  const requestedFromBlock = numericCurrentLastBlock + 1;
  if (numericNextBlock < requestedFromBlock) {
    throw new Error(
      `HyperSync nextBlock cursor regressed from requested block ${requestedFromBlock} to ${numericNextBlock}; cannot advance watcher safely.`,
    );
  }

  const numericArchiveHeight = parseOptionalWatcherBlock("archiveHeight", archiveHeight);
  if (
    numericNextBlock === requestedFromBlock &&
    numericArchiveHeight == null
  ) {
    throw new Error(
      `HyperSync nextBlock cursor stalled at ${numericNextBlock} without archive height; cannot advance watcher safely.`,
    );
  }
  if (
    numericNextBlock === requestedFromBlock &&
    numericArchiveHeight != null &&
    numericArchiveHeight > requestedFromBlock
  ) {
    throw new Error(
      `HyperSync nextBlock cursor stalled at ${numericNextBlock} before archive height ${numericArchiveHeight}; cannot advance watcher safely.`,
    );
  }

  if (numericNextBlock > 0) {
    return numericNextBlock - 1;
  }
  return numericCurrentLastBlock;
}

export function watcherProgressMeta(
  nextBlock: any,
  currentLastBlock: any,
  archiveHeight: any,
  logCount = 0,
  shardSummary: { archiveHeights?: number[] | null } | null = null,
) {
  const numericNextBlock = parseWatcherBlock("nextBlock", nextBlock);
  const numericArchiveHeight = parseOptionalWatcherBlock("archiveHeight", archiveHeight);
  const numericCurrentLastBlock = parseWatcherBlock("currentLastBlock", currentLastBlock);
  const checkpointBlock = watcherCheckpointFromNextBlock(numericNextBlock, numericCurrentLastBlock, numericArchiveHeight);
  const requestedFromBlock = numericCurrentLastBlock + 1;
  const advancedBlocks = Math.max(0, checkpointBlock - numericCurrentLastBlock);
  const caughtUp =
    numericArchiveHeight != null &&
    numericNextBlock >= numericArchiveHeight;
  const hadLogs = Number(logCount) > 0;
  const archiveHeights = Array.isArray(shardSummary?.archiveHeights) && shardSummary.archiveHeights.length > 0
    ? [...shardSummary.archiveHeights].map((height) => parseWatcherBlock("shard archiveHeight", height))
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
    archiveHeight: numericArchiveHeight,
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
  const err = error as {
    message?: string;
    name?: string;
    poolAddress?: string;
    validationReason?: string;
    blockNumber?: number;
    transactionHash?: string;
    topic0?: string;
  } | null | undefined;
  return {
    error: String(err?.message ?? error ?? "Unknown watcher error"),
    errorName: err?.name ?? null,
    errorCategory,
    shardFailures: Array.isArray((err as any)?.shardFailures) ? (err as any).shardFailures : undefined,
    poolAddress: err?.poolAddress ?? undefined,
    validationReason: err?.validationReason ?? undefined,
    blockNumber: Number.isFinite(Number(err?.blockNumber)) ? Number(err?.blockNumber) : undefined,
    transactionHash: err?.transactionHash ?? undefined,
    topic0: err?.topic0 ?? undefined,
    consecutivePollErrors: Math.max(1, Number(consecutivePollErrors) || 1),
    backoffMs: Math.max(0, Number(backoffMs) || 0),
    currentLastBlock: Math.max(0, Number(currentLastBlock) || 0),
  };
}

export function classifyWatcherPollError(error: unknown) {
  const err = error as { message?: string; name?: string } | null | undefined;
  const name = String(err?.name ?? "").toLowerCase();
  const message = String(err?.message ?? error ?? "").toLowerCase();
  if (
    message.includes("mismatched rollback guards") ||
    message.includes("inconsistent chain views") ||
    message.includes("watcher shard request failed")
  ) {
    return "transient";
  }
  if (
    name === "watcherstateintegrityerror" ||
    name === "watcherstateupdateerror" ||
    message.includes("watcher state integrity failed") ||
    message.includes("watcher update failed") ||
    message.includes("invalid timestamp") ||
    message.includes("invalid watcher state")
  ) {
    return "integrity";
  }
  if (
    message.includes("did not include a finite nextblock cursor") ||
    message.includes("stalled at") ||
    message.includes("regressed from requested block") ||
    message.includes("incomplete shard metadata")
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
  private _enrichmentRetryState: Map<string, { attempts: number; nextRetryAt: number; lastReason: string }>;
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
    this._enrichmentRetryState = new Map();
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

  _resetRunState() {
    this._consecutivePollErrors = 0;
    this._consecutiveIntegrityPollErrors = 0;
    this._haltMeta = null;
  }

  async start(fromBlock: any) {
    if (this._running) return;
    this._running = true;
    this._closed = false;
    this._resetRunState();

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

    this._watchedAddresses = normalizeWatchedAddresses(Array.from(this._cache.keys()));
    this._watchedAddressSet = new Set(this._watchedAddresses);
    this._loopPromise = this._loop();
  }

  wait() {
    return this._loopPromise ?? Promise.resolve();
  }

  async addPools(newAddresses: any) {
    if (this._closed || !newAddresses || newAddresses.length === 0) return;

    const normalized = normalizeWatchedAddresses(Array.isArray(newAddresses) ? newAddresses : []);
    const added = [];
    for (const addr of normalized) {
      if (this._watchedAddressSet.has(addr)) continue;
      this._watchedAddressSet.add(addr);
      added.push(addr);
    }
    const rejectedCount = Array.isArray(newAddresses) ? Math.max(0, newAddresses.length - normalized.length) : 0;
    if (rejectedCount > 0) {
      watcherLogger.warn(
        { rejectedCount },
        "Rejected invalid watcher pool addresses while updating filter",
      );
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
    this._resetRunState();
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
        // Bound catch-up scans so resumed live polling stays within HyperSync's
        // documented request-time budget after downtime.
        maxNumBlocks: HYPERSYNC_MAX_BLOCKS_PER_REQUEST,
        joinMode: JoinMode.JoinNothing,
        logFields: LOG_FIELDS,
        blockFields: DEFAULT_HYPERSYNC_BLOCK_FIELDS,
      })
    );
  }

  async _pollOnce() {
    const queries = this._buildQueries();

    for (let attempt = 0; attempt < WATCHER_SHARD_TRANSIENT_RETRY_ATTEMPTS; attempt++) {
      const logs = [];
      let rollbackGuard = null;
      let nextBlock = Number.POSITIVE_INFINITY;
      let archiveHeight = Number.POSITIVE_INFINITY;
      const shardArchiveHeights = new Set<number>();

      try {
        const settled = await Promise.allSettled(queries.map((query) => client.get(query)));
        if (!this._running) {
          return null;
        }

        const failures = settled
          .map((result, shardIndex) => ({ result, shardIndex }))
          .filter((entry): entry is { result: PromiseRejectedResult; shardIndex: number } => entry.result.status === "rejected")
          .map(({ shardIndex, result }) => ({ shardIndex, reason: result.reason }));
        if (failures.length > 0) {
          throw watcherShardFailureError(failures);
        }

        const responses = settled
          .filter((result): result is PromiseFulfilledResult<any> => result.status === "fulfilled")
          .map((result) => result.value);

        for (const res of responses) {
          if (res.rollbackGuard) {
            if (!rollbackGuard) {
              rollbackGuard = res.rollbackGuard;
            } else if (!compareRollbackGuards(rollbackGuard, res.rollbackGuard)) {
              throw new Error("Watcher shard responses returned mismatched rollback guards; refusing to merge inconsistent chain views.");
            } else {
              rollbackGuard = mergeRollbackGuards(rollbackGuard, res.rollbackGuard);
            }
          }

          if (Array.isArray(res.data?.logs) && res.data.logs.length > 0) {
            logs.push(...res.data.logs);
          }

          let shardNextBlock;
          try {
            shardNextBlock = parseWatcherBlock("shard nextBlock cursor", res.nextBlock);
          } catch {
            throw new Error("Watcher shard response did not include a finite nextBlock cursor; cannot merge incomplete shard metadata.");
          }
          nextBlock = Math.min(nextBlock, shardNextBlock);

          const shardArchiveHeight = parseOptionalWatcherBlock("shard archiveHeight", res.archiveHeight);
          if (shardArchiveHeight != null) {
            archiveHeight = Math.min(archiveHeight, shardArchiveHeight);
            shardArchiveHeights.add(shardArchiveHeight);
          }
        }

        if (shardArchiveHeights.size > 1) {
          const archiveMeta = watcherShardArchiveHeightMeta(shardArchiveHeights);
          watcherLogger[archiveMeta.logLevel](
            archiveMeta,
            "Watcher shard responses returned different archive heights; using the slowest shard height",
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
      } catch (error) {
        if (
          (
            !isRollbackGuardMismatchError(error) &&
            classifyWatcherPollError(error) !== "transient"
          ) ||
          attempt + 1 >= WATCHER_SHARD_TRANSIENT_RETRY_ATTEMPTS ||
          !this._running
        ) {
          throw error;
        }
        await this._sleep(watcherShardRetryDelayMs(attempt));
      }
    }

    throw new Error("Watcher shard responses returned mismatched rollback guards; refusing to merge inconsistent chain views.");
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

  async _waitForHeightAdvance(targetNextBlock: any, knownArchiveHeight: any) {
    const numericTargetNextBlock = Number(targetNextBlock);
    let currentHeight = Number(knownArchiveHeight);

    if (
      !Number.isFinite(numericTargetNextBlock) ||
      !Number.isFinite(currentHeight) ||
      currentHeight >= numericTargetNextBlock
    ) {
      await this._sleep(WATCHER_IDLE_SLEEP_MS);
      return;
    }

    while (this._running && currentHeight < numericTargetNextBlock) {
      await this._sleep(WATCHER_IDLE_SLEEP_MS);
      if (!this._running) break;

      try {
        const nextHeight = Number(await client.getHeight());
        if (!Number.isFinite(nextHeight)) {
          break;
        }
        currentHeight = nextHeight;
      } catch {
        break;
      }
    }
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
            const checkpointBlock = Math.max(0, reorgBlock - 1);
            const rb = this._registry.rollbackWatcherState
              ? this._registry.rollbackWatcherState(this._checkpointKey, reorgBlock, res.rollbackGuard)
              : (() => {
                  const rollbackResult = this._registry.rollbackToBlock(reorgBlock);
                  this._registry.setCheckpoint(this._checkpointKey, checkpointBlock);
                  this._registry.setRollbackGuard(res.rollbackGuard);
                  return rollbackResult;
                })();
            this._lastBlock = checkpointBlock;
            const changedAddrs = this._reloadCacheFromRegistry();
            watcherLogger.warn(
              watcherReorgMeta(reorgBlock, rb, changedAddrs, checkpointBlock),
              "Watcher reorg rollback summary"
            );
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

        const progress = watcherProgressMeta(
          res.nextBlock,
          this._lastBlock,
          res.archiveHeight,
          logs.length,
          res.shardSummary ?? null,
        );
        const checkpointBlock = progress.checkpointBlock;
        if (checkpointBlock > this._lastBlock) {
          this._lastBlock = checkpointBlock;
          if (this._registry.commitWatcherProgress) {
            this._registry.commitWatcherProgress(this._checkpointKey, this._lastBlock, res.rollbackGuard ?? null);
          } else {
            this._registry.setCheckpoint(this._checkpointKey, this._lastBlock);
            if (res.rollbackGuard) {
              this._registry.setRollbackGuard(res.rollbackGuard);
            }
          }
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
          if (progress.caughtUp) {
            await this._waitForHeightAdvance(progress.nextBlock, progress.archiveHeight);
          } else {
            await this._sleep(WATCHER_IDLE_SLEEP_MS);
          }
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
          errorCategory === "integrity" ? "Watcher integrity error" : "HyperSync poll error"
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
      refreshDodo: this._refreshDodo.bind(this),
      refreshWoofi: this._refreshWoofi.bind(this),
      refreshV3: this._refreshV3.bind(this),
      enqueueEnrichment: this._enqueueEnrichment.bind(this),
      commitStates: this._commitStates.bind(this),
    });
  }

  _enqueueEnrichment(addr: any, taskFn: any) {
    if (this._closed) return Promise.resolve();
    const normalizedAddr = String(addr ?? "").toLowerCase();
    const retryState = this._enrichmentRetryState.get(normalizedAddr);
    const now = Date.now();
    if (retryState && retryState.nextRetryAt > now) {
      watcherLogger.debug(
        {
          poolAddress: normalizedAddr,
          retryInMs: retryState.nextRetryAt - now,
          attempts: retryState.attempts,
          lastReason: retryState.lastReason,
        },
        "Watcher enrichment refresh in cooldown"
      );
      return Promise.resolve();
    }

    const pending = this._pendingEnrichment.get(normalizedAddr);
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
          this._clearEnrichmentRetry(normalizedAddr);
        } while (entry.dirty && !this._closed && entry.epoch === this._enrichmentEpoch);
      } catch (err: any) {
        this._recordEnrichmentRetry(normalizedAddr, err);
      } finally {
        if (this._pendingEnrichment.get(normalizedAddr) === entry) {
          this._pendingEnrichment.delete(normalizedAddr);
        }
      }
    })();

    this._pendingEnrichment.set(normalizedAddr, entry);
    return entry.promise;
  }

  _recordEnrichmentRetry(addr: string, error: any) {
    const current = this._enrichmentRetryState.get(addr);
    const attempts = (current?.attempts ?? 0) + 1;
    const cooldownMs = Math.min(
      WATCHER_ENRICHMENT_RETRY_BASE_MS * Math.max(1, 2 ** (attempts - 1)),
      WATCHER_ENRICHMENT_RETRY_MAX_MS,
    );
    const lastReason = String(error?.message ?? error ?? "unknown enrichment error");
    this._enrichmentRetryState.set(addr, {
      attempts,
      nextRetryAt: Date.now() + cooldownMs,
      lastReason,
    });
    watcherLogger.warn(
      {
        poolAddress: addr,
        attempts,
        cooldownMs,
        error: lastReason,
      },
      "Watcher enrichment refresh failed; entering cooldown"
    );
  }

  _clearEnrichmentRetry(addr: string) {
    this._enrichmentRetryState.delete(addr);
  }

  async _refreshBalancer(addr: any, pool: any, expectedEpoch = this._enrichmentEpoch) {
    const tokens = parsePoolTokens(pool?.tokens);
    const tokenDecimals = this._registry?.getTokenDecimals?.(tokens) ?? null;
    const { normalized } = await fetchAndNormalizeBalancerPool(pool, { tokenDecimals });
    if (this._closed || expectedEpoch !== this._enrichmentEpoch) return;
    const state = this._mergeState(addr, normalized);
    this._commitState(addr, state, { blockNumber: this._lastBlock }, expectedEpoch);
  }

  async _refreshCurve(addr: any, pool: any, expectedEpoch = this._enrichmentEpoch) {
    const tokens = parsePoolTokens(pool?.tokens);
    const tokenDecimals = this._registry?.getTokenDecimals?.(tokens) ?? null;
    const { normalized } = await fetchAndNormalizeCurvePool(pool, { tokenDecimals });
    if (this._closed || expectedEpoch !== this._enrichmentEpoch) return;
    const state = this._mergeState(addr, normalized);
    this._commitState(addr, state, { blockNumber: this._lastBlock }, expectedEpoch);
  }

  async _refreshDodo(addr: any, pool: any, expectedEpoch = this._enrichmentEpoch) {
    const tokens = parsePoolTokens(pool?.tokens);
    const tokenDecimals = this._registry?.getTokenDecimals?.(tokens) ?? null;
    const { normalized } = await fetchAndNormalizeDodoPool(pool, { tokenDecimals });
    if (this._closed || expectedEpoch !== this._enrichmentEpoch) return;
    const state = this._mergeState(addr, normalized);
    this._commitState(addr, state, { blockNumber: this._lastBlock }, expectedEpoch);
  }

  async _refreshWoofi(addr: any, pool: any, expectedEpoch = this._enrichmentEpoch) {
    const tokens = parsePoolTokens(pool?.tokens);
    const tokenDecimals = this._registry?.getTokenDecimals?.(tokens) ?? null;
    const { normalized } = await fetchAndNormalizeWoofiPool(pool, { tokenDecimals });
    if (this._closed || expectedEpoch !== this._enrichmentEpoch) return;
    const state = this._mergeState(addr, normalized);
    this._commitState(addr, state, { blockNumber: this._lastBlock }, expectedEpoch);
  }

  async _refreshV3(addr: any, pool: any, rawLog: any = null, expectedEpoch = this._enrichmentEpoch) {
    const tokens = parsePoolTokens(pool?.tokens);
    const metadata = metadataWithRegistryTokenDecimals(this._registry, pool, tokens);
    const protocol = normalizeProtocolKey(pool?.protocol);
    const rawState = await fetchV3PoolState(addr, {
      isAlgebra: protocol === "QUICKSWAP_V3" || metadata?.isAlgebra === true,
      isKyberElastic: protocol === "KYBERSWAP_ELASTIC" || metadata?.isKyberElastic === true,
      hydrationMode: "nearby",
    });
    const normalized = normalizeV3State(addr, protocol, tokens, rawState, metadata);
    if (this._closed || expectedEpoch !== this._enrichmentEpoch) return;
    const state = this._mergeState(addr, normalized);
    this._commitState(addr, state, rawLog ?? { blockNumber: this._lastBlock }, expectedEpoch);
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
    const nextAddrs = normalizeWatchedAddresses(
      reloadWatcherCache(this._registry, this._cache, this._pendingEnrichment) as unknown as any[],
    );
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
