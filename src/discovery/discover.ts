
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

import { encodeEventTopics, parseAbiItem } from "viem";
import { client, Decoder, LogField, BlockField, JoinMode } from "../hypersync/client.ts";
import { fetchAllLogs } from "../hypersync/paginate.ts";
import { RegistryService } from "../db/registry.ts";
import { PROTOCOLS, CURVE_POOL_REMOVED } from "../protocols/index.ts";
import { detectReorg } from "../reorg/detect.ts";
import { throttledMap } from "../enrichment/rpc.ts";
import { hydrateNewTokens } from "../enrichment/token_hydrator.ts";
import { GENESIS_START_BLOCK, DB_PATH, ENVIO_API_TOKEN, HYPERSYNC_URL, ENRICH_CONCURRENCY } from "../config/index.ts";

function discoveryCheckpointFromNextBlock(nextBlock: any, fallbackFromBlock: any) {
  if (Number.isFinite(nextBlock) && nextBlock > 0) {
    return nextBlock - 1;
  }
  return Math.max(0, fallbackFromBlock - 1);
}

// ─── Per-protocol discovery ────────────────────────────────────

async function discoverProtocol(key: any, protocol: any, registry: any) {
  const checkpoint = registry.getCheckpoint(key);
  const fromBlock = checkpoint ? checkpoint.last_block + 1 : GENESIS_START_BLOCK;

  console.log(
    `\n[${protocol.name}] Discovering from block ${fromBlock}` +
      (checkpoint ? ` (resumed from checkpoint)` : ` (genesis start)`) +
      `...`
  );

  const abiItem = parseAbiItem(protocol.signature) as any;
  const topics = encodeEventTopics({ abi: [abiItem], eventName: abiItem.name });
  const topic0 = topics[0];

  const query = {
    fromBlock,
    logs: [
      {
        address: [protocol.address],
        topics: [[topic0]],
      },
    ],
    joinMode: JoinMode.JoinNothing,
    fieldSelection: {
      log: [
        LogField.Address,
        LogField.Data,
        LogField.Topic0,
        LogField.Topic1,
        LogField.Topic2,
        LogField.Topic3,
        LogField.BlockNumber,
        LogField.TransactionHash,
        LogField.LogIndex,
        LogField.TransactionIndex,
      ],
      block: [BlockField.Number, BlockField.Timestamp],
    },
  };

  const { logs, rollbackGuard, nextBlock } = await fetchAllLogs(query);
  const checkpointBlock = discoveryCheckpointFromNextBlock(nextBlock, fromBlock);

  if (logs.length === 0) {
    console.log(`  No new logs found for ${protocol.name}.`);
    registry.setCheckpoint(key, checkpointBlock);
    return { discovered: 0, checkpointBlock, rollbackGuard };
  }

  console.log(`  Found ${logs.length} discovery events for ${protocol.name}.`);

  const decoder = Decoder.fromSignatures([protocol.signature]);
  const decodedLogs = await decoder.decodeLogs(logs);

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

  if (protocol.enrichTokens) {
    const needsEnrichment = extractedPools.filter(
      (p) => p.extracted.tokens.length === 0
    );

    if (needsEnrichment.length > 0) {
      console.log(
        `  Enriching ${needsEnrichment.length} pools via RPC (concurrency=${ENRICH_CONCURRENCY})...`
      );

      const enrichedTokens = await throttledMap(
        needsEnrichment,
        async (item: any) => {
          try {
            return await protocol.enrichTokens(item.extracted);
          } catch (err: any) {
            console.error(
              `  Enrichment failed for ${item.extracted.pool_address}: ${err.message}`
            );
            return [];
          }
        },
        ENRICH_CONCURRENCY
      );

      for (let i = 0; i < needsEnrichment.length; i++) {
        needsEnrichment[i].extracted.tokens = enrichedTokens[i];
      }
    }
  }

  const initializedPools = extractedPools.filter(
    ({ extracted }) => extracted.tokens.length >= 2
  );
  const skipped = extractedPools.length - initializedPools.length;
  if (skipped > 0) {
    console.log(`  Skipped ${skipped} uninitialized pool(s) with no token data.`);
  }

  const poolBatch = initializedPools.map(({ extracted, rawLog }) => ({
    protocol: key,
    block: Number(rawLog.blockNumber),
    tx: rawLog.transactionHash,
    pool_address: extracted.pool_address,
    tokens: extracted.tokens,
    metadata: extracted.metadata,
    status: "active",
  }));

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

  return { discovered: poolBatch.length, checkpointBlock, rollbackGuard, hydrationPromise };
}

// ─── Curve PoolRemoved lifecycle ───────────────────────────────

async function discoverCurveRemovals(registry: any) {
  const checkpointKey = "CURVE_POOL_REMOVED";
  const checkpoint = registry.getCheckpoint(checkpointKey);
  const fromBlock = checkpoint ? checkpoint.last_block + 1 : GENESIS_START_BLOCK;

  console.log(`\n[Curve PoolRemoved] Scanning from block ${fromBlock}...`);

  const abiItem = parseAbiItem(CURVE_POOL_REMOVED.signature) as any;
  const topics = encodeEventTopics({ abi: [abiItem], eventName: abiItem.name });
  const topic0 = topics[0];

  const query = {
    fromBlock,
    logs: [
      {
        address: [CURVE_POOL_REMOVED.address],
        topics: [[topic0]],
      },
    ],
    joinMode: JoinMode.JoinNothing,
    fieldSelection: {
      log: [
        LogField.Address,
        LogField.Topic0,
        LogField.Topic1,
        LogField.BlockNumber,
        LogField.TransactionHash,
      ],
      block: [BlockField.Number, BlockField.Timestamp],
    },
  };

  const { logs, rollbackGuard, nextBlock } = await fetchAllLogs(query);
  const checkpointBlock = discoveryCheckpointFromNextBlock(nextBlock, fromBlock);

  if (logs.length === 0) {
    console.log(`  No Curve PoolRemoved events found.`);
    registry.setCheckpoint(checkpointKey, checkpointBlock);
    return { removed: 0, checkpointBlock, rollbackGuard };
  }

  const decoder = Decoder.fromSignatures([CURVE_POOL_REMOVED.signature]);
  const decodedLogs = await decoder.decodeLogs(logs);
  let removed = 0;

  for (let i = 0; i < decodedLogs.length; i++) {
    const decoded = decodedLogs[i];
    if (!decoded) continue;

    const poolAddress = decoded.indexed[0]?.val?.toString();
    if (poolAddress) {
      registry.removePool(poolAddress);
      removed++;
      console.log(`  Pool removed: ${poolAddress} at block ${logs[i].blockNumber}`);
    }
  }

  registry.setCheckpoint(checkpointKey, checkpointBlock);
  console.log(`  Marked ${removed} pools as removed.`);
  return { removed, checkpointBlock, rollbackGuard };
}

// ─── Public entry point ────────────────────────────────────────

export async function discoverPools() {
  const registry = new RegistryService(DB_PATH);
  const pendingHydrations: Promise<number>[] = [];

  console.log("=== Polygon Pool Discovery (HyperSync) ===");
  console.log(`HyperSync URL: ${HYPERSYNC_URL}`);
  console.log(`API Token: ${ENVIO_API_TOKEN ? "configured" : "NOT SET"}`);

  try {
    const chainHeight = await client.getHeight();
    console.log(`Chain height: ${chainHeight}`);
  } catch (e: any) {
    console.warn(`Could not fetch chain height: ${e.message}`);
  }

  let totalDiscovered = 0;

  for (const [key, protocol] of Object.entries(PROTOCOLS)) {
    try {
      const result = await discoverProtocol(key, protocol, registry);
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
