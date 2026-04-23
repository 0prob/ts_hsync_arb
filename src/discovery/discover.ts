
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
import { GENESIS_START_BLOCK, DB_PATH, ENVIO_API_TOKEN, HYPERSYNC_URL, ENRICH_CONCURRENCY } from "../config/index.ts";
import { logger } from "../utils/logger.ts";
import { buildDiscoveredPoolBatch } from "./helpers.ts";

type DiscoveryProtocol = {
  name: string;
  address: string;
  signature?: string;
  signatures?: string[];
  decode: (decoded: any, rawLog: any) => any;
  enrichTokens?: (pool: any) => Promise<string[]>;
  discover?: (context: any) => Promise<any>;
  capabilities?: {
    discovery?: boolean;
    execution?: boolean;
  };
};

const discoveryQuerySpecCache = new Map<string, {
  topic0s: string[];
  decoder: InstanceType<typeof Decoder>;
}>();
const discoveryLogger: any = logger.child({ component: "discovery" });

function discoveryCheckpointFromNextBlock(nextBlock: any, fallbackFromBlock: any) {
  if (Number.isFinite(nextBlock) && nextBlock > 0) {
    return nextBlock - 1;
  }
  return Math.max(0, fallbackFromBlock - 1);
}

function decodeDiscoveryLogs(protocol: any, logs: any[], decodedLogs: any[]) {
  let errors = 0;
  const extractedPools = [];

  for (let i = 0; i < decodedLogs.length; i++) {
    const decoded = decodedLogs[i];
    const rawLog = logs[i];
    if (!decoded) continue;

    try {
      const extracted = protocol.decode(decoded, rawLog);
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

async function enrichDiscoveredPools(protocol: any, extractedPools: any[]) {
  if (!protocol.enrichTokens) return;

  const needsEnrichment = extractedPools.filter((p) => p.extracted.tokens.length === 0);
  if (needsEnrichment.length === 0) return;

  console.log(
    `  Enriching ${needsEnrichment.length} pools via RPC (concurrency=${ENRICH_CONCURRENCY})...`
  );

  const enrichedTokens = await throttledMap(
    needsEnrichment,
    (item: any) => protocol.enrichTokens(item.extracted),
    ENRICH_CONCURRENCY
  );

  for (let i = 0; i < needsEnrichment.length; i++) {
    needsEnrichment[i].extracted.tokens = enrichedTokens[i] || [];
  }
}

// ─── Per-protocol discovery ────────────────────────────────────

async function discoverProtocol(key: any, protocol: any, registry: any, context: any = {}) {
  if (typeof protocol.discover === "function") {
    return protocol.discover({ key, protocol, registry, ...context });
  }
  const checkpoint = registry.getCheckpoint(key);
  const existingPoolCount = registry.getPoolCountForProtocol(key);
  const shouldBackfillEmptyProtocol =
    !!checkpoint &&
    existingPoolCount === 0 &&
    checkpoint.last_block >= GENESIS_START_BLOCK;

  const fromBlock = shouldBackfillEmptyProtocol
    ? GENESIS_START_BLOCK
    : checkpoint
      ? checkpoint.last_block + 1
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
    { protocol: key, fromBlock, resumed: Boolean(checkpoint), backfillEmptyProtocol: shouldBackfillEmptyProtocol },
    "[discovery] Protocol scan starting",
  );

  const { topic0s, decoder } = getDiscoveryQuerySpec(protocol);

  const query = buildHyperSyncLogQuery({
    fromBlock,
    logs: [
      {
        address: [protocol.address],
        topics: [topic0s],
      },
    ],
    logFields: DEFAULT_HYPERSYNC_LOG_FIELDS,
  });

  const { logs, rollbackGuard, nextBlock } = await fetchAllLogs(query);
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

async function discoverCurveRemovals(registry: any) {
  const checkpointKey = "CURVE_POOL_REMOVED";
  const checkpoint = registry.getCheckpoint(checkpointKey);
  const fromBlock = checkpoint ? checkpoint.last_block + 1 : GENESIS_START_BLOCK;

  console.log(`\n[Curve PoolRemoved] Scanning from block ${fromBlock}...`);

  const { topic0s, decoder } = getDiscoveryQuerySpec(CURVE_POOL_REMOVED as DiscoveryProtocol);

  const query = buildHyperSyncLogQuery({
    fromBlock,
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
  const removedPoolAddresses = new Set<string>();

  for (let i = 0; i < decodedLogs.length; i++) {
    const decoded = decodedLogs[i];
    if (!decoded) continue;

    const poolAddress = decoded.indexed[0]?.val?.toString()?.toLowerCase();
    if (poolAddress) {
      removedPoolAddresses.add(poolAddress);
    }
  }

  const removed = registry.batchRemovePools([...removedPoolAddresses]);
  registry.setCheckpoint(checkpointKey, checkpointBlock);
  console.log(`  Marked ${removed} pools as removed from ${removedPoolAddresses.size} removal event(s).`);
  discoveryLogger.info(
    {
      protocol: checkpointKey,
      removalEvents: removedPoolAddresses.size,
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

// ─── Public entry point ────────────────────────────────────────

export async function discoverPools() {
  const registry = new RegistryService(DB_PATH);
  const pendingHydrations: Promise<number>[] = [];
  let chainHeight: number | null = null;

  console.log("=== Polygon Pool Discovery (HyperSync) ===");
  console.log(`HyperSync URL: ${HYPERSYNC_URL}`);
  console.log(`API Token: ${ENVIO_API_TOKEN ? "configured" : "NOT SET"}`);

  try {
    chainHeight = await client.getHeight();
    console.log(`Chain height: ${chainHeight}`);
  } catch (e: any) {
    console.warn(`Could not fetch chain height: ${e.message}`);
  }

  let totalDiscovered = 0;

  for (const [key, protocol] of Object.entries(PROTOCOLS)) {
    if (!protocolSupportsDiscovery(protocol as DiscoveryProtocol)) {
      console.log(`Skipping ${protocol.name}: discovery disabled for non-executable protocol.`);
      continue;
    }
    try {
      const result = await discoverProtocol(key, protocol, registry, { chainHeight });
      totalDiscovered += result.discovered;
      if (result.hydrationPromise) pendingHydrations.push(result.hydrationPromise);

      if (result.rollbackGuard) {
        const reorgBlock = detectReorg(registry, result.rollbackGuard);
        if (reorgBlock !== false) {
          console.warn(`\n⚠ REORG DETECTED at block ${reorgBlock}! Rolling back...`);
          const rb: any = registry.rollbackToBlock(reorgBlock);
          console.warn(`  Rolled back: ${rb.poolsRemoved} pools, ${rb.statesRemoved} states`);
        }
        registry.setRollbackGuard(result.rollbackGuard);
      }
    } catch (error: any) {
      console.error(`Error discovering ${protocol.name}: ${error.message}`);
      console.error(error.stack);
    }
  }

  try {
    const result = await discoverCurveRemovals(registry);
    if (result.rollbackGuard) {
      const reorgBlock = detectReorg(registry, result.rollbackGuard);
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

  registry.close();
  return { totalDiscovered, totalPools, activePools };
}
