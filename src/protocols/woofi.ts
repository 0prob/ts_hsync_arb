import { readContractWithRetry, throttledMap } from "../enrichment/rpc.ts";
import { normalizeEvmAddress } from "../util/pool_record.ts";
import type { ProtocolDefinition } from "./factories.ts";

export const WOOFI_PROTOCOL = "WOOFI";
export const WOOFI_ROUTER_V2 = "0x4c4AF8DBc524681930a27b2F1Af5bcC8062E6fB7";
export const WOOFI_WOOPP_V2 = "0x5520385bFcf07Ec87C4c53A7d8d65595Dff69FA4";
export const WOOFI_WOORACLE_V2 = "0x2A8Ede62D0717C8C92b88639ecf603FDF31A8428";
export const WOOFI_INTEGRATION_HELPER = "0x7Ba560eB735AbDCf9a3a5692272652A0cc81850d";

const DEFAULT_POLYGON_TOKEN_CANDIDATES = [
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // native USDC
  "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WETH
  "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", // WBTC
  "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC
  "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
  "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", // DAI
  "0x1B815d120B3eF02039Ee11dC2d33DE7aA4a8C603", // WOO
];

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
    name: "poolSize",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
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
] as const;

function parseConfiguredTokens() {
  const configured = process.env.WOOFI_TOKENS || process.env.WOOFI_POLYGON_TOKENS || "";
  return configured
    .split(",")
    .map((token) => normalizeEvmAddress(token))
    .filter((token): token is string => token != null);
}

function uniqueAddresses(values: unknown[]) {
  return [...new Set(values.map((value) => normalizeEvmAddress(value)).filter((value): value is string => value != null))];
}

function tupleValue(value: any, index: number, key: string) {
  return value?.[key] ?? value?.[index];
}

async function readWoofiAddress(poolAddress: string, functionName: "quoteToken" | "wooracle") {
  return normalizeEvmAddress(await readContractWithRetry({
    address: poolAddress,
    abi: WOOFI_POOL_ABI,
    functionName,
  }));
}

async function hasLiveWoofiBase(poolAddress: string, wooracle: string, token: string) {
  try {
    const [poolSize, oracleState] = await Promise.all([
      readContractWithRetry({
        address: poolAddress,
        abi: WOOFI_POOL_ABI,
        functionName: "poolSize",
        args: [token],
      }),
      readContractWithRetry({
        address: wooracle,
        abi: WOOFI_ORACLE_ABI,
        functionName: "state",
        args: [token],
      }),
    ]);
    return (
      BigInt(poolSize as any) > 0n &&
      BigInt(tupleValue(oracleState, 0, "price")) > 0n &&
      tupleValue(oracleState, 3, "woFeasible") !== false
    );
  } catch {
    return false;
  }
}

export async function discoverWoofiPool({ key, registry, chainHeight }: any) {
  const poolAddress = normalizeEvmAddress(process.env.WOOFI_WOOPP_V2 || WOOFI_WOOPP_V2)!;
  const router = normalizeEvmAddress(process.env.WOOFI_ROUTER_V2 || WOOFI_ROUTER_V2)!;
  const quoteToken = await readWoofiAddress(poolAddress, "quoteToken");
  if (!quoteToken) {
    throw new Error("WOOFi discovery failed: WooPP quoteToken() returned an invalid address");
  }
  const wooracle = await readWoofiAddress(poolAddress, "wooracle") ?? normalizeEvmAddress(WOOFI_WOORACLE_V2)!;
  const candidates = uniqueAddresses([
    quoteToken,
    ...parseConfiguredTokens(),
    ...DEFAULT_POLYGON_TOKEN_CANDIDATES,
  ]).filter((token) => token !== quoteToken);

  const liveFlags = await throttledMap(
    candidates,
    (token) => hasLiveWoofiBase(poolAddress, wooracle, token),
    4,
  );
  const liveBaseTokens = candidates.filter((_token, index) => liveFlags[index]);
  const tokens = [quoteToken, ...liveBaseTokens];

  if (tokens.length < 2) {
    const checkpointBlock = Number.isSafeInteger(Number(chainHeight)) ? Number(chainHeight) : 0;
    registry.setCheckpoint(key, checkpointBlock);
    console.warn("  WOOFi discovery found no live base tokens; set WOOFI_TOKENS to seed additional candidates.");
    return { discovered: 0, checkpointBlock };
  }

  const checkpointBlock = Number.isSafeInteger(Number(chainHeight)) ? Number(chainHeight) : 0;
  registry.upsertPool({
    protocol: key,
    pool_address: poolAddress,
    tokens,
    block: checkpointBlock,
    tx: null,
    metadata: {
      router,
      wooPP: poolAddress,
      wooracle,
      quoteToken,
      integrationHelper: normalizeEvmAddress(WOOFI_INTEGRATION_HELPER),
      discoveryMode: "singleton",
    },
    status: "active",
  });
  registry.setCheckpoint(key, checkpointBlock);

  console.log(`  Inserted/updated WOOFi singleton pool with ${tokens.length} token(s).`);
  return { discovered: 1, checkpointBlock };
}

const WOOFI: ProtocolDefinition = {
  name: "WOOFi WooPPV2",
  address: WOOFI_WOOPP_V2,
  capabilities: {
    discovery: true,
    routing: true,
    execution: true,
  },
  discover: discoverWoofiPool,
};

export default WOOFI;
