
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
import { routeIdentityFromEdges, routeIdentityFromSerializedPath } from "./route_identity.ts";

const WORKER_URL = new URL("./persistent_worker.ts", import.meta.url);
const WORKER_EXEC_ARGV = [...process.execArgv, '--import', 'tsx'];
const workerLogger: any = logger.child({ component: "worker_pool" });
const STARTUP_OOM_FAILURE_LIMIT = 3;

type PathLike = {
  startToken: string;
  hopCount: number;
  logWeight: unknown;
  cumulativeFeesBps?: number;
  edges: Array<{
    poolAddress: string;
    tokenIn: string;
    tokenOut: string;
    protocol: string;
    tokenInIdx?: number;
    tokenOutIdx?: number;
    zeroForOne: boolean;
    fee?: number | null;
  }>;
};

type SerializedEvaluationPath = {
  serialisedKey: string;
  startToken: string;
  hopCount: number;
  logWeight: unknown;
  cumulativeFeesBps?: number;
  edges: Array<{
    poolAddress: string;
    tokenIn: string;
    tokenOut: string;
    protocol: string;
    tokenInIdx?: number;
    tokenOutIdx?: number;
    zeroForOne: boolean;
    fee?: number | null;
  }>;
};

type SerializedEnumeratedPath = {
  startToken: string;
  hopCount: number;
  logWeight: unknown;
  cumulativeFeesBps?: number;
  poolAddresses: string[];
  tokenIns: string[];
  tokenOuts: string[];
  zeroForOnes: boolean[];
};

type EvaluationResult = { path: SerializedEvaluationPath; result: { profit: bigint | string } };
type WorkerStateMap = Map<string, Record<string, any>>;
type WorkerPayload = Record<string, any>;
type QueueItem = { id: number; data: WorkerPayload };
type WorkerSlot = {
  worker: Worker | null;
  busy: boolean;
  currentJobId: number | null;
  syncedStateVersions: Map<string, number>;
  syncedPoolAddresses: Set<string>;
  syncedTopologyKey: string | null;
  respawnTimer: NodeJS.Timeout | null;
  startupFailures: number;
  disabled: boolean;
};
type PendingJob = {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
  slot: WorkerSlot | null;
};

function isUsableSlot(slot: WorkerSlot | null | undefined): slot is WorkerSlot {
  return slot != null && slot.worker != null && !slot.busy;
}

function buildChunkStateObject(paths: PathLike[], stateCache: WorkerStateMap) {
  const stateObj: Record<string, any> = {};
  const seenPools = new Set<string>();

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

function collectChunkPoolAddresses(paths: PathLike[]) {
  const seenPools = new Set<string>();
  for (const path of paths) {
    for (const edge of path.edges) {
      seenPools.add(edge.poolAddress);
    }
  }
  return [...seenPools];
}

function samePoolAddressSet(left: Set<string>, right: string[]) {
  if (left.size !== right.length) return false;
  for (const poolAddress of right) {
    if (!left.has(poolAddress)) return false;
  }
  return true;
}

function getStateVersion(state: Record<string, any> | undefined) {
  return Number(state?.timestamp ?? -1);
}

function buildEvaluationChunks(paths: PathLike[], workerCount: number): PathLike[][] {
  if (paths.length === 0) return [];
  const chunkCount = Math.max(1, Math.min(workerCount, paths.length));
  if (chunkCount === 1) return [paths];

  const byToken = new Map<string, PathLike[]>();
  for (const path of paths) {
    const token = path.startToken.toLowerCase();
    if (!byToken.has(token)) byToken.set(token, []);
    byToken.get(token)!.push(path);
  }

  const groups = [...byToken.values()]
    .map((group) => ({
      paths: group,
      pools: new Set<string>(group.flatMap((path) => path.edges.map((edge) => edge.poolAddress))),
    }))
    .sort((a, b) => b.paths.length - a.paths.length);

  const chunks: { paths: PathLike[]; pools: Set<string> }[] = Array.from({ length: chunkCount }, () => ({
    paths: [],
    pools: new Set<string>(),
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

function summariseChunkPools(chunk: PathLike[]) {
  const pools = new Set<string>();
  for (const path of chunk) {
    for (const edge of path.edges) pools.add(edge.poolAddress);
  }
  return pools;
}

function summariseEvaluationChunks(chunks: PathLike[][]) {
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

function serialisedPathKey(path: SerializedEnumeratedPath) {
  return routeIdentityFromSerializedPath(
    path.startToken,
    path.poolAddresses,
    path.tokenIns,
    path.tokenOuts,
  );
}

function serialiseEvaluationPath(path: PathLike): SerializedEvaluationPath {
  return {
    serialisedKey: routeIdentityFromEdges(path.startToken, path.edges),
    startToken: path.startToken,
    hopCount: path.hopCount,
    logWeight: path.logWeight,
    cumulativeFeesBps: path.cumulativeFeesBps,
    edges: path.edges.map((edge) => ({
      poolAddress: edge.poolAddress,
      tokenIn: edge.tokenIn,
      tokenOut: edge.tokenOut,
      protocol: edge.protocol,
      tokenInIdx: edge.tokenInIdx,
      tokenOutIdx: edge.tokenOutIdx,
      zeroForOne: edge.zeroForOne,
      fee: edge.fee ?? null,
    })),
  };
}

function serialiseEvaluationPaths(paths: PathLike[]) {
  return paths.map((path) => serialiseEvaluationPath(path));
}

function rehydrateEvaluationResults(
  results: EvaluationResult[],
  originalPathsByKey: Map<string, PathLike>
): Array<{ path: PathLike; result: EvaluationResult["result"] }> {
  return results
    .map(({ path, result }) => {
      const originalPath = originalPathsByKey.get(path.serialisedKey);
      if (!originalPath) return null;
      return { path: originalPath, result };
    })
    .filter(
      (entry): entry is { path: PathLike; result: EvaluationResult["result"] } => entry != null
    );
}

// ─── WorkerPool ───────────────────────────────────────────────

export class WorkerPool {
  private _size: number;
  private _slots: WorkerSlot[];
  private _queue: QueueItem[];
  private _pending: Map<number, PendingJob>;
  private _nextId: number;
  private _initialized: boolean;
  private _terminating: boolean;
  private _spawnEpoch: number;

  constructor(size: number) {
    this._size = Math.max(1, size);
    this._slots = [];
    this._queue = [];
    this._pending = new Map();
    this._nextId = 0;
    this._initialized = false;
    this._terminating = false;
    this._spawnEpoch = 0;
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
    this._spawnEpoch++;
    this._rejectAllPending(new Error("[worker_pool] Worker pool terminated"));
    for (const slot of this._slots) {
      if (slot.respawnTimer) {
        clearTimeout(slot.respawnTimer);
        slot.respawnTimer = null;
      }
    }
    for (const { worker } of this._slots) {
      if (worker) await worker.terminate().catch(() => {});
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
  async evaluate(paths: PathLike[], stateCache: WorkerStateMap, testAmount: bigint, options: Record<string, any> = {}) {
    if (!this._initialized) this.init();
    const activeWorkerCount = this._activeWorkerCount();
    if (activeWorkerCount === 0) {
      const { evaluatePaths } = await import("./simulator.ts");
      return evaluatePaths(paths, stateCache, testAmount, options);
    }

    const chunks = buildEvaluationChunks(paths, activeWorkerCount);
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
      const byKey = new Map<string, PathLike>();
      for (let i = 0; i < chunk.length; i++) {
        byKey.set(serialisedChunks[index][i].serialisedKey, chunk[i]);
      }
      return byKey;
    });

    // When enough idle workers are available, target fixed slots and keep a
    // persistent worker-side state mirror, sending only changed pool states.
    // Only requires as many idle slots as there are chunks, not all slots.
    const idleEvalSlots = this._slots.filter((s) => isUsableSlot(s));
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
          ).then((results) => rehydrateEvaluationResults(results as EvaluationResult[], originalPathMaps[i]))
        )
      : chunks.map((chunk, i) =>
          this._submit({
            type: "EVALUATE",
            paths: serialisedChunks[i],
            stateObj: buildChunkStateObject(chunk, stateCache),
            testAmount: amountStr,
            options,
          }).then((results) => rehydrateEvaluationResults(results as EvaluationResult[], originalPathMaps[i]))
        );

    const chunkResults = await Promise.all(chunkPromises);
    const all = chunkResults.flat().filter((entry): entry is EvaluationResult => entry != null);

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
   * from the live graph using poolAddresses + tokenIn/tokenOut identity.
   *
   * Falls back to synchronous enumeration when pool has < 2 workers or
   * only one start token.
   *
   * @param {Object.<string,Array>} adjacency  Output of serializeTopology()
   * @param {string[]}              startTokens  Token addresses to search from
   * @param {object}                [options]    findArbPaths options
   * @returns {Promise<Array>}  Serialised path descriptors from all workers
   */
  async enumerate(adjacency: Record<string, any[]>, startTokens: string[], options: Record<string, any> = {}) {
    if (!this._initialized) this.init();

    if (startTokens.length === 0) return [];
    const activeWorkerCount = this._activeWorkerCount();

    const { topologyKey = null, ...enumerateOptions } = options;

    // Below threshold or single worker: run inline to avoid IPC overhead
    if (startTokens.length < 2 || activeWorkerCount < 2) {
      const { deserializeTopology } = await import("./graph.ts");
      const { findArbPaths }        = await import("./finder.ts");
      const graph = deserializeTopology(adjacency);
      const paths = findArbPaths(graph, startTokens, enumerateOptions);
      return paths.map((p: any) => ({
        startToken:        p.startToken,
        hopCount:          p.hopCount,
        logWeight:         p.logWeight,
        cumulativeFeesBps: p.cumulativeFeesBps,
        poolAddresses:     p.edges.map((e: any) => e.poolAddress),
        tokenIns:          p.edges.map((e: any) => e.tokenIn),
        tokenOuts:         p.edges.map((e: any) => e.tokenOut),
        zeroForOnes:       p.edges.map((e: any) => e.zeroForOne),
      }));
    }

    // Split tokens across workers
    const chunkSize = Math.ceil(startTokens.length / activeWorkerCount);
    const chunks: string[][] = [];
    for (let i = 0; i < startTokens.length; i += chunkSize) {
      chunks.push(startTokens.slice(i, i + chunkSize));
    }

    const idleEnumSlots = this._slots.filter((s) => isUsableSlot(s));
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
    const seen  = new Set<string>();
    const all: SerializedEnumeratedPath[]   = [];
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
  _submit(data: WorkerPayload): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      this._pending.set(id, { resolve, reject, slot: null });

      const idle = this._slots.find((s) => isUsableSlot(s));
      if (idle) {
        this._dispatchToSlot(idle, id, data);
      } else {
        this._queue.push({ id, data });
      }
    });
  }

  _submitToSlot(slot: WorkerSlot, data: WorkerPayload): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      this._pending.set(id, { resolve, reject, slot: null });
      this._dispatchToSlot(slot, id, data);
    });
  }

  _dispatchToSlot(slot: WorkerSlot, id: number, data: WorkerPayload) {
    if (!slot.worker) {
      const pending = this._pending.get(id);
      if (pending) {
        this._pending.delete(id);
        pending.reject(new Error("[worker_pool] Attempted to dispatch to an unavailable worker slot"));
      }
      return;
    }

    const pending = this._pending.get(id);
    if (pending) pending.slot = slot;
    slot.busy = true;
    slot.currentJobId = id;
    slot.worker.postMessage({ id, ...data });
  }

  async _evaluateOnSlot(
    slot: WorkerSlot,
    chunk: PathLike[],
    serialisedChunk: SerializedEvaluationPath[],
    stateCache: WorkerStateMap,
    amountStr: string,
    options: Record<string, any>
  ) {
    const { delta: stateDeltaObj, count, poolAddresses } = this._buildStateDelta(
      chunk,
      stateCache,
      slot.syncedStateVersions
    );
    const poolMembershipChanged = !samePoolAddressSet(slot.syncedPoolAddresses, poolAddresses);

    if (workerLogger.isLevelEnabled("debug")) {
      workerLogger.debug(
        {
          event: "evaluate_slot_delta",
          slotIndex: this._slots.indexOf(slot),
          chunkPaths: chunk.length,
          deltaPools: count,
          retainedPools: poolAddresses.length,
          poolMembershipChanged,
        },
        "[worker_pool] Evaluation slot delta"
      );
    }

    if (count > 0 || poolMembershipChanged) {
      await this._submitToSlot(slot, {
        type: "SYNC_STATE",
        stateObj: stateDeltaObj,
        retainPools: poolAddresses,
      });
      for (const [poolAddress, state] of Object.entries(stateDeltaObj)) {
        slot.syncedStateVersions.set(poolAddress, getStateVersion(state));
      }
      const retainedPools = new Set(poolAddresses);
      for (const poolAddress of [...slot.syncedStateVersions.keys()]) {
        if (!retainedPools.has(poolAddress)) {
          slot.syncedStateVersions.delete(poolAddress);
        }
      }
      slot.syncedPoolAddresses = retainedPools;
    }

    return this._submitToSlot(slot, {
      type: "EVALUATE",
      paths: serialisedChunk,
      testAmount: amountStr,
      options,
    });
  }

  async _enumerateOnSlot(
    slot: WorkerSlot,
    adjacency: Record<string, any[]>,
    topologyKey: string,
    startTokens: string[],
    options: Record<string, any>
  ) {
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

  _buildStateDelta(paths: PathLike[], stateCache: WorkerStateMap, syncedStateVersions: Map<string, number>) {
    const delta: Record<string, Record<string, any>> = {};
    let count = 0;
    const poolAddresses = collectChunkPoolAddresses(paths);

    for (const poolAddress of poolAddresses) {
      const state = stateCache.get(poolAddress);
      if (!state) continue;

      const version = getStateVersion(state);
      const syncedVersion = syncedStateVersions.get(poolAddress);
      if (syncedVersion !== version) {
        delta[poolAddress] = state;
        count++;
      }
    }

    return { delta, count, poolAddresses };
  }

  /**
   * Spawn (or respawn) a worker at slot index i.
   */
  _spawnSlot(i: number) {
    if (this._terminating) return;
    const existingSlot = this._slots[i];
    if (existingSlot?.disabled) return;
    if (existingSlot?.respawnTimer) {
      clearTimeout(existingSlot.respawnTimer);
      existingSlot.respawnTimer = null;
    }

    const epoch = this._spawnEpoch;

    const worker = new Worker(WORKER_URL, {
      execArgv: WORKER_EXEC_ARGV,
    });
    const slot: WorkerSlot = {
      worker,
      busy: false,
      currentJobId: null,
      syncedStateVersions: new Map(),
      syncedPoolAddresses: new Set<string>(),
      syncedTopologyKey: null,
      respawnTimer: null,
      startupFailures: existingSlot?.startupFailures ?? 0,
      disabled: false,
    };
    let failureHandled = false;

    const replaceWithEmptySlot = () => {
      const idx = this._slots.indexOf(slot);
      if (idx !== -1) {
        this._slots[idx] = {
          worker: null,
          busy: false,
          currentJobId: null,
          syncedStateVersions: new Map(),
          syncedPoolAddresses: new Set<string>(),
          syncedTopologyKey: null,
          respawnTimer: null,
          startupFailures: slot.startupFailures,
          disabled: slot.disabled,
        };
      }
    };

    const scheduleRespawn = (message: string, err?: Error, exitCode?: number) => {
      if (failureHandled) return;
      failureHandled = true;

      const isStartupOom =
        slot.currentJobId == null &&
        /out of memory/i.test(err?.message ?? message);

      if (isStartupOom) {
        slot.startupFailures += 1;
        if (slot.startupFailures >= STARTUP_OOM_FAILURE_LIMIT) {
          slot.disabled = true;
          workerLogger.error(
            {
              event: "worker_slot_disabled",
              slotIndex: i,
              startupFailures: slot.startupFailures,
            },
            `[worker_pool] Worker ${i} disabled after repeated startup Wasm OOM failures`
          );
        }
      } else {
        slot.startupFailures = 0;
      }

      this._rejectSlotPending(slot);
      replaceWithEmptySlot();

      const suffix = exitCode != null ? ` (code ${exitCode})` : "";
      const action = slot.disabled ? "disabling slot" : "respawning";
      logger.warn(`[worker_pool] Worker ${i} ${message}${suffix} — ${action}`);

      if (slot.disabled || this._terminating || epoch !== this._spawnEpoch) return;

      const delayMs = isStartupOom ? Math.min(1_000, 100 * 2 ** (slot.startupFailures - 1)) : 50;
      const replacement = this._slots[i];
      if (replacement) {
        replacement.respawnTimer = setTimeout(() => {
          const pendingSlot = this._slots[i];
          if (pendingSlot) pendingSlot.respawnTimer = null;
          if (this._terminating || epoch !== this._spawnEpoch) return;
          this._spawnSlot(i);
        }, delayMs);
      }
    };

    worker.on("message", ({ id, type, profitable, paths, error }: any) => {
      slot.startupFailures = 0;
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

    worker.on("error", (err: Error) => {
      scheduleRespawn(`error: ${err.message}`, err);
    });

    worker.on("exit", (code: number) => {
      if (code !== 0 && !this._terminating) scheduleRespawn("exited", undefined, code);
    });

    if (this._slots[i]) {
      this._slots[i] = slot;
    } else {
      this._slots.push(slot);
    }
    // Pick up any queued work immediately after spawn / respawn.
    this._drainQueue(slot);
  }

  _drainQueue(slot: WorkerSlot) {
    if (!isUsableSlot(slot) || this._queue.length === 0) return;
    const next = this._queue.shift();
    if (!next) return;
    const { id, data } = next;
    this._dispatchToSlot(slot, id, data);
  }

  _rejectSlotPending(slot: WorkerSlot) {
    slot.busy = false;
    const currentJobId = slot.currentJobId;
    slot.currentJobId = null;
    slot.syncedStateVersions.clear();
    slot.syncedPoolAddresses.clear();
    slot.syncedTopologyKey = null;
    if (currentJobId == null) return;

    const pending = this._pending.get(currentJobId);
    if (pending) {
      pending.reject(new Error("[worker_pool] Worker crashed during evaluation"));
      this._pending.delete(currentJobId);
    }
  }

  _rejectAllPending(error: Error) {
    for (const { id } of this._queue) {
      const pending = this._pending.get(id);
      if (pending) {
        pending.reject(error);
        this._pending.delete(id);
      }
    }
    this._queue = [];

    for (const pending of this._pending.values()) {
      pending.reject(error);
    }
    this._pending.clear();
  }

  _activeWorkerCount() {
    return this._slots.filter((slot) => slot.worker != null && !slot.disabled).length;
  }

  /** Number of paths currently queued or in-flight */
  get queueDepth() { return this._queue.length + this._pending.size; }

  /** Pool size */
  get size() { return this._size; }

  get initialized() { return this._initialized; }
}

// ─── Singleton ─────────────────────────────────────────────────

export const workerPool = new WorkerPool(WORKER_COUNT);
