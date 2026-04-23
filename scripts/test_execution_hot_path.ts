import assert from "node:assert/strict";

import { createExecutionCoordinator } from "../src/arb/execution_coordinator.ts";
import { sendTxBundle } from "../src/execution/send_tx.ts";

const ADDRESS = "0x0000000000000000000000000000000000000001";
const PRIVATE_KEY = `0x${"11".repeat(32)}`;

function makeCandidate(id: string) {
  return {
    path: {
      startToken: ADDRESS,
      hopCount: 2,
      logWeight: 0,
      edges: [
        {
          poolAddress: `0x${id.padEnd(40, "a")}`,
          tokenIn: ADDRESS,
          tokenOut: "0x0000000000000000000000000000000000000002",
          protocol: "UNISWAP_V2",
          zeroForOne: true,
        },
        {
          poolAddress: `0x${id.padEnd(40, "b")}`,
          tokenIn: "0x0000000000000000000000000000000000000002",
          tokenOut: ADDRESS,
          protocol: "SUSHISWAP_V2",
          zeroForOne: false,
        },
      ],
    },
    result: {
      amountIn: 1000n,
      amountOut: 1200n,
      profit: 200n,
      totalGas: 100_000,
      poolPath: [`0x${id.padEnd(40, "c")}`, `0x${id.padEnd(40, "d")}`],
      tokenPath: [ADDRESS, "0x0000000000000000000000000000000000000002", ADDRESS],
      hopAmounts: [1000n, 1100n, 1200n],
    },
    assessment: {
      shouldExecute: true,
      netProfit: 200n,
      netProfitAfterGas: 150n,
    },
  };
}

{
  const started: string[] = [];
  let inFlight = 0;
  let maxConcurrent = 0;
  let bundled = 0;

  const coordinator = createExecutionCoordinator({
    liveMode: true,
    privateKey: PRIVATE_KEY,
    executorAddress: ADDRESS,
    rpcUrl: "http://localhost:8545",
    getNonceManager: () => null,
    maxExecutionBatch: 3,
    executionRouteQuarantineMs: 60_000,
    minProfitWei: 1n,
    log: () => {},
    fmtPath: () => "path",
    getRouteFreshness: () => ({ ok: true }),
    getCurrentFeeSnapshot: async () => null,
    getFreshTokenToMaticRate: () => 1n,
    deriveOnChainMinProfit: () => 1n,
    buildArbTx: async (candidate: any) => {
      started.push(candidate.path.edges[0].poolAddress);
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight--;
      return {
        to: ADDRESS,
        data: "0x1234",
        gasLimit: 1n,
        maxFeePerGas: 1n,
        maxPriorityFeePerGas: 1n,
      };
    },
    sendTx: async () => ({ submitted: true, confirmed: false, txHash: "0x1" }),
    sendTxBundle: async (txs: any[]) => {
      bundled = txs.length;
      return { submitted: true, confirmed: false, txHashes: ["0x1", "0x2", "0x3"] };
    },
    hasPendingExecution: () => false,
    scalePriorityFeeByProfitMargin: () => null,
  });

  const result = await coordinator.executeBatchIfIdle(
    [makeCandidate("1"), makeCandidate("2"), makeCandidate("3")],
    "test",
  );

  assert.equal(started.length, 3, "execution coordinator should prepare the full batch");
  assert.equal(bundled, 3, "execution coordinator should bundle all prepared transactions");
  assert(maxConcurrent > 1, "execution candidate preparation should run concurrently");
  assert.equal(result.submitted, true, "prepared batch should be submitted");
}

{
  let quarantinedReason = "";

  const coordinator = createExecutionCoordinator({
    liveMode: true,
    privateKey: PRIVATE_KEY,
    executorAddress: ADDRESS,
    rpcUrl: "http://localhost:8545",
    getNonceManager: () => null,
    maxExecutionBatch: 1,
    executionRouteQuarantineMs: 60_000,
    minProfitWei: 1n,
    log: () => {},
    fmtPath: () => "path",
    getRouteFreshness: () => ({ ok: true }),
    getCurrentFeeSnapshot: async () => null,
    getFreshTokenToMaticRate: () => 1n,
    deriveOnChainMinProfit: () => 1n,
    buildArbTx: async () => ({
      to: ADDRESS,
      data: "0x1234",
      gasLimit: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
    }),
    sendTx: async () => ({ submitted: true, confirmed: false, txHash: "0x1" }),
    sendTxBundle: async () => ({ submitted: true, confirmed: false, txHashes: ["0x1"] }),
    hasPendingExecution: () => false,
    scalePriorityFeeByProfitMargin: () => null,
    onPreparedCandidateError: (_candidate: any, reason: string) => {
      quarantinedReason = reason;
    },
  });

  const result = await coordinator.executeBatchIfIdle([makeCandidate("4")], "test");

  assert.equal(result.submitted, false, "oversized gas limits should not reach submission");
  assert.match(
    quarantinedReason,
    /exceeds Number\.MAX_SAFE_INTEGER/,
    "oversized gas limits should surface an explicit preparation failure",
  );
}

{
  let inFlight = 0;
  let maxConcurrent = 0;

  const result = await sendTxBundle(
    [
      { to: ADDRESS, data: "0x1", value: 0n },
      { to: ADDRESS, data: "0x2", value: 0n },
      { to: ADDRESS, data: "0x3", value: 0n },
    ],
    { privateKey: PRIVATE_KEY },
    {
      submitTx: false,
      publicClient: {
        call: async () => {
          inFlight++;
          maxConcurrent = Math.max(maxConcurrent, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 20));
          inFlight--;
          return { data: "0x" };
        },
      },
      accountFromPrivateKey: () => ({ address: ADDRESS }),
    },
  );

  assert.equal(result.submitted, false, "bundle dry run test should not submit transactions");
  assert(maxConcurrent > 1, "bundle dry runs should execute concurrently");
}

console.log("Execution hot path checks passed.");
