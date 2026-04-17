// @ts-nocheck
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
import { detectReorg } from "../reorg/detect.ts";
import { fetchAndNormalizeBalancerPool } from "./poll_balancer.ts";
import { fetchAndNormalizeCurvePool } from "./poll_curve.ts";
import {
  commitWatcherState,
  handleWatcherLogs,
  mergeWatcherState,
  persistWatcherState,
  reloadWatcherCache,
} from "./watcher_state_ops.ts";
import { parseAbiItem, encodeEventTopics } from "viem";
import { HYPERSYNC_BATCH_SIZE, HYPERSYNC_MAX_ADDRESS_FILTER } from "../config/index.ts";

const WATCHER_LOOKBACK_BLOCKS = 100;
const WATCHER_IDLE_SLEEP_MS = 1_000;
const WATCHER_ERROR_SLEEP_MS = 5_000;

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

const TOPICS = SIGNATURES.map((sig) => {
  const item = parseAbiItem(sig);
  return encodeEventTopics({ abi: [item], eventName: item.name })[0];
});

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

function watcherSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function watcherCheckpointFromNextBlock(nextBlock, currentLastBlock) {
  if (Number.isFinite(nextBlock) && nextBlock > 0) {
    return nextBlock - 1;
  }
  return Math.max(0, currentLastBlock);
}

export class StateWatcher {
  constructor(registry, stateCache) {
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

    this.onBatch = null;
    this.onReorg = null;
  }

  async start(fromBlock) {
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
        try {
          const height = Number(await client.getHeight());
          this._lastBlock = Math.max(0, height - WATCHER_LOOKBACK_BLOCKS);
          console.log(`[watcher] No checkpoint — starting from block ${this._lastBlock} (tip − ${WATCHER_LOOKBACK_BLOCKS})`);
        } catch {
          this._lastBlock = 0;
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

  async addPools(newAddresses) {
    if (!newAddresses || newAddresses.length === 0) return;

    const added = [];
    for (const address of newAddresses) {
      const addr = address.toLowerCase();
      if (this._watchedAddressSet.has(addr)) continue;
      this._watchedAddressSet.add(addr);
      added.push(addr);
    }
    if (added.length === 0) return;

    console.log(`[watcher] Adding ${added.length} new pool(s) to watcher filter.`);
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
    if (this._loopPromise) {
      await this._loopPromise.catch(() => {});
      this._loopPromise = null;
    }
  }

  get lastBlock() {
    return this._lastBlock;
  }

  _buildQuery() {
    // HyperSync enforces a 2 MB HTTP request-body limit.  Each address costs
    // ~44 bytes as a hex JSON string, so embedding more than
    // HYPERSYNC_MAX_ADDRESS_FILTER addresses would exceed that budget and
    // produce a 413 error.  Above the threshold we drop the address filter and
    // rely on topic-only filtering; _handleLogs already rejects events from
    // untracked contracts via registry.getPoolMeta(), so correctness is unaffected.
    const useAddressFilter =
      this._watchedAddresses.length > 0 &&
      this._watchedAddresses.length <= HYPERSYNC_MAX_ADDRESS_FILTER;

    const logFilter = useAddressFilter
      ? { address: this._watchedAddresses, topics: [TOPICS] }
      : { topics: [TOPICS] };

    return {
      fromBlock: this._lastBlock + 1,
      logs: [logFilter],
      maxNumLogs: HYPERSYNC_BATCH_SIZE,
      joinMode: JoinMode.JoinNothing,
      fieldSelection: {
        log: LOG_FIELDS,
        block: [BlockField.Number, BlockField.Timestamp],
      },
    };
  }

  async _loop() {
    const addrCount = this._watchedAddresses.length;
    const filterMode =
      addrCount === 0
        ? "topic-only (no pools yet)"
        : addrCount <= HYPERSYNC_MAX_ADDRESS_FILTER
          ? `${addrCount} pool address(es)`
          : `topic-only (${addrCount} pools — address filter exceeds 2 MB budget)`;
    console.log(
      `[watcher] Starting manual HyperSync loop from block ${this._lastBlock + 1} — ${filterMode}`
    );

    while (this._running) {
      try {
        const query = this._buildQuery();
        const res = await client.get(query);
        if (!this._running) break;

        if (res.rollbackGuard) {
          const reorgBlock = detectReorg(this._registry, res.rollbackGuard);
          if (reorgBlock !== false) {
            console.warn(`[watcher] Reorg detected at block ${reorgBlock}; rolling back registry state.`);
            const rb = this._registry.rollbackToBlock(reorgBlock);
            console.warn(`[watcher] Rolled back ${rb.poolsRemoved} pool(s), ${rb.statesRemoved} state row(s).`);
            this._lastBlock = Math.max(0, reorgBlock - 1);
            const changedAddrs = this._reloadCacheFromRegistry();
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
        if (!Number.isFinite(nextBlock)) {
          throw new Error(
            "HyperSync response did not include a finite nextBlock cursor; cannot advance watcher safely."
          );
        }
          const checkpointBlock = watcherCheckpointFromNextBlock(nextBlock, this._lastBlock);
        if (checkpointBlock > this._lastBlock) {
          this._lastBlock = checkpointBlock;
          this._registry.setCheckpoint(this._checkpointKey, this._lastBlock);
        }

        if (this.onBatch && changedAddrs.size > 0) {
          this.onBatch(changedAddrs);
        }

        const archiveHeight = Number(res.archiveHeight);
        const caughtUp =
          Number.isFinite(nextBlock) &&
          Number.isFinite(archiveHeight) &&
          nextBlock >= archiveHeight;

        if (logs.length === 0 || caughtUp) {
        await watcherSleep(WATCHER_IDLE_SLEEP_MS);
        }
      } catch (err) {
        if (!this._running) break;
        console.error(`[watcher] HyperSync poll error: ${err.message}`);
        await watcherSleep(WATCHER_ERROR_SLEEP_MS);
      }
    }
  }

  async _handleLogs(logs) {
    const decoded = await this._decoder.decodeLogs(logs);
    return handleWatcherLogs({
      logs,
      decoded,
      registry: this._registry,
      cache: this._cache,
      closed: () => this._closed,
      topics: TOPICS,
      refreshBalancer: this._refreshBalancer.bind(this),
      refreshCurve: this._refreshCurve.bind(this),
      enqueueEnrichment: this._enqueueEnrichment.bind(this),
      commitState: this._commitState.bind(this),
    });
  }

  _enqueueEnrichment(addr, taskFn) {
    const pending = this._pendingEnrichment.get(addr);
    if (pending) {
      pending.dirty = true;
      return pending.promise;
    }

    const entry = { dirty: false, promise: null };
    entry.promise = (async () => {
      try {
        do {
          entry.dirty = false;
          await taskFn();
        } while (entry.dirty && !this._closed);
      } finally {
        this._pendingEnrichment.delete(addr);
      }
    })();

    this._pendingEnrichment.set(addr, entry);
    return entry.promise;
  }

  async _refreshBalancer(addr, pool) {
    const { normalized } = await fetchAndNormalizeBalancerPool(pool);
    const state = this._mergeState(addr, normalized);
    this._commitState(addr, state, { blockNumber: this._lastBlock });
  }

  async _refreshCurve(addr, pool) {
    const { normalized } = await fetchAndNormalizeCurvePool(pool);
    const state = this._mergeState(addr, normalized);
    this._commitState(addr, state, { blockNumber: this._lastBlock });
  }

  _commitState(addr, state, rawLog) {
    commitWatcherState(this._cache, this._persistState.bind(this), addr, state, rawLog);
  }

  _mergeState(addr, nextState) {
    return mergeWatcherState(this._cache, addr, nextState);
  }

  _persistState(addr, state, rawLog) {
    persistWatcherState(this._registry, addr, state, rawLog, this._lastBlock);
  }

  _reloadCacheFromRegistry() {
    const nextAddrs = reloadWatcherCache(this._registry, this._cache, this._pendingEnrichment);
    this._watchedAddresses = [...nextAddrs];
    this._watchedAddressSet = new Set(this._watchedAddresses);
    return nextAddrs;
  }
}
