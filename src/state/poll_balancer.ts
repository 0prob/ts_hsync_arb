// @ts-nocheck
/**
 * src/state/poll_balancer.js — Balancer V2 vault balances poller
 *
 * Fetches pool state from the Balancer Vault via getPoolTokens(),
 * and fetches per-pool weights + swap fee from the pool contract.
 *
 * Normalizes into canonical state and writes to the shared cache.
 */

import { readContractWithRetry, throttledMap } from "../enrichment/rpc.ts";
import { normalizeBalancerState } from "./normalizer.ts";
import { ENRICH_CONCURRENCY } from "../config/index.ts";
import { parsePoolMetadata, parsePoolTokens } from "./pool_record.ts";

const BALANCER_PROTOCOLS = new Set([
  "BALANCER_WEIGHTED",
  "BALANCER_STABLE",
  "BALANCER_V2",
]);

const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const BALANCER_READ_TIMEOUT_MS = 20_000;

const GET_POOL_TOKENS_ABI = [
  {
    name: "getPoolTokens",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "tokens", type: "address[]" },
      { name: "balances", type: "uint256[]" },
      { name: "lastChangeBlock", type: "uint256" },
    ],
  },
];

const GET_NORMALIZED_WEIGHTS_ABI = [
  {
    name: "getNormalizedWeights",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
  },
];

const GET_SWAP_FEE_ABI = [
  {
    name: "getSwapFeePercentage",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const GET_POOL_ID_ABI = [
  {
    name: "getPoolId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
];

function withTimeout(promise, label, ms = BALANCER_READ_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

async function readContractWithTimeout(params, label) {
  return withTimeout(readContractWithRetry(params), label, BALANCER_READ_TIMEOUT_MS);
}

export async function fetchBalancerPoolState(poolAddress, poolId) {
  const ONE = 10n ** 18n;

  let resolvedPoolId = poolId;
  if (!resolvedPoolId) {
    try {
      resolvedPoolId = await readContractWithTimeout(
        {
          address: poolAddress,
          abi: GET_POOL_ID_ABI,
          functionName: "getPoolId",
        },
        `Balancer getPoolId ${poolAddress}`
      );
    } catch {
      throw new Error(`Cannot resolve poolId for ${poolAddress}`);
    }
  }

  const [vaultResult, weightsResult, feeResult] = await Promise.allSettled([
    readContractWithTimeout(
      {
        address: BALANCER_VAULT,
        abi: GET_POOL_TOKENS_ABI,
        functionName: "getPoolTokens",
        args: [resolvedPoolId],
      },
      `Balancer getPoolTokens ${poolAddress}`
    ),
    readContractWithTimeout(
      {
        address: poolAddress,
        abi: GET_NORMALIZED_WEIGHTS_ABI,
        functionName: "getNormalizedWeights",
      },
      `Balancer getNormalizedWeights ${poolAddress}`
    ),
    readContractWithTimeout(
      {
        address: poolAddress,
        abi: GET_SWAP_FEE_ABI,
        functionName: "getSwapFeePercentage",
      },
      `Balancer getSwapFeePercentage ${poolAddress}`
    ),
  ]);

  if (vaultResult.status === "rejected") {
    throw new Error(`getPoolTokens failed: ${vaultResult.reason?.message}`);
  }

  const [vaultTokens, vaultBalances] = vaultResult.value;
  const balances = Array.from(vaultBalances).map(BigInt);

  let weights;
  if (weightsResult.status === "fulfilled") {
    weights = Array.from(weightsResult.value).map(BigInt);
  } else {
    const n = balances.length;
    weights = Array(n).fill(ONE / BigInt(n));
  }

  const swapFee =
    feeResult.status === "fulfilled"
      ? BigInt(feeResult.value)
      : 3_000_000_000_000_000n;

  return {
    poolId: resolvedPoolId,
    tokens: Array.from(vaultTokens).map((t) => t.toLowerCase()),
    balances,
    weights,
    swapFee,
    fetchedAt: Date.now(),
  };
}

export async function fetchAndNormalizeBalancerPool(pool) {
  const addr = pool.pool_address.toLowerCase();
  const meta = parsePoolMetadata(pool.metadata);
  const poolId = meta?.poolId || meta?.pool_id || null;

  const rawState = await fetchBalancerPoolState(addr, poolId);

  const tokens = rawState.tokens.length >= 2 ? rawState.tokens : parsePoolTokens(pool.tokens);

  const normalized = normalizeBalancerState(addr, pool.protocol, tokens, rawState, meta);

  return { addr, normalized };
}

export class PollBalancer {
  constructor(registry, stateCache, options = {}) {
    this._registry = registry;
    this._cache = stateCache;
    this._concurrency = options.concurrency ?? ENRICH_CONCURRENCY;
    this._verbose = options.verbose ?? false;
    this._timer = null;
    this._running = false;
    this._passCount = 0;
  }

  async poll() {
    const t0 = Date.now();

    const pools = this._registry.getActivePoolsMeta().filter((p) =>
      BALANCER_PROTOCOLS.has(p.protocol)
    );

    if (pools.length === 0) {
      return { updated: 0, failed: 0, durationMs: Date.now() - t0 };
    }

    const results = await throttledMap(
      pools,
      async (pool) => {
        try {
          const { addr, normalized } = await fetchAndNormalizeBalancerPool(pool);
          return { addr, normalized, error: null };
        } catch (err) {
          const addr = pool.pool_address.toLowerCase();
          return { addr, normalized: null, error: err };
        }
      },
      this._concurrency
    );

    let updated = 0;
    let failed = 0;

    for (const { addr, normalized, error } of results) {
      if (normalized) {
        this._cache.set(addr, normalized);
        updated++;
        if (this._verbose) {
          console.log(`[poll_balancer] ${addr} balances=${normalized.balances}`);
        }
      } else {
        failed++;
        if (this._verbose) {
          console.warn(`[poll_balancer] Failed ${addr}: ${error?.message}`);
        }
      }
    }

    const durationMs = Date.now() - t0;
    this._passCount++;
    console.log(
      `[poll_balancer] Pass #${this._passCount}: ${updated} updated, ${failed} failed (${durationMs}ms)`
    );

    return { updated, failed, durationMs };
  }

  start(intervalMs = 30_000) {
    if (this._timer) return;
    this._timer = setInterval(async () => {
      if (this._running) return;
      this._running = true;
      try {
        await this.poll();
      } catch (err) {
        console.error(`[poll_balancer] Poll error: ${err.message}`);
      } finally {
        this._running = false;
      }
    }, intervalMs);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}
