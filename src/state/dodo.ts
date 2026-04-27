import {
  isNoDataReadContractError,
  readContractWithRetry,
  throttledMap,
} from "../enrichment/rpc.ts";
import { ENRICH_CONCURRENCY } from "../config/index.ts";
import { normalizeEvmAddress } from "../util/pool_record.ts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const FEE_USER = normalizeEvmAddress(process.env.EXECUTOR_ADDRESS) ?? ZERO_ADDRESS;

const GET_PMM_STATE_ABI = [
  {
    name: "getPMMState",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "state",
        type: "tuple",
        components: [
          { name: "i", type: "uint256" },
          { name: "K", type: "uint256" },
          { name: "B", type: "uint256" },
          { name: "Q", type: "uint256" },
          { name: "B0", type: "uint256" },
          { name: "Q0", type: "uint256" },
          { name: "R", type: "uint8" },
        ],
      },
    ],
  },
];

const DODO_TOKEN_ABI = [
  {
    name: "_BASE_TOKEN_",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "_QUOTE_TOKEN_",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
];

const GET_USER_FEE_RATE_ABI = [
  {
    name: "getUserFeeRate",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "userAddr", type: "address" }],
    outputs: [
      { name: "lpFeeRate", type: "uint256" },
      { name: "mtFeeRate", type: "uint256" },
    ],
  },
];

const DODO_DIRECT_FEE_ABI = [
  {
    name: "_LP_FEE_RATE_",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "_MT_FEE_RATE_",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

function tupleValue(state: any, index: number, key: string) {
  return state?.[key] ?? state?.[index];
}

function normalizeFeeResult(result: any) {
  return {
    lpFeeRate: BigInt(result?.lpFeeRate ?? result?.[0] ?? 0),
    mtFeeRate: BigInt(result?.mtFeeRate ?? result?.[1] ?? 0),
  };
}

async function fetchDodoFeeRates(poolAddress: string) {
  try {
    const result = await readContractWithRetry({
      address: poolAddress,
      abi: GET_USER_FEE_RATE_ABI,
      functionName: "getUserFeeRate",
      args: [FEE_USER],
    });
    return {
      ...normalizeFeeResult(result),
      feeSource: "getUserFeeRate",
    };
  } catch {
    const [lpResult, mtResult] = await Promise.allSettled([
      readContractWithRetry({
        address: poolAddress,
        abi: DODO_DIRECT_FEE_ABI,
        functionName: "_LP_FEE_RATE_",
      }),
      readContractWithRetry({
        address: poolAddress,
        abi: DODO_DIRECT_FEE_ABI,
        functionName: "_MT_FEE_RATE_",
      }),
    ]);
    return {
      lpFeeRate: lpResult.status === "fulfilled" ? BigInt(lpResult.value) : 0n,
      mtFeeRate: mtResult.status === "fulfilled" ? BigInt(mtResult.value) : 0n,
      feeSource: "direct",
    };
  }
}

export async function fetchDodoPoolState(poolAddress: string) {
  const [pmmState, baseToken, quoteToken, fees] = await Promise.all([
    readContractWithRetry({
      address: poolAddress,
      abi: GET_PMM_STATE_ABI,
      functionName: "getPMMState",
    }),
    readContractWithRetry({
      address: poolAddress,
      abi: DODO_TOKEN_ABI,
      functionName: "_BASE_TOKEN_",
    }),
    readContractWithRetry({
      address: poolAddress,
      abi: DODO_TOKEN_ABI,
      functionName: "_QUOTE_TOKEN_",
    }),
    fetchDodoFeeRates(poolAddress),
  ]);

  return {
    address: poolAddress,
    baseToken: normalizeEvmAddress(baseToken),
    quoteToken: normalizeEvmAddress(quoteToken),
    i: BigInt(tupleValue(pmmState, 0, "i")),
    k: BigInt(tupleValue(pmmState, 1, "K")),
    baseReserve: BigInt(tupleValue(pmmState, 2, "B")),
    quoteReserve: BigInt(tupleValue(pmmState, 3, "Q")),
    baseTarget: BigInt(tupleValue(pmmState, 4, "B0")),
    quoteTarget: BigInt(tupleValue(pmmState, 5, "Q0")),
    rState: Number(tupleValue(pmmState, 6, "R")),
    lpFeeRate: fees.lpFeeRate,
    mtFeeRate: fees.mtFeeRate,
    feeSource: fees.feeSource,
    fetchedAt: Date.now(),
  };
}

export async function fetchMultipleDodoStates(
  poolAddresses: any,
  concurrency = ENRICH_CONCURRENCY,
) {
  const states: Map<string, any> & { noDataFailures?: Set<string> } = new Map();
  const noDataFailures = new Set<string>();

  const results = await throttledMap(
    poolAddresses,
    async (addr: any) => {
      try {
        const state = await fetchDodoPoolState(addr);
        return { addr, state, error: null };
      } catch (error: any) {
        if (isNoDataReadContractError(error)) {
          noDataFailures.add(String(addr).toLowerCase());
        }
        console.warn(`  Failed to fetch DODO state for ${addr}: ${error.message}`);
        return { addr, state: null, error };
      }
    },
    concurrency,
  );

  for (const { addr, state } of results) {
    if (state) {
      states.set(String(addr).toLowerCase(), state);
    }
  }

  states.noDataFailures = noDataFailures;
  return states;
}
