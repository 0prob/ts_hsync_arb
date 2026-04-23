import { logger } from "../utils/logger.ts";
import type { DecodeResult } from "../protocols/factories.ts";

const discoveryLogger = logger.child({ component: "discovery" });

export type DiscoveryRawLog = {
  blockNumber: number | string;
  transactionHash?: string;
};

export type DiscoveredPoolCandidate = {
  extracted: DecodeResult;
  rawLog: DiscoveryRawLog;
};

export function buildDiscoveredPoolBatch(key: string, extractedPools: DiscoveredPoolCandidate[]) {
  const initializedPools = extractedPools.filter(({ extracted }) => extracted.tokens.length >= 2);
  const skipped = extractedPools.length - initializedPools.length;
  if (skipped > 0) {
    console.log(`  Skipped ${skipped} uninitialized pool(s) with no token data.`);
  }

  const latestByPoolAddress = new Map<string, Record<string, unknown>>();
  for (const { extracted, rawLog } of initializedPools) {
    const poolAddress = String(extracted.pool_address).toLowerCase();
    latestByPoolAddress.set(poolAddress, {
      protocol: key,
      block: Number(rawLog.blockNumber),
      tx: rawLog.transactionHash,
      pool_address: poolAddress,
      tokens: extracted.tokens,
      metadata: extracted.metadata,
      status: "active",
    });
  }

  const deduped = [...latestByPoolAddress.values()];
  if (deduped.length !== initializedPools.length) {
    discoveryLogger.info(
      {
        protocol: key,
        initializedPools: initializedPools.length,
        dedupedPools: deduped.length,
      },
      "[discovery] Deduplicated discovered pool batch",
    );
  }
  return deduped;
}
