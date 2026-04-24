import { readContractWithRetry, throttledMap } from "../enrichment/rpc.ts";
import { ENRICH_CONCURRENCY } from "../config/index.ts";
import { hydrateNewTokens } from "../enrichment/token_hydrator.ts";
import { logger } from "../utils/logger.ts";

const ZERO = "0x0000000000000000000000000000000000000000";
const discoveryLogger: any = logger.child({ component: "discovery_curve_factory" });

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

function metadataFactoryIndex(metadata: any) {
  const index = Number(metadata?.factoryIndex);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function discoverStartIndex(existingPools: any[], poolCount: number) {
  let maxIndexed = -1;
  for (const pool of existingPools) {
    const index = metadataFactoryIndex(pool?.metadata);
    if (index != null && index > maxIndexed) maxIndexed = index;
  }
  if (maxIndexed < 0) return 0;
  return Math.min(poolCount, maxIndexed + 1);
}

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
  const existingPools = typeof registry.getPools === "function"
    ? registry.getPools({ protocol: protocolKey })
    : registry.getPoolAddressesForProtocol(protocolKey).map((address: string) => ({
        pool_address: address,
        tokens: [],
        metadata: {},
        status: "active",
      }));
  const existingByAddress = new Map<string, any>(
    existingPools.map((pool: any) => [String(pool.pool_address ?? pool.address).toLowerCase(), pool])
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

  const startIndex = discoverStartIndex(existingPools, poolCount);
  const scanCount = Math.max(0, poolCount - startIndex);

  console.log(
    `\n[${protocolName}] Enumerating ${scanCount} new factory-listed pool slot(s)` +
      (startIndex > 0 ? ` from index ${startIndex}` : ` across ${poolCount} pool slot(s)`) +
      `...`
  );
  discoveryLogger.info(
    { protocol: protocolKey, poolCount, existingPools: existingPools.length, startIndex, scanCount },
    "[discovery] Enumerating Curve factory-listed pools",
  );

  const indexes = Array.from({ length: scanCount }, (_, i) => startIndex + i);
  const listedPoolEntries = await throttledMap(
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

        if (!poolAddress || poolAddress === ZERO) {
          return null;
        }

        const existingPool = existingByAddress.get(poolAddress);
        const existingFactoryIndex = metadataFactoryIndex(existingPool?.metadata);
        if (existingPool && existingFactoryIndex !== index) {
          return {
            isNew: false,
            pool: {
              protocol: protocolKey,
              block: existingPool.created_block ?? checkpointBlock ?? 0,
              tx: existingPool.created_tx ?? "",
              pool_address: poolAddress,
              tokens: existingPool.tokens ?? [],
              metadata: {
                ...(existingPool.metadata ?? {}),
                factory: factoryAddress,
                factoryIndex: index,
              },
              status: existingPool.status ?? "active",
              removed_block: existingPool.removed_block ?? null,
            },
          };
        }
        if (existingPool) return null;

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
          isNew: true,
          pool: {
            protocol: protocolKey,
            block: checkpointBlock ?? 0,
            tx: "",
            pool_address: poolAddress,
            tokens,
            metadata: {
              ...metadataForPool(poolAddress, tokens),
              factory: factoryAddress,
              factoryIndex: index,
            },
            status: "active",
          },
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

  const listedPools = listedPoolEntries.filter(Boolean) as Array<{ isNew: boolean; pool: any }>;
  const poolBatch = listedPools.map((entry) => entry.pool);
  const newPools = listedPools.filter((entry) => entry.isNew);
  if (poolBatch.length > 0) {
    registry.batchUpsertPools(poolBatch);
  }
  if (checkpointBlock != null) registry.setCheckpoint(protocolKey, checkpointBlock);

  console.log(`  Inserted ${newPools.length} new pool(s), refreshed ${poolBatch.length - newPools.length} existing pool(s) for ${protocolName}.`);
  discoveryLogger.info(
    {
      protocol: protocolKey,
      enumeratedPools: poolCount,
      scanStartIndex: startIndex,
      scannedSlots: scanCount,
      insertedPools: newPools.length,
      refreshedPools: poolBatch.length - newPools.length,
      checkpointBlock,
    },
    "[discovery] Curve factory scan complete",
  );

  const hydrationPromise =
    newPools.length > 0
      ? hydrateNewTokens(newPools.map((entry) => entry.pool), registry).catch((err) => {
          console.warn(`  [discover] Token hydration failed: ${err.message}`);
          return 0;
        })
      : null;

  return {
    discovered: newPools.length,
    checkpointBlock,
    rollbackGuard: null,
    hydrationPromise,
  };
}
