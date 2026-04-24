import assert from "node:assert/strict";

import {
  ensureFreshGasOracle,
  isGasOracleStale,
  oracle,
} from "../src/execution/gas.ts";
import {
  classifySubmissionError,
  sendTx,
} from "../src/execution/send_tx.ts";

const ADDRESS = "0x0000000000000000000000000000000000000001";
const PRIVATE_KEY = `0x${"11".repeat(32)}`;

assert.equal(isGasOracleStale(0), true, "uninitialized gas snapshots should be treated as stale");
assert.equal(isGasOracleStale(Date.now(), { now: Date.now(), maxAgeMs: 15_000 }), false, "fresh gas snapshots should not be treated as stale");

{
  const originalUpdate = oracle.update.bind(oracle);
  const originalState = oracle.getFees();

  oracle.updatedAt = 0;
  oracle.baseFee = 1n;
  oracle.priorityFee = 2n;
  oracle.maxFee = 3n;

  oracle.update = async () => {
    oracle.baseFee = 100n;
    oracle.priorityFee = 20n;
    oracle.maxFee = 220n;
    oracle.updatedAt = Date.now();
  };

  try {
    const fees = await ensureFreshGasOracle({ maxAgeMs: 1, allowStaleOnFailure: false });
    assert.equal(fees.maxFee, 220n, "stale fee snapshots should be refreshed before use");
  } finally {
    oracle.update = originalUpdate;
    oracle.baseFee = originalState.baseFee;
    oracle.priorityFee = originalState.priorityFee;
    oracle.maxFee = originalState.maxFee;
    oracle.updatedAt = originalState.updatedAt;
  }
}

{
  const originalUpdate = oracle.update.bind(oracle);
  const originalState = oracle.getFees();

  oracle.baseFee = 5n;
  oracle.priorityFee = 6n;
  oracle.maxFee = 16n;
  oracle.updatedAt = Date.now() - 60_000;
  oracle.update = async () => {};

  try {
    const fees = await ensureFreshGasOracle({ maxAgeMs: 1, allowStaleOnFailure: true });
    assert.equal(fees.maxFee, 16n, "refresh failures may fall back to previously cached fees when allowed");
    await assert.rejects(
      () => ensureFreshGasOracle({ maxAgeMs: 1, allowStaleOnFailure: false }),
      /no fresh fee snapshot/i,
      "refresh failures should throw when stale-fee fallback is disabled",
    );
  } finally {
    oracle.update = originalUpdate;
    oracle.baseFee = originalState.baseFee;
    oracle.priorityFee = originalState.priorityFee;
    oracle.maxFee = originalState.maxFee;
    oracle.updatedAt = originalState.updatedAt;
  }
}

assert.equal(classifySubmissionError(new Error("nonce too low")), "nonce");
assert.equal(classifySubmissionError(new Error("already known")), "nonce");
assert.equal(classifySubmissionError(new Error("insufficient funds for gas * price + value")), "funds");
assert.equal(classifySubmissionError(new Error("execution reverted: bad swap")), "revert");
assert.equal(classifySubmissionError(new Error("temporary relay outage")), "transient");

{
  const nonceEvents: string[] = [];
  const result = await sendTx(
    { to: ADDRESS, data: "0x1234", gasLimit: 1n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
    {
      privateKey: PRIVATE_KEY,
      nonceManager: {
        async next() {
          nonceEvents.push("next");
          return 7n;
        },
        confirm() {
          nonceEvents.push("confirm");
        },
        revert() {
          nonceEvents.push("revert");
        },
        resync() {
          nonceEvents.push("resync");
        },
      },
    },
    {
      dryRunFirst: false,
      awaitReceipt: false,
      accountFromPrivateKey: () => ({ address: ADDRESS }),
      signTransactionFn: async () => "0xsigned",
      sendPrivateTxFn: async () => {
        throw new Error("nonce too low");
      },
      sleepFn: async () => {},
    },
  );

  assert.equal(result.submitted, false, "nonce submission failures should abort submission");
  assert.deepEqual(
    nonceEvents,
    ["next", "resync", "revert"],
    "nonce failures should resync before releasing the reserved nonce slot",
  );
}

console.log("Send tx / gas checks passed.");
