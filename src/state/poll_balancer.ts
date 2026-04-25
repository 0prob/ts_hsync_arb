
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
import { metadataWithTokenDecimals } from "./pool_metadata.ts";
import { asBatchResult, TimedPoller } from "./poller_base.ts";
import { BALANCER_PROTOCOLS, normalizeProtocolKey } from "../protocols/classification.ts";

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

function withTimeout(promise: any, label: any, ms = BALANCER_READ_TIMEOUT_MS) {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

async function readContractWithTimeout(params: any, label: any) {
  return withTimeout(readContractWithRetry(params), label, BALANCER_READ_TIMEOUT_MS);
}

export async function fetchBalancerPoolState(poolAddress: string, poolId: string | null | undefined) {
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

  const [vaultTokens, vaultBalances, lastChangeBlock] = vaultResult.value;
  const balances = Array.from(vaultBalances).map((v) => BigInt(v as any));

  if (weightsResult.status === "rejected") {
    throw new Error(
      `getNormalizedWeights failed: unsupported Balancer pool math or unreadable weights (${weightsResult.reason?.message ?? "unknown error"})`
    );
  }

  const weights = Array.from(weightsResult.value).map((v) => BigInt(v as any));
  if (weights.length !== balances.length) {
    throw new Error(
      `getNormalizedWeights length mismatch: weights=${weights.length} balances=${balances.length}`
    );
  }

  const swapFee =
    feeResult.status === "fulfilled"
      ? BigInt(feeResult.value)
      : 3_000_000_000_000_000n;

  return {
    poolId: resolvedPoolId,
    tokens: Array.from(vaultTokens).map((t: any) => t.toLowerCase()),
    balances,
    weights,
    swapFee,
    lastChangeBlock: Number(lastChangeBlock),
    fetchedAt: Date.now(),
  };
}

export async function fetchAndNormalizeBalancerPool(pool: any, options: { tokenDecimals?: Map<string, number> | null } = {}) {
  const addr = pool.pool_address.toLowerCase();
  const meta = parsePoolMetadata(pool.metadata);
  const poolId = meta?.poolId || meta?.pool_id || null;

  const rawState = await fetchBalancerPoolState(addr, poolId);

  const tokens = rawState.tokens.length >= 2 ? rawState.tokens : parsePoolTokens(pool.tokens);
  const metadata = metadataWithTokenDecimals({ ...pool, metadata: meta }, tokens, options.tokenDecimals);

  const normalized = normalizeBalancerState(addr, pool.protocol, tokens, rawState, metadata);

  return { addr, normalized };
}

export class PollBalancer extends TimedPoller {
  private _registry: any;
  private _cache: Map<string, any>;
  private _concurrency: number;

  constructor(registry: any, stateCache: Map<string, any>, options: any = {}) {
    super(options);
    this._registry = registry;
    this._cache = stateCache;
    this._concurrency = options.concurrency ?? ENRICH_CONCURRENCY;
  }

  async poll() {
    const t0 = Date.now();

    const pools = this._registry.getActivePoolsMeta().filter((p: any) =>
      BALANCER_PROTOCOLS.has(normalizeProtocolKey(p.protocol))
    );

    if (pools.length === 0) {
      return { updated: 0, failed: 0, durationMs: Date.now() - t0 };
    }

    const results = await throttledMap(
      pools,
      async (pool: any) => {
        try {
          const tokens = parsePoolTokens(pool.tokens);
          const tokenDecimals = this._registry.getTokenDecimals(tokens);
          const { addr, normalized } = await fetchAndNormalizeBalancerPool(pool, { tokenDecimals });
          return asBatchResult(addr, normalized);
        } catch (err) {
          const addr = pool.pool_address.toLowerCase();
          return asBatchResult(addr, null, err);
        }
      },
      this._concurrency
    );

    const { updated, failed } = this._storeBatchResults(
      "poll_balancer",
      this._cache,
      results,
      ({ addr, normalized }) => `[poll_balancer] ${addr} balances=${normalized.balances}`
    );

    return this._completePass("poll_balancer", t0, updated, failed);
  }

  start(intervalMs = 30_000) {
    this._startLoop("poll_balancer", intervalMs, () => this.poll());
  }
}
