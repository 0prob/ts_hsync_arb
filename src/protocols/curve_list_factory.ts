import { readContractWithRetry, throttledMap } from "../enrichment/rpc.ts";
import { ENRICH_CONCURRENCY } from "../config/index.ts";
import { hydrateNewTokens } from "../enrichment/token_hydrator.ts";

const ZERO = "0x0000000000000000000000000000000000000000";

const POOL_COUNT_ABI = [
  {
    name: "pool_count",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const POOL_LIST_ABI = [
  {
    name: "pool_list",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "arg0", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
];

function isMissingPoolListEntryError(error: unknown) {
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return (
    message.includes("missing or invalid parameters") ||
    message.includes("metadata is not found")
  );
}

function getCoinsAbi(slotCount: number) {
  return [
    {
      name: "get_coins",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "_pool", type: "address" }],
      outputs: [{ name: "", type: `address[${slotCount}]` }],
    },
  ];
}

function getDynamicCoinsAbi() {
  return [
    {
      name: "get_coins",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "_pool", type: "address" }],
      outputs: [{ name: "", type: "address[]" }],
    },
  ];
}

type DiscoverCurveFactoryOptions = {
  protocolKey: string;
  protocolName: string;
  factoryAddress: string;
  slotCount?: number;
  dynamicCoins?: boolean;
  registry: any;
  checkpointBlock?: number | null;
  metadataForPool?: (poolAddress: string, tokens: string[]) => Record<string, any>;
};

export async function discoverCurveListedFactory({
  protocolKey,
  protocolName,
  factoryAddress,
  slotCount = 0,
  dynamicCoins = false,
  registry,
  checkpointBlock = null,
  metadataForPool = () => ({}),
}: DiscoverCurveFactoryOptions) {
  const existing = new Set(
    (registry.getPools({ protocol: protocolKey }) || []).map((pool: any) =>
      pool.pool_address.toLowerCase()
    )
  );

  const poolCount = Number(
    await readContractWithRetry({
      address: factoryAddress,
      abi: POOL_COUNT_ABI,
      functionName: "pool_count",
    })
  );

  if (!Number.isFinite(poolCount) || poolCount <= 0) {
    if (checkpointBlock != null) registry.setCheckpoint(protocolKey, checkpointBlock);
    return { discovered: 0, checkpointBlock, rollbackGuard: null, hydrationPromise: null };
  }

  console.log(`\n[${protocolName}] Enumerating ${poolCount} factory-listed pools...`);

  const indexes = Array.from({ length: poolCount }, (_, i) => i);
  const listedPools = await throttledMap(
    indexes,
    async (index: number) => {
      try {
        const poolAddress = String(
          await readContractWithRetry({
            address: factoryAddress,
            abi: POOL_LIST_ABI,
            functionName: "pool_list",
            args: [BigInt(index)],
          })
        ).toLowerCase();

        if (!poolAddress || poolAddress === ZERO || existing.has(poolAddress)) {
          return null;
        }

        const rawTokens = await readContractWithRetry({
          address: factoryAddress,
          abi: dynamicCoins ? getDynamicCoinsAbi() : getCoinsAbi(slotCount),
          functionName: "get_coins",
          args: [poolAddress],
        });

        const tokens = (rawTokens as any[])
          .map((token: any) => String(token).toLowerCase())
          .filter((token: string) => token && token !== ZERO);

        if (tokens.length < 2) return null;

        return {
          protocol: protocolKey,
          block: checkpointBlock ?? 0,
          tx: "",
          pool_address: poolAddress,
          tokens,
          metadata: metadataForPool(poolAddress, tokens),
          status: "active",
        };
      } catch (error: any) {
        // Some Curve factories expose sparse pool_list indexes after removals.
        // Treat those missing entries as skips, but keep surfacing unexpected failures.
        if (isMissingPoolListEntryError(error)) {
          return null;
        }
        console.warn(`  [${protocolName}] Failed to enumerate pool #${index}: ${error.message}`);
        return null;
      }
    },
    ENRICH_CONCURRENCY
  );

  const poolBatch = listedPools.filter(Boolean);
  if (poolBatch.length > 0) {
    registry.batchUpsertPools(poolBatch);
  }
  if (checkpointBlock != null) registry.setCheckpoint(protocolKey, checkpointBlock);

  console.log(`  Inserted/updated ${poolBatch.length} pools for ${protocolName}.`);

  const hydrationPromise =
    poolBatch.length > 0
      ? hydrateNewTokens(poolBatch, registry).catch((err) => {
          console.warn(`  [discover] Token hydration failed: ${err.message}`);
          return 0;
        })
      : null;

  return {
    discovered: poolBatch.length,
    checkpointBlock,
    rollbackGuard: null,
    hydrationPromise,
  };
}
