
/**
 * src/discovery/discover.js — Core discovery engine
 *
 * Orchestrates per-protocol pool discovery:
 *   1. Resume from checkpoint (or start from genesis)
 *   2. Build HyperSync query with minimal field selection + JoinNothing
 *   3. Paginated fetch via fetchAllLogs()
 *   4. ABI decode all logs
 *   5. Batch on-chain enrichment with concurrency throttling
 *   6. Batch insert into registry + update checkpoint from nextBlock
 */

import { client, Decoder, LogField } from "../hypersync/client.ts";
import { fetchAllLogs } from "../hypersync/paginate.ts";
import { topic0sForSignatures } from "../hypersync/topics.ts";
import {
  buildHyperSyncLogQuery,
  DEFAULT_HYPERSYNC_LOG_FIELDS,
} from "../hypersync/query_policy.ts";
import { RegistryService } from "../db/registry.ts";
import { PROTOCOLS, CURVE_POOL_REMOVED } from "../protocols/index.ts";
import { detectReorg } from "../reorg/detect.ts";
import { throttledMap } from "../enrichment/rpc.ts";
import { hydrateNewTokens } from "../enrichment/token_hydrator.ts";
import {
  GENESIS_START_BLOCK,
  DB_PATH,
  ENVIO_API_TOKEN,
  HYPERSYNC_URL,
  ENRICH_CONCURRENCY,
  DISCOVERY_PROTOCOL_CONCURRENCY,
} from "../config/index.ts";
import { logger } from "../utils/logger.ts";
import { buildDiscoveredPoolBatch, type DiscoveredPoolCandidate, type DiscoveryRawLog } from "./helpers.ts";
import type { DecodeResult, ProtocolDefinition } from "../protocols/factories.ts";
import type { HyperSyncLogQuery } from "../hypersync/query_policy.ts";

type DiscoveryProtocol = ProtocolDefinition & {
  signatures?: string[];
  decode: NonNullable<ProtocolDefinition["decode"]>;
};

const discoveryQuerySpecCache = new Map<string, {
  topic0s: string[];
  decoder: InstanceType<typeof Decoder>;
}>();
const discoveryLogger = logger.child({ component: "discovery" });

function discoveryQueryToBlock(chainHeight: number | string | null | undefined) {
  if (chainHeight == null) {
    return undefined;
  }

  const numericChainHeight = Number(chainHeight);
  if (!Number.isFinite(numericChainHeight) || numericChainHeight < 0) {
    return undefined;
  }
  return numericChainHeight + 1;
}

function discoveryCheckpointFromNextBlock(nextBlock: number | null, fallbackFromBlock: number) {
  const numericNextBlock = Number(nextBlock);
  if (Number.isFinite(numericNextBlock) && numericNextBlock > 0) {
    return numericNextBlock - 1;
  }
  return Math.max(0, fallbackFromBlock - 1);
}

function normalizeDiscoveryDecodeResult(extracted: unknown): DecodeResult {
  const decoded = extracted && typeof extracted === "object"
    ? extracted as Record<string, unknown>
    : {};
  const poolAddress = typeof decoded.pool_address === "string"
    ? decoded.pool_address.trim().toLowerCase()
    : undefined;
  const tokens = Array.isArray(decoded.tokens)
    ? decoded.tokens
        .map((token) => (typeof token === "string" ? token.trim().toLowerCase() : null))
        .filter((token): token is string => Boolean(token))
    : [];
  const metadata =
    decoded.metadata && typeof decoded.metadata === "object" && !Array.isArray(decoded.metadata)
      ? decoded.metadata as Record<string, unknown>
      : {};

  return {
    pool_address: poolAddress,
    tokens,
    metadata,
  };
}

function assertDecodedLogsAligned(protocolName: string, logs: DiscoveryRawLog[], decodedLogs: unknown[]) {
  if (!Array.isArray(decodedLogs)) {
    throw new Error(`${protocolName} decoder returned a non-array decode result.`);
  }
  if (decodedLogs.length !== logs.length) {
    throw new Error(
      `${protocolName} decoder returned ${decodedLogs.length} decoded log(s) for ${logs.length} raw log(s).`,
    );
  }
}

export function decodeDiscoveryLogs(
  protocol: DiscoveryProtocol,
  logs: DiscoveryRawLog[],
  decodedLogs: unknown[],
): { extractedPools: DiscoveredPoolCandidate[]; errors: number } {
  assertDecodedLogsAligned(protocol.name, logs, decodedLogs);
  let errors = 0;
  const extractedPools: DiscoveredPoolCandidate[] = [];

  for (let i = 0; i < decodedLogs.length; i++) {
    const decoded = decodedLogs[i];
    const rawLog = logs[i];
    if (!decoded) continue;

    try {
      const extracted = normalizeDiscoveryDecodeResult(protocol.decode(decoded, rawLog) as DecodeResult);
      if (!extracted.pool_address || typeof extracted.pool_address !== "string") {
        console.warn(
          `  Warning: Could not extract pool address for ${protocol.name} at block ${rawLog.blockNumber}`
        );
        continue;
      }
      extractedPools.push({ extracted, rawLog });
    } catch (innerError: any) {
      errors++;
      if (errors <= 5) {
        console.error(
          `  Error decoding log #${i} for ${protocol.name}: ${innerError.message}`
        );
      }
    }
  }

  return { extractedPools, errors };
}

function getDiscoveryQuerySpec(protocol: DiscoveryProtocol) {
  const signatures = protocol.signatures?.length
    ? protocol.signatures
    : protocol.signature
      ? [protocol.signature]
      : [];
  const cacheKey = `${protocol.address.toLowerCase()}:${signatures.join("|")}`;
  const cached = discoveryQuerySpecCache.get(cacheKey);
  if (cached) return cached;

  const topic0s = topic0sForSignatures(signatures);
  const spec = {
    topic0s,
    decoder: Decoder.fromSignatures(signatures),
  };
  discoveryQuerySpecCache.set(cacheKey, spec);
  return spec;
}

export function buildDiscoveryScanQuery(protocol: DiscoveryProtocol, fromBlock: number, chainHeight?: number | null) {
  const { topic0s } = getDiscoveryQuerySpec(protocol);
  const toBlock = discoveryQueryToBlock(chainHeight);
  return buildHyperSyncLogQuery({
    fromBlock,
    ...(toBlock != null ? { toBlock } : {}),
    logs: [
      {
        address: [protocol.address],
        topics: [topic0s],
      },
    ],
    logFields: DEFAULT_HYPERSYNC_LOG_FIELDS,
  });
}

async function enrichDiscoveredPools(protocol: DiscoveryProtocol, extractedPools: DiscoveredPoolCandidate[]) {
  if (!protocol.enrichTokens) return;

  const needsEnrichment = extractedPools.filter((p) => p.extracted.tokens.length === 0);
  if (needsEnrichment.length === 0) return;

  console.log(
    `  Enriching ${needsEnrichment.length} pools via RPC (concurrency=${ENRICH_CONCURRENCY})...`
  );

  const enrichedTokens = await throttledMap(
    needsEnrichment,
    (item) => protocol.enrichTokens!(item.extracted),
    ENRICH_CONCURRENCY
  );

  for (let i = 0; i < needsEnrichment.length; i++) {
    needsEnrichment[i].extracted.tokens = enrichedTokens[i] || [];
  }
}

// ─── Per-protocol discovery ────────────────────────────────────

async function discoverProtocol(
  key: string,
  protocol: DiscoveryProtocol,
  registry: RegistryService,
  context: { chainHeight?: number | null } = {},
) {
  if (typeof protocol.discover === "function") {
    return protocol.discover({ key, protocol, registry, ...context });
  }
  const checkpoint = registry.getCheckpoint(key);
  const existingPoolCount = registry.getPoolCountForProtocol(key);
  const existingCheckpointBlock = Number(checkpoint?.last_block);
  const shouldBackfillEmptyProtocol =
    !!checkpoint &&
    existingPoolCount === 0 &&
    Number.isFinite(existingCheckpointBlock) &&
    existingCheckpointBlock >= GENESIS_START_BLOCK;

  const fromBlock = shouldBackfillEmptyProtocol
    ? GENESIS_START_BLOCK
    : Number.isFinite(existingCheckpointBlock)
      ? existingCheckpointBlock + 1
      : GENESIS_START_BLOCK;

  console.log(
    `\n[${protocol.name}] Discovering from block ${fromBlock}` +
      (shouldBackfillEmptyProtocol
        ? ` (protocol empty at checkpoint tip — replaying from genesis)`
        : checkpoint
          ? ` (resumed from checkpoint)`
          : ` (genesis start)`) +
      `...`
  );
  discoveryLogger.info(
    {
      protocol: key,
      fromBlock,
      resumed: Boolean(checkpoint),
      backfillEmptyProtocol: shouldBackfillEmptyProtocol,
      chainHeight: context.chainHeight ?? null,
    },
    "[discovery] Protocol scan starting",
  );

  const { decoder } = getDiscoveryQuerySpec(protocol);
  const query: HyperSyncLogQuery = buildDiscoveryScanQuery(protocol, fromBlock, context.chainHeight);

  const { logs, rollbackGuard, nextBlock } = await fetchAllLogs<DiscoveryRawLog>(query);
  const checkpointBlock = discoveryCheckpointFromNextBlock(nextBlock, fromBlock);

  if (logs.length === 0) {
    console.log(`  No new logs found for ${protocol.name}.`);
    registry.setCheckpoint(key, checkpointBlock);
    return { discovered: 0, checkpointBlock, rollbackGuard };
  }

  console.log(`  Found ${logs.length} discovery events for ${protocol.name}.`);

  const decodedLogs = await decoder.decodeLogs(logs);

  const { extractedPools, errors } = decodeDiscoveryLogs(protocol, logs, decodedLogs);
  await enrichDiscoveredPools(protocol, extractedPools);
  const poolBatch = buildDiscoveredPoolBatch(key, extractedPools);

  let hydrationPromise: Promise<number> | null = null;
  if (poolBatch.length > 0) {
    registry.batchUpsertPools(poolBatch);
    hydrationPromise = hydrateNewTokens(poolBatch, registry).catch((err) => {
      console.warn(`  [discover] Token hydration failed: ${err.message}`);
      return 0;
    });
  }

  registry.setCheckpoint(key, checkpointBlock);

  if (errors > 5) console.warn(`  ... and ${errors - 5} more decode errors suppressed.`);
  console.log(`  Inserted/updated ${poolBatch.length} pools for ${protocol.name}.`);
  discoveryLogger.info(
    {
      protocol: key,
      logs: logs.length,
      decodedPools: extractedPools.length,
      insertedPools: poolBatch.length,
      decodeErrors: errors,
      checkpointBlock,
    },
    "[discovery] Protocol scan complete",
  );

  return { discovered: poolBatch.length, checkpointBlock, rollbackGuard, hydrationPromise };
}

// ─── Curve PoolRemoved lifecycle ───────────────────────────────

async function discoverCurveRemovals(registry: RegistryService, context: { chainHeight?: number | null } = {}) {
  const checkpointKey = "CURVE_POOL_REMOVED";
  const checkpoint = registry.getCheckpoint(checkpointKey);
  const existingCheckpointBlock = Number(checkpoint?.last_block);
  const fromBlock = Number.isFinite(existingCheckpointBlock) ? existingCheckpointBlock + 1 : GENESIS_START_BLOCK;

  console.log(`\n[Curve PoolRemoved] Scanning from block ${fromBlock}...`);

  const { topic0s, decoder } = getDiscoveryQuerySpec(CURVE_POOL_REMOVED as DiscoveryProtocol);

  const toBlock = discoveryQueryToBlock(context.chainHeight);
  const query = buildHyperSyncLogQuery({
    fromBlock,
    ...(toBlock != null ? { toBlock } : {}),
    logs: [
      {
        address: [CURVE_POOL_REMOVED.address],
        topics: [topic0s],
      },
    ],
    logFields: [
      LogField.Address,
      LogField.Topic0,
      LogField.Topic1,
      LogField.BlockNumber,
      LogField.TransactionHash,
    ],
  });

  const { logs, rollbackGuard, nextBlock } = await fetchAllLogs(query);
  const checkpointBlock = discoveryCheckpointFromNextBlock(nextBlock, fromBlock);

  if (logs.length === 0) {
    console.log(`  No Curve PoolRemoved events found.`);
    registry.setCheckpoint(checkpointKey, checkpointBlock);
    return { removed: 0, checkpointBlock, rollbackGuard };
  }

  const decodedLogs = await decoder.decodeLogs(logs);
  const removedPoolBlocks = new Map<string, number>();

  for (let i = 0; i < decodedLogs.length; i++) {
    const decoded = decodedLogs[i];
    if (!decoded) continue;

    const poolAddress = decoded.indexed[0]?.val?.toString()?.toLowerCase();
    const blockNumber = Number((logs[i] as any)?.blockNumber ?? 0);
    if (poolAddress) {
      const prior = removedPoolBlocks.get(poolAddress);
      if (prior == null || (Number.isFinite(blockNumber) && blockNumber < prior)) {
        removedPoolBlocks.set(poolAddress, Number.isFinite(blockNumber) ? blockNumber : 0);
      }
    }
  }

  const removed = registry.batchRemovePools(
    [...removedPoolBlocks.entries()].map(([address, block]) => ({
      address,
      removed_block: block,
    })),
  );
  registry.setCheckpoint(checkpointKey, checkpointBlock);
  console.log(`  Marked ${removed} pools as removed from ${removedPoolBlocks.size} removal event(s).`);
  discoveryLogger.info(
    {
      protocol: checkpointKey,
      removalEvents: removedPoolBlocks.size,
      poolsRemoved: removed,
      checkpointBlock,
    },
    "[discovery] Curve removal scan complete",
  );
  return { removed, checkpointBlock, rollbackGuard };
}

function protocolSupportsDiscovery(protocol: DiscoveryProtocol) {
  if (protocol.capabilities?.discovery === false) return false;
  return protocol.capabilities?.execution !== false;
}

type DiscoverPoolsDeps = {
  registry?: RegistryService;
  protocols?: Record<string, DiscoveryProtocol>;
  getChainHeightFn?: () => Promise<number>;
  discoverProtocolFn?: typeof discoverProtocol;
  discoverCurveRemovalsFn?: typeof discoverCurveRemovals;
  detectReorgFn?: typeof detectReorg;
  protocolConcurrency?: number;
};

// ─── Public entry point ────────────────────────────────────────

export async function discoverPoolsWithDeps(deps: DiscoverPoolsDeps = {}) {
  const registry = deps.registry ?? new RegistryService(DB_PATH);
  const shouldCloseRegistry = !deps.registry;
  const protocols = deps.protocols ?? (PROTOCOLS as Record<string, DiscoveryProtocol>);
  const getChainHeightFn = deps.getChainHeightFn ?? (async () => Number(await client.getHeight()));
  const discoverProtocolFn = deps.discoverProtocolFn ?? discoverProtocol;
  const discoverCurveRemovalsFn = deps.discoverCurveRemovalsFn ?? discoverCurveRemovals;
  const detectReorgFn = deps.detectReorgFn ?? detectReorg;
  const protocolConcurrency = Math.max(1, Number(deps.protocolConcurrency ?? DISCOVERY_PROTOCOL_CONCURRENCY) || 1);
  const pendingHydrations: Promise<number>[] = [];
  let chainHeight: number | null = null;

  console.log("=== Polygon Pool Discovery (HyperSync) ===");
  console.log(`HyperSync URL: ${HYPERSYNC_URL}`);
  console.log(`API Token: ${ENVIO_API_TOKEN ? "configured" : "NOT SET"}`);

  try {
    chainHeight = await getChainHeightFn();
    console.log(`Chain height: ${chainHeight}`);
  } catch (e: any) {
    console.warn(`Could not fetch chain height: ${e.message}`);
  }

  let totalDiscovered = 0;
  const discoveryEntries = (Object.entries(protocols) as Array<[string, DiscoveryProtocol]>).filter(([, protocol]) => {
    if (!protocolSupportsDiscovery(protocol)) {
      console.log(`Skipping ${protocol.name}: discovery disabled for non-executable protocol.`);
      return false;
    }
    return true;
  });

  discoveryLogger.info(
    {
      protocols: discoveryEntries.length,
      protocolConcurrency,
      chainHeight,
    },
    "[discovery] Starting protocol batch",
  );

  try {
    const protocolResults = await throttledMap(
      discoveryEntries,
      async ([key, protocol]: [string, DiscoveryProtocol]) => {
        try {
          const result = await discoverProtocolFn(key, protocol, registry, { chainHeight });
          return { key, protocol, result, error: null };
        } catch (error: any) {
          return { key, protocol, result: null, error };
        }
      },
      protocolConcurrency,
    );

    for (const entry of protocolResults) {
      if (entry.error) {
        console.error(`Error discovering ${entry.protocol.name}: ${entry.error.message}`);
        console.error(entry.error.stack);
        continue;
      }

      const result = entry.result;
      totalDiscovered += result.discovered;
      if (result.hydrationPromise) pendingHydrations.push(result.hydrationPromise);

      if (result.rollbackGuard) {
        const reorgBlock = detectReorgFn(registry, result.rollbackGuard);
        if (reorgBlock !== false) {
          console.warn(`\n⚠ REORG DETECTED at block ${reorgBlock}! Rolling back...`);
          const rb: any = registry.rollbackToBlock(reorgBlock);
          console.warn(`  Rolled back: ${rb.poolsRemoved} pools, ${rb.statesRemoved} states`);
        }
        registry.setRollbackGuard(result.rollbackGuard);
      }
    }

    try {
      const result = await discoverCurveRemovalsFn(registry, { chainHeight });
      if (result.rollbackGuard) {
        const reorgBlock = detectReorgFn(registry, result.rollbackGuard);
        if (reorgBlock !== false) {
          console.warn(`\n⚠ REORG DETECTED at block ${reorgBlock}! Rolling back...`);
          const rb: any = registry.rollbackToBlock(reorgBlock);
          console.warn(`  Rolled back: ${rb.poolsRemoved} pools, ${rb.statesRemoved} states`);
        }
        registry.setRollbackGuard(result.rollbackGuard);
      }
    } catch (error: any) {
      console.error(`Error discovering Curve removals: ${error.message}`);
    }

    if (pendingHydrations.length > 0) {
      console.log(`Waiting for ${pendingHydrations.length} token hydration task(s) to finish...`);
      await Promise.allSettled(pendingHydrations);
    }

    const totalPools = registry.getPoolCount();
    const activePools = registry.getActivePoolCount();
    console.log(`\n=== Discovery Complete ===`);
    console.log(`New pools discovered this run: ${totalDiscovered}`);
    console.log(`Total pools in registry: ${totalPools} (${activePools} active)`);

    return { totalDiscovered, totalPools, activePools };
  } finally {
    if (shouldCloseRegistry) {
      registry.close();
    }
  }
}

export async function discoverPools() {
  return discoverPoolsWithDeps();
}
