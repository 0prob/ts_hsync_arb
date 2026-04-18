
/**
 * src/discovery/uniswapv3.js — Uniswap V3 pool discovery
 *
 * Indexes PoolCreated(token0, token1, fee, tickSpacing, pool) events
 * from the Uniswap V3 Factory on Polygon via HyperSync.
 *
 * Token ordering is preserved as emitted (token0 < token1 by address,
 * enforced by the V3 factory).
 *
 * HyperSync compliance notes:
 *   - uses `joinMode: JoinNothing` to avoid unnecessary joins
 *   - resumes from `nextBlock - 1` checkpoint semantics to prevent skips
 *
 * Output registry format:
 *   {
 *     pool_address: string,
 *     tokens: [token0, token1],
 *     metadata: { fee: string, tickSpacing: string },
 *     protocol: "UNISWAP_V3",
 *     block: number,
 *     tx: string,
 *     status: "active",
 *   }
 */

import { encodeEventTopics, parseAbiItem } from "viem";
import {
  Decoder,
  LogField,
  BlockField,
  JoinMode,
  fetchAllLogs,
} from "../hypersync/index.ts";
import { GENESIS_START_BLOCK } from "../config/index.ts";

const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
export const PROTOCOL_KEY = "UNISWAP_V3";

const POOL_CREATED_SIG =
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)";

function checkpointFromNextBlock(nextBlock, fallbackFromBlock) {
  if (Number.isFinite(nextBlock) && nextBlock > 0) {
    return nextBlock - 1;
  }
  return Math.max(0, fallbackFromBlock - 1);
}

const _abiItem = parseAbiItem(POOL_CREATED_SIG);
const _topic0 = encodeEventTopics({
  abi: [_abiItem],
  eventName: _abiItem.name,
})[0];
const _decoder = Decoder.fromSignatures([POOL_CREATED_SIG]);

function decodePoolCreated(decoded, rawLog) {
  const token0 = decoded.indexed[0]?.val?.toString();
  const token1 = decoded.indexed[1]?.val?.toString();
  const fee = Number(decoded.indexed[2]?.val);
  const tickSpacing = Number(decoded.body[0]?.val);
  const pool = decoded.body[1]?.val?.toString();

  return {
    pool_address: pool,
    tokens: [token0, token1],
    metadata: { fee: String(fee), tickSpacing: String(tickSpacing) },
    protocol: PROTOCOL_KEY,
    block: Number(rawLog.blockNumber),
    tx: rawLog.transactionHash,
    status: "active",
  };
}

export async function fetchV3Pools(fromBlock = GENESIS_START_BLOCK) {
  const query = {
    fromBlock,
    logs: [
      {
        address: [UNISWAP_V3_FACTORY],
        topics: [[_topic0]],
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
      ],
      block: [BlockField.Number, BlockField.Timestamp],
    },
  };

  const { logs, rollbackGuard, nextBlock } = await fetchAllLogs(query);

  if (logs.length === 0) {
    return { pools: [], rollbackGuard, nextBlock };
  }

  const decodedLogs = await _decoder.decodeLogs(logs);
  const pools = [];

  for (let i = 0; i < decodedLogs.length; i++) {
    const decoded = decodedLogs[i];
    if (!decoded) continue;

    try {
      const pool = decodePoolCreated(decoded, logs[i]);
      if (!pool.pool_address) continue;
      pools.push(pool);
    } catch {
      // Skip unparseable logs silently
    }
  }

  return { pools, rollbackGuard, nextBlock };
}

export async function discoverV3Pools(registry, fromBlock) {
  const checkpoint = registry.getCheckpoint(PROTOCOL_KEY);
  const startBlock =
    fromBlock ??
    (checkpoint ? checkpoint.last_block + 1 : GENESIS_START_BLOCK);

  console.log(`[Uniswap V3] Discovering from block ${startBlock}...`);

  const { pools, rollbackGuard, nextBlock } = await fetchV3Pools(startBlock);

  if (pools.length > 0) {
    registry.batchUpsertPools(pools);
    console.log(`[Uniswap V3] Inserted/updated ${pools.length} pools.`);
  } else {
    console.log(`[Uniswap V3] No new pools found.`);
  }

  registry.setCheckpoint(
    PROTOCOL_KEY,
    checkpointFromNextBlock(nextBlock, startBlock)
  );

  return { discovered: pools.length, rollbackGuard, nextBlock };
}
