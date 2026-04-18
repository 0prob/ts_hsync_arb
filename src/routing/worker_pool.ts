
/**
 * src/routing/worker_pool.ts — Persistent worker thread pool for route simulation
 *
 * Eliminates the per-call Worker spawn overhead (~100–200 ms) by keeping
 * N worker threads alive and distributing work via message passing.
 *
 * Usage:
 *   import { workerPool } from "./worker_pool.ts";
 *
 *   // Pool auto-inits on first use (main thread only)
 *   const results = await workerPool.evaluate(paths, stateCache, testAmount, options);
 *
 * The pool self-heals: a crashed worker is replaced within one event loop tick.
 */

import { Worker, isMainThread } from "worker_threads";
import { WORKER_COUNT } from "../config/index.ts";
import { logger } from "../utils/logger.ts";
import { toFiniteNumber as normaliseLogWeight } from "../util/bigint.ts";

const WORKER_URL = new URL("./persistent_worker.ts", import.meta.url);
const WORKER_EXEC_ARGV = [...process.execArgv, '--import', 'tsx'];
const workerLogger = logger.child({ component: "worker_pool" });

function buildChunkStateObject(paths: any, stateCache: any) {
  const stateObj: Record<string, any> = {};
  const seenPools = new Set();

  for (const path of paths) {
    for (const edge of path.edges) {
      const poolAddress = edge.poolAddress;
      if (seenPools.has(poolAddress)) continue;
      seenPools.add(poolAddress);

      const state = stateCache.get(poolAddress);
      if (state) {
        stateObj[poolAddress] = state;
      }
    }
  }

  return stateObj;
}

function getStateVersion(state: any) {
  return Number(state?.timestamp ?? -1);
}

function buildEvaluationChunks(paths: any[], workerCount: any) {
  if (paths.length === 0) return [];
  const chunkCount = Math.max(1, Math.min(workerCount, paths.length));
  if (chunkCount === 1) return [paths];

  const byToken = new Map();
  for (const path of paths) {
    const token = path.startToken.toLowerCase();
    if (!byToken.has(token)) byToken.set(token, []);
    byToken.get(token).push(path);
  }

  const groups = [...byToken.values()]
    .map((group) => ({
      paths: group,
      pools: new Set(group.flatMap((path) => path.edges.map((edge) => edge.poolAddress))),
    }))
    .sort((a, b) => b.paths.length - a.paths.length);

  const chunks: { paths: any[], pools: Set<any> }[] = Array.from({ length: chunkCount }, () => ({
    paths: [] as any[],
    pools: new Set(),
  }));

  for (const group of groups) {
    let bestChunk = chunks[0];
    let bestScore = Infinity;

    for (const chunk of chunks) {
      let overlap = 0;
      for (const pool of group.pools) {
        if (chunk.pools.has(pool)) overlap++;
      }

      const projectedSize = chunk.paths.length + group.paths.length;
      const score = projectedSize - overlap * 0.5;
      if (score < bestScore) {
        bestScore = score;
        bestChunk = chunk;
      }
    }

    bestChunk.paths.push(...group.paths);
    for (const pool of group.pools) bestChunk.pools.add(pool);
  }

  return chunks
    .map((chunk) => chunk.paths)
    .filter((chunk) => chunk.length > 0);
}

function summariseChunkPools(chunk: any[]) {
  const pools = new Set();
  for (const path of chunk) {
    for (const edge of path.edges) pools.add(edge.poolAddress);
  }
  return pools;
}

function summariseEvaluationChunks(chunks: any[]) {
  const chunkPoolSets = chunks.map((chunk) => summariseChunkPools(chunk));
  const pathCounts = chunks.map((chunk) => chunk.length);
  const uniquePoolCounts = chunkPoolSets.map((poolSet) => poolSet.size);
  let sharedPoolPairs = 0;
  let sharedPoolCount = 0;

  for (let i = 0; i < chunkPoolSets.length; i++) {
    for (let j = i + 1; j < chunkPoolSets.length; j++) {
      let overlap = 0;
      const smaller = chunkPoolSets[i].size <= chunkPoolSets[j].size ? chunkPoolSets[i] : chunkPoolSets[j];
      const larger = smaller === chunkPoolSets[i] ? chunkPoolSets[j] : chunkPoolSets[i];
      for (const pool of smaller) {
        if (larger.has(pool)) overlap++;
      }
      if (overlap > 0) {
        sharedPoolPairs++;
        sharedPoolCount += overlap;
      }
    }
  }

  return {
    chunkCount: chunks.length,
    pathCounts,
    uniquePoolCounts,
    sharedPoolPairs,
    sharedPoolCount,
  };
}

function serialisedPathKey(path: any) {
  return [
    path.startToken.toLowerCase(),
    ...path.poolAddresses.map((poolAddress, i) =>
      `${poolAddress.toLowerCase()}:${path.zeroForOnes[i] ? "1" : "0"}`
    ),
  ].join("|");
}

function serialiseEvaluationPath(path: any) {
  return {
    serialisedKey: [
      path.startToken.toLowerCase(),
      ...path.edges.map((edge) =>
        `${edge.poolAddress.toLowerCase()}:${edge.zeroForOne ? "1" : "0"}`
      ),
    ].join("|"),
    startToken: path.startToken,
    hopCount: path.hopCount,
    logWeight: path.logWeight,
    cumulativeFeesBps: path.cumulativeFeesBps,
    edges: path.edges.map((edge) => ({
      poolAddress: edge.poolAddress,
      tokenOut: edge.tokenOut,
      protocol: edge.protocol,
      zeroForOne: edge.zeroForOne,
      fee: edge.fee,
    })),
  };
}

function serialiseEvaluationPaths(paths: any[]) {
  return paths.map((path) => serialiseEvaluationPath(path));
}

function rehydrateEvaluationResults(results: any[], originalPathsByKey: any) {
  return results
    .map(({ path, result }) => {
      const originalPath = originalPathsByKey.get(path.serialisedKey);
      if (!originalPath) return null;
      return { path: originalPath, result };
    })
    .filter(Boolean);
}

// ─── WorkerPool ───────────────────────────────────────────────

class WorkerPool {
  private _size: number;
  private _slots: any[];
  private _queue: any[];
  private _pending: Map<number, any>;
  private _nextId: number;
  private _initialized: boolean;
  private _terminating: boolean;

  constructor(size: number) {
    this._size = Math.max(1, size);
    this._slots = [];
    this._queue = [];
    this._pending = new Map();
    this._nextId = 0;
    this._initialized = false;
    this._terminating = false;
  }

  // ─── Lifecycle ─────────────────────────────────────────────

  /**
   * Spawn all workers.  Safe to call multiple times; no-op after first.
   * Only runs in the main thread.
   */
  init() {
    if (this._initialized || this._terminating || !isMainThread) return;
    this._initialized = true;
    for (let i = 0; i < this._size; i++) {
      this._spawnSlot(i);
    }
    logger.debug(`[worker_pool] Initialized ${this._size} persistent workers`);
  }

  /**
   * Terminate all workers gracefully.
   */
  async terminate() {
    this._terminating = true;
    for (const { worker } of this._slots) {
      await worker.terminate().catch(() => {});
    }
    this._slots = [];
    this._queue = [];
    this._pending.clear();
    this._initialized = false;
    this._terminating = false;
  }

  // ─── Core API ──────────────────────────────────────────────

  /**
   * Evaluate a batch of paths across the pool.
   *
   * Splits paths into equal chunks, one per worker, and merges results.
   *
   * @param {import('./finder.ts').ArbPath[]}  paths
   * @param {Map<string,object>}               stateCache
   * @param {bigint}                           testAmount
   * @param {object}                           [options]
   * @returns {Promise<Array<{path,result}>>}  Profitable paths, sorted by profit desc
   */
  async evaluate(paths: any, stateCache: any, testAmount: any, options: any = {}) {
    if (!this._initialized) this.init();

    const chunks = buildEvaluationChunks(paths, this._size);
    if (workerLogger.isLevelEnabled("debug")) {
      workerLogger.debug(
        {
          event: "evaluate_chunk_summary",
          totalPaths: paths.length,
          ...summariseEvaluationChunks(chunks),
        },
        "[worker_pool] Evaluation chunk summary"
      );
    }

    const amountStr = testAmount.toString();
    const serialisedChunks = chunks.map((chunk) => serialiseEvaluationPaths(chunk));
    const originalPathMaps = chunks.map((chunk, index) => {
      const byKey = new Map();
      for (let i = 0; i < chunk.length; i++) {
        byKey.set(serialisedChunks[index][i].serialisedKey, chunk[i]);
      }
      return byKey;
    });

    // When enough idle workers are available, target fixed slots and keep a
    // persistent worker-side state mirror, sending only changed pool states.
    // Only requires as many idle slots as there are chunks, not all slots.
    const idleEvalSlots = this._slots.filter(s => s && !s.busy);
    const canUsePersistentMirror =
      this._queue.length === 0 &&
      idleEvalSlots.length >= chunks.length;

    const chunkPromises = canUsePersistentMirror
      ? chunks.map((chunk, i) =>
          this._evaluateOnSlot(
            idleEvalSlots[i],
            chunk,
            serialisedChunks[i],
            stateCache,
            amountStr,
            options
          ).then((results) => rehydrateEvaluationResults(results, originalPathMaps[i]))
        )
      : chunks.map((chunk, i) =>
          this._submit({
            type: "EVALUATE",
            paths: serialisedChunks[i],
            stateObj: buildChunkStateObject(chunk, stateCache),
            testAmount: amountStr,
            options,
          }).then((results) => rehydrateEvaluationResults(results, originalPathMaps[i]))
        );

    const chunkResults = await Promise.all(chunkPromises);
    const all = chunkResults.flat();

    // Re-sort merged results (each chunk is already sorted but merging loses order)
    all.sort((a, b) => {
      const pA = typeof a.result.profit === "bigint" ? a.result.profit : BigInt(a.result.profit);
      const pB = typeof b.result.profit === "bigint" ? b.result.profit : BigInt(b.result.profit);
      return pB > pA ? 1 : pB < pA ? -1 : 0;
    });

    return all;
  }

  // ─── Enumeration API ───────────────────────────────────────

  /**
   * Enumerate arbitrage paths across workers in parallel.
   *
   * Splits `startTokens` into equal chunks (one per worker) and runs
   * findArbPaths on the serialised topology graph in each worker.
   * Returns serialised path descriptors; the caller resolves full edges
   * from the live graph using poolAddresses + zeroForOnes.
   *
   * Falls back to synchronous enumeration when pool has < 2 workers or
   * only one start token.
   *
   * @param {Object.<string,Array>} adjacency  Output of serializeTopology()
   * @param {string[]}              startTokens  Token addresses to search from
   * @param {object}                [options]    findArbPaths options
   * @returns {Promise<Array>}  Serialised path descriptors from all workers
   */
  async enumerate(adjacency: any, startTokens: any, options: any = {}) {
    if (!this._initialized) this.init();

    if (startTokens.length === 0) return [];

    const { topologyKey = null, ...enumerateOptions } = options;

    // Below threshold or single worker: run inline to avoid IPC overhead
    if (startTokens.length < 2 || this._size < 2) {
      const { deserializeTopology } = await import("./graph.ts");
      const { findArbPaths }        = await import("./finder.ts");
      const graph = deserializeTopology(adjacency);
      const paths = findArbPaths(graph, startTokens, enumerateOptions);
      return paths.map((p) => ({
        startToken:        p.startToken,
        hopCount:          p.hopCount,
        logWeight:         p.logWeight,
        cumulativeFeesBps: p.cumulativeFeesBps,
        poolAddresses:     p.edges.map((e) => e.poolAddress),
        zeroForOnes:       p.edges.map((e) => e.zeroForOne),
      }));
    }

    // Split tokens across workers
    const chunkSize = Math.ceil(startTokens.length / this._size);
    const chunks    = [];
    for (let i = 0; i < startTokens.length; i += chunkSize) {
      chunks.push(startTokens.slice(i, i + chunkSize));
    }

    const idleEnumSlots = this._slots.filter(s => s && !s.busy);
    const canUsePersistentTopology =
      Boolean(topologyKey) &&
      this._queue.length === 0 &&
      idleEnumSlots.length >= chunks.length;

    const results = await Promise.all(
      canUsePersistentTopology
        ? chunks.map((tokenChunk, i) =>
            this._enumerateOnSlot(
              idleEnumSlots[i],
              adjacency,
              topologyKey,
              tokenChunk,
              enumerateOptions
            )
          )
        : chunks.map((tokenChunk) =>
            this._submit({
              type: "ENUMERATE",
              adjacency,
              startTokens: tokenChunk,
              options: enumerateOptions,
            })
          )
    );

    // Merge and deduplicate by ordered route key
    const seen  = new Set();
    const all   = [];
    for (const chunk of results) {
      for (const p of chunk) {
        const key = serialisedPathKey(p);
        if (!seen.has(key)) { seen.add(key); all.push(p); }
      }
    }

    // Sort by logWeight ascending (most negative first)
    all.sort((a, b) => normaliseLogWeight(a.logWeight) - normaliseLogWeight(b.logWeight));
    return all;
  }

  // ─── Internal ──────────────────────────────────────────────

  /**
   * Submit one chunk to an idle worker (or queue if all are busy).
   * @returns {Promise<Array>}
   */
  _submit(data: any) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      this._pending.set(id, { resolve, reject, slot: null });

      const idle = this._slots.find((s) => !s.busy);
      if (idle) {
        this._dispatchToSlot(idle, id, data);
      } else {
        this._queue.push({ id, data });
      }
    });
  }

  _submitToSlot(slot: any, data: any) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      this._pending.set(id, { resolve, reject, slot: null });
      this._dispatchToSlot(slot, id, data);
    });
  }

  _dispatchToSlot(slot: any, id: any, data: any) {
    const pending = this._pending.get(id);
    if (pending) pending.slot = slot;
    slot.busy = true;
    slot.currentJobId = id;
    slot.worker.postMessage({ id, ...data });
  }

  async _evaluateOnSlot(slot: any, chunk: any, serialisedChunk: any, stateCache: any, amountStr: any, options: any) {
    const { delta: stateDeltaObj, count } = this._buildStateDelta(
      chunk,
      stateCache,
      slot.syncedStateVersions
    );

    if (workerLogger.isLevelEnabled("debug")) {
      workerLogger.debug(
        {
          event: "evaluate_slot_delta",
          slotIndex: this._slots.indexOf(slot),
          chunkPaths: chunk.length,
          deltaPools: count,
        },
        "[worker_pool] Evaluation slot delta"
      );
    }

    if (count > 0) {
      await this._submitToSlot(slot, { type: "SYNC_STATE", stateObj: stateDeltaObj });
      for (const [poolAddress, state] of Object.entries(stateDeltaObj)) {
        slot.syncedStateVersions.set(poolAddress, getStateVersion(state));
      }
    }

    return this._submitToSlot(slot, {
      type: "EVALUATE",
      paths: serialisedChunk,
      testAmount: amountStr,
      options,
    });
  }

  async _enumerateOnSlot(slot: any, adjacency: any, topologyKey: any, startTokens: any, options: any) {
    if (slot.syncedTopologyKey !== topologyKey) {
      await this._submitToSlot(slot, {
        type: "SYNC_TOPOLOGY",
        adjacency,
        topologyKey,
      });
      slot.syncedTopologyKey = topologyKey;
    }

    return this._submitToSlot(slot, {
      type: "ENUMERATE",
      startTokens,
      options,
    });
  }

  _buildStateDelta(paths: any, stateCache: any, syncedStateVersions: any) {
    const delta = {};
    let count = 0;
    const seenPools = new Set();

    for (const path of paths) {
      for (const edge of path.edges) {
        const poolAddress = edge.poolAddress;
        if (seenPools.has(poolAddress)) continue;
        seenPools.add(poolAddress);

        const state = stateCache.get(poolAddress);
        if (!state) continue;

        const version = getStateVersion(state);
        const syncedVersion = syncedStateVersions.get(poolAddress);
        if (syncedVersion !== version) {
          delta[poolAddress] = state;
          count++;
        }
      }
    }

    return { delta, count };
  }

  /**
   * Spawn (or respawn) a worker at slot index i.
   */
  _spawnSlot(i: any) {
    if (this._terminating) return;

    const worker = new Worker(WORKER_URL, {
      execArgv: WORKER_EXEC_ARGV,
    });
    const slot = {
      worker,
      busy: false,
      currentJobId: null,
      syncedStateVersions: new Map(),
      syncedTopologyKey: null,
    };

    worker.on("message", ({ id, type, profitable, paths, error }) => {
      const pending = this._pending.get(id);
      if (pending) {
        this._pending.delete(id);
        if (error) pending.reject(new Error(error));
        else if (type === "ENUMERATE") pending.resolve(paths);
        else if (type === "SYNC_TOPOLOGY") pending.resolve(true);
        else if (type === "SYNC_STATE") pending.resolve(true);
        else pending.resolve(profitable);
      }
      // Mark idle and process queue
      slot.busy = false;
      slot.currentJobId = null;
      this._drainQueue(slot);
    });

    worker.on("error", (err) => {
      logger.warn(`[worker_pool] Worker ${i} error: ${err.message} — respawning`);
      this._rejectSlotPending(slot);
      // Replace in slots array
      const idx = this._slots.indexOf(slot);
      if (idx !== -1) this._slots[idx] = { worker: null, busy: false, currentJobId: null }; // placeholder
      this._spawnSlot(i);
    });

    worker.on("exit", (code) => {
      if (code !== 0 && !this._terminating) {
        logger.warn(`[worker_pool] Worker ${i} exited (code ${code}) — respawning`);
        this._rejectSlotPending(slot);
        const idx = this._slots.indexOf(slot);
        if (idx !== -1) this._slots[idx] = { worker: null, busy: false, currentJobId: null };
        setTimeout(() => this._spawnSlot(i), 50);
      }
    });

    if (this._slots[i]) {
      this._slots[i] = slot;
    } else {
      this._slots.push(slot);
    }
    // Pick up any queued work immediately after spawn / respawn.
    this._drainQueue(slot);
  }

  _drainQueue(slot: any) {
    if (this._queue.length === 0) return;
    const { id, data } = this._queue.shift();
    this._dispatchToSlot(slot, id, data);
  }

  _rejectSlotPending(slot: any) {
    slot.busy = false;
    const currentJobId = slot.currentJobId;
    slot.currentJobId = null;
    slot.syncedStateVersions.clear();
    slot.syncedTopologyKey = null;
    if (currentJobId == null) return;

    const pending = this._pending.get(currentJobId);
    if (pending) {
      pending.reject(new Error("[worker_pool] Worker crashed during evaluation"));
      this._pending.delete(currentJobId);
    }
  }

  /** Number of paths currently queued or in-flight */
  get queueDepth() { return this._queue.length + this._pending.size; }

  /** Pool size */
  get size() { return this._size; }
}

// ─── Singleton ─────────────────────────────────────────────────

export const workerPool = new WorkerPool(WORKER_COUNT);
