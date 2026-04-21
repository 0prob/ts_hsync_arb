
/**
 * src/db/registry_history.js — Arbitrage history helpers
 */

import { lowerCaseAddressList, mapArbHistoryRow } from "./registry_codec.ts";

function historyStmt(db: any, key: any, sql: any) {
  return db.statement(key, sql);
}

export function logArbResult(db: any, arb: any) {
  historyStmt(
    db,
    "logArbResult",
      `INSERT INTO arb_history
         (tx_hash, block_number, start_token, hop_count,
          amount_in, amount_out, gross_profit, net_profit,
          gas_used, gas_price_wei, pools, protocols, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .run(
      arb.txHash ?? null,
      arb.blockNumber ?? null,
      arb.startToken.toLowerCase(),
      arb.hopCount,
      String(arb.amountIn),
      String(arb.amountOut),
      String(arb.grossProfit),
      String(arb.netProfit),
      arb.gasUsed ?? null,
      arb.gasPriceWei != null ? String(arb.gasPriceWei) : null,
      JSON.stringify(lowerCaseAddressList(arb.pools)),
      JSON.stringify(arb.protocols),
      arb.status ?? "success"
    );
}

export function getArbHistory(db: any, opts: any = {}) {
  const { limit = 100, startToken, status, since } = opts;
  const conditions = [];
  const params = [];

  if (startToken) {
    conditions.push("start_token = ?");
    params.push(startToken.toLowerCase());
  }
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (since) {
    conditions.push("recorded_at >= ?");
    params.push(since);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const rows = historyStmt(
    db,
    `getArbHistory:${where}`,
    `SELECT * FROM arb_history ${where} ORDER BY recorded_at DESC LIMIT ?`
  ).all(...params, limit);

  return rows.map(mapArbHistoryRow);
}

export function getArbStats(db: any, opts: any = {}) {
  const { since } = opts;
  const whereClause = since ? "WHERE recorded_at >= ?" : "";
  const params = since ? [since] : [];

  const totals = historyStmt(
    db,
    `getArbStatsTotals:${whereClause}`,
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
       SUM(CASE WHEN status = 'reverted' THEN 1 ELSE 0 END) as reverts,
       SUM(CASE WHEN status = 'dropped' THEN 1 ELSE 0 END) as dropped
     FROM arb_history ${whereClause}`
  ).get(...params);

  const profitWhere = since ? "AND recorded_at >= ?" : "";
  const profitRow = historyStmt(
    db,
    `getArbStatsProfit:${profitWhere}`,
    `SELECT
       SUM(CAST(net_profit AS REAL)) as total_net_profit,
       AVG(CAST(net_profit AS REAL)) as avg_net_profit,
       MAX(CAST(net_profit AS REAL)) as max_net_profit
     FROM arb_history
     WHERE status = 'success'
       ${profitWhere}`
  ).get(...(since ? [since] : []));

  const byHop = historyStmt(
    db,
    `getArbStatsByHop:${whereClause}`,
    `SELECT hop_count, COUNT(*) as count
     FROM arb_history ${whereClause}
     GROUP BY hop_count`
  ).all(...params);

  const byHopMap: Record<string, any> = {};
  for (const row of byHop) byHopMap[row.hop_count] = row.count;

  return {
    total: totals.total,
    successes: totals.successes,
    reverts: totals.reverts,
    dropped: totals.dropped,
    totalNetProfit: profitRow.total_net_profit ?? 0,
    avgNetProfit: profitRow.avg_net_profit ?? 0,
    maxNetProfit: profitRow.max_net_profit ?? 0,
    byHopCount: byHopMap,
  };
}
