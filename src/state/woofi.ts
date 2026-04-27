import {
  isNoDataReadContractError,
  readContractWithRetry,
  throttledMap,
} from "../enrichment/rpc.ts";
import { ENRICH_CONCURRENCY } from "../config/index.ts";
import { WOOFI_WOOPP_V2, WOOFI_WOORACLE_V2 } from "../protocols/woofi.ts";
import { normalizeEvmAddress } from "../util/pool_record.ts";

const ERC20_DECIMALS_ABI = [
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

const WOOFI_POOL_ABI = [
  {
    name: "quoteToken",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "wooracle",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "tokenInfos",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "reserve", type: "uint192" },
      { name: "feeRate", type: "uint16" },
      { name: "maxGamma", type: "uint128" },
      { name: "maxNotionalSwap", type: "uint128" },
    ],
  },
] as const;

const WOOFI_ORACLE_ABI = [
  {
    name: "state",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "base", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "price", type: "uint128" },
          { name: "spread", type: "uint64" },
          { name: "coeff", type: "uint64" },
          { name: "woFeasible", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "base", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

function tupleValue(value: any, index: number, key: string) {
  return value?.[key] ?? value?.[index];
}

function pow10(decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 38) return 1n;
  return 10n ** BigInt(decimals);
}

async function readAddress(poolAddress: string, functionName: "quoteToken" | "wooracle") {
  return normalizeEvmAddress(await readContractWithRetry({
    address: poolAddress,
    abi: WOOFI_POOL_ABI,
    functionName,
  }));
}

async function readTokenDecimals(token: string) {
  const value = await readContractWithRetry({
    address: token,
    abi: ERC20_DECIMALS_ABI,
    functionName: "decimals",
  });
  return Number(value);
}

async function fetchTokenInfo(poolAddress: string, token: string) {
  const result = await readContractWithRetry({
    address: poolAddress,
    abi: WOOFI_POOL_ABI,
    functionName: "tokenInfos",
    args: [token],
  });
  return {
    reserve: BigInt(tupleValue(result, 0, "reserve")),
    feeRate: BigInt(tupleValue(result, 1, "feeRate")),
    maxGamma: BigInt(tupleValue(result, 2, "maxGamma")),
    maxNotionalSwap: BigInt(tupleValue(result, 3, "maxNotionalSwap")),
  };
}

async function fetchOracleState(wooracle: string, token: string) {
  const [state, decimals] = await Promise.all([
    readContractWithRetry({
      address: wooracle,
      abi: WOOFI_ORACLE_ABI,
      functionName: "state",
      args: [token],
    }),
    readContractWithRetry({
      address: wooracle,
      abi: WOOFI_ORACLE_ABI,
      functionName: "decimals",
      args: [token],
    }),
  ]);
  const priceDecimals = Number(decimals);
  return {
    price: BigInt(tupleValue(state, 0, "price")),
    spread: BigInt(tupleValue(state, 1, "spread")),
    coeff: BigInt(tupleValue(state, 2, "coeff")),
    feasible: tupleValue(state, 3, "woFeasible") !== false,
    priceDecimals,
    priceDec: pow10(priceDecimals),
  };
}

async function fetchWoofiBaseState(poolAddress: string, wooracle: string, quoteDecimals: number, token: string) {
  const [tokenInfo, oracle, baseDecimals] = await Promise.all([
    fetchTokenInfo(poolAddress, token),
    fetchOracleState(wooracle, token),
    readTokenDecimals(token),
  ]);

  return {
    token,
    ...tokenInfo,
    ...oracle,
    baseDecimals,
    quoteDecimals,
    baseDec: pow10(baseDecimals),
    quoteDec: pow10(quoteDecimals),
  };
}

export async function fetchWoofiPoolState(poolAddress: string = WOOFI_WOOPP_V2, options: { tokens?: string[] } = {}) {
  const addr = normalizeEvmAddress(poolAddress) ?? normalizeEvmAddress(WOOFI_WOOPP_V2)!;
  const [quoteToken, wooracleAddress] = await Promise.all([
    readAddress(addr, "quoteToken"),
    readAddress(addr, "wooracle").catch(() => null),
  ]);
  if (!quoteToken) {
    throw new Error(`WOOFi: quoteToken() returned an invalid address for ${addr}`);
  }

  const wooracle = wooracleAddress ?? normalizeEvmAddress(WOOFI_WOORACLE_V2)!;
  const candidateTokens = [...new Set((options.tokens ?? [])
    .map((token) => normalizeEvmAddress(token))
    .filter((token): token is string => token != null))];
  const baseTokens = candidateTokens.filter((token) => token !== quoteToken);
  const [quoteInfo, quoteDecimals] = await Promise.all([
    fetchTokenInfo(addr, quoteToken),
    readTokenDecimals(quoteToken),
  ]);

  const baseResults = await throttledMap(
    baseTokens,
    async (token) => {
      try {
        const state = await fetchWoofiBaseState(addr, wooracle, quoteDecimals, token);
        if (state.reserve <= 0n || state.price <= 0n || !state.feasible) return null;
        return state;
      } catch (error: any) {
        if (!isNoDataReadContractError(error)) {
          console.warn(`  Failed to fetch WOOFi base state for ${token}: ${error.message}`);
        }
        return null;
      }
    },
    ENRICH_CONCURRENCY,
  );
  const baseStates = baseResults.filter((state) => state != null) as any[];

  return {
    address: addr,
    quoteToken,
    wooracle,
    tokens: [quoteToken, ...baseStates.map((state) => state.token)],
    quoteReserve: quoteInfo.reserve,
    quoteFeeRate: quoteInfo.feeRate,
    quoteDecimals,
    quoteDec: pow10(quoteDecimals),
    baseStates,
    fetchedAt: Date.now(),
  };
}

export async function fetchMultipleWoofiStates(
  poolAddresses: any,
  concurrency = ENRICH_CONCURRENCY,
  poolTokens: Map<string, string[]> = new Map(),
) {
  const states: Map<string, any> & { noDataFailures?: Set<string> } = new Map();
  const noDataFailures = new Set<string>();

  const results = await throttledMap(
    poolAddresses,
    async (addr: any) => {
      const normalizedAddr = String(addr).toLowerCase();
      try {
        const state = await fetchWoofiPoolState(normalizedAddr, {
          tokens: poolTokens.get(normalizedAddr) ?? [],
        });
        return { addr: normalizedAddr, state, error: null };
      } catch (error: any) {
        if (isNoDataReadContractError(error)) {
          noDataFailures.add(normalizedAddr);
        }
        console.warn(`  Failed to fetch WOOFi state for ${addr}: ${error.message}`);
        return { addr: normalizedAddr, state: null, error };
      }
    },
    concurrency,
  );

  for (const { addr, state } of results) {
    if (state) states.set(addr, state);
  }

  states.noDataFailures = noDataFailures;
  return states;
}
