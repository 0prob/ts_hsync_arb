
/**
 * src/execution/send_tx.js — Transaction signer and submitter
 *
 * Optimized for HFT:
 *   - Reuses the shared, persistent PublicClient from gas.js.
 *   - Eliminates redundant client creation overhead.
 */

import { privateKeyToAccount } from "viem/accounts";
import { executionClient } from "./gas.ts";
import { signTransaction, sendPrivateTx } from "./private_tx.ts";
import { txLatency } from "../utils/metrics.ts";

// ─── Constants ────────────────────────────────────────────────

const DEFAULT_RECEIPT_TIMEOUT_MS = 60_000;
const DEFAULT_DRY_RUN = true;
const MAX_SUBMISSION_RETRIES = 3;

// ─── Dry run ──────────────────────────────────────────────────

/**
 * Simulate the transaction via eth_call before submitting.
 */
async function dryRun(tx: any, fromAddress: any, publicClient: any) {
  try {
    await publicClient.call({
      account: fromAddress,
      to: tx.to,
      data: tx.data,
      value: tx.value ?? 0n,
    });
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.shortMessage || err.message || String(err) };
  }
}

// ─── Submission ───────────────────────────────────────────────

/**
 * Sign and send a transaction.
 *
 * @param {Object} builtTx         Transaction from buildArbTx()
 * @param {Object} config
 * @param {string} config.privateKey       0x-prefixed hex private key
 * @param {import('./nonce_manager.ts').NonceManager} [config.nonceManager]
 * @param {Object} [options]
 */
export async function sendTx(builtTx: any, config: any, options: any = {}) {
  const {
    privateKey,
    nonceManager,
  } = config;

  const {
    dryRunFirst = DEFAULT_DRY_RUN,
    submitTx = true,
    awaitReceipt = true,
    receiptTimeoutMs = DEFAULT_RECEIPT_TIMEOUT_MS,
    allowPublicFallback = true,
    publicClient: publicClientOverride,
    accountFromPrivateKey = privateKeyToAccount,
    signTransactionFn = signTransaction,
    sendPrivateTxFn = sendPrivateTx,
    sleepFn = (ms: any) => new Promise((r) => setTimeout(r, ms)),
  } = options;

  if (!privateKey) throw new Error("sendTx: privateKey required");

  const account = accountFromPrivateKey(privateKey);
  const fromAddress = account.address;
  const publicClient = publicClientOverride || executionClient;

  // 1. Dry run
  let dryRunResult = { success: true, error: null };
  if (dryRunFirst) {
    dryRunResult = await dryRun(builtTx, fromAddress, publicClient);
    if (!dryRunResult.success) {
      console.warn(`[send_tx] Dry run failed: ${dryRunResult.error}`);
      return {
        submitted: false,
        confirmed: false,
        dryRun: dryRunResult,
        error: `Dry run failed: ${dryRunResult.error}`,
      };
    }
    console.log(`[send_tx] Dry run passed`);
  }

  if (!submitTx) {
    return {
      submitted: false,
      confirmed: false,
      dryRun: dryRunResult,
    };
  }

  // 2. Resolve nonce
  let nonce;
  if (nonceManager) {
    nonce = await nonceManager.next(fromAddress);
  }

  // 3. Sign the transaction
  let rawTx;
  try {
    rawTx = await signTransactionFn(builtTx, privateKey, nonce, 137);
  } catch (err: any) {
    if (nonceManager) nonceManager.revert(fromAddress);
    return {
      submitted: false,
      confirmed: false,
      dryRun: dryRunResult,
      error: `Sign failed: ${err.message}`,
    };
  }

  // 4. Submit via parallel private mempool race
  let txHash = null;
  let submitError = null;
  const tSubmissionStart = Date.now();

  for (let attempt = 0; attempt < MAX_SUBMISSION_RETRIES; attempt++) {
    try {
      const result = await sendPrivateTxFn(rawTx, { allowPublicFallback });
      
      // Metric: submission latency
      txLatency.observe({ stage: "submission" }, Date.now() - tSubmissionStart);

      if (!result.submitted) {
        throw new Error(result.error || "sendPrivateTx: no method succeeded");
      }

      txHash = result.txHash;
      console.log(`[send_tx] Submitted via ${result.method}: ${txHash}`);

      if (nonceManager) nonceManager.confirm(fromAddress);
      submitError = null;
      break;
    } catch (err: any) {
      submitError = err.shortMessage || err.message || String(err);
      console.error(`[send_tx] Submission attempt ${attempt + 1} failed: ${submitError}`);

      if (
        submitError.includes("nonce too low") ||
        submitError.includes("insufficient funds") ||
        submitError.includes("execution reverted")
      ) {
        if (nonceManager && submitError.includes("nonce too low")) {
          nonceManager.resync(fromAddress);
        }
        break;
      }

      await sleepFn(500 * (attempt + 1));
    }
  }

  if (!txHash) {
    if (nonceManager) nonceManager.revert(fromAddress);
    return {
      submitted: false,
      confirmed: false,
      dryRun: dryRunResult,
      error: submitError,
    };
  }

  if (!awaitReceipt) {
    return {
      submitted: true,
      confirmed: false,
      txHash,
      dryRun: dryRunResult,
    };
  }

  try {
    const tConfirmationStart = Date.now();
    const receipt = await Promise.race([
      publicClient.waitForTransactionReceipt({ hash: txHash }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Receipt timeout")), receiptTimeoutMs)
      ),
    ]);

    // Metric: confirmation latency
    txLatency.observe({ stage: "confirmation" }, Date.now() - tConfirmationStart);

    const confirmed = receipt.status === "success";
    if (!confirmed) {
      console.warn(`[send_tx] Transaction reverted: ${txHash}`);
      logFailure(txHash, builtTx, receipt);
    } else {
      console.log(`[send_tx] Confirmed in block ${receipt.blockNumber}: ${txHash}`);
    }

    return {
      submitted: true,
      confirmed,
      txHash,
      receipt,
      dryRun: dryRunResult,
    };
  } catch (err: any) {
    console.warn(`[send_tx] Receipt wait failed: ${err.message}`);
    return {
      submitted: true,
      confirmed: false,
      txHash,
      dryRun: dryRunResult,
      error: err.message,
    };
  }
}

// ─── Failure logging ──────────────────────────────────────────

function logFailure(txHash: any, builtTx: any, receipt: any) {
  const entry = {
    timestamp: new Date().toISOString(),
    txHash,
    blockNumber: receipt?.blockNumber?.toString(),
    gasUsed: receipt?.gasUsed?.toString(),
    meta: builtTx.meta,
  };
  console.error(`[send_tx] FAILURE LOG: ${JSON.stringify(entry)}`);
}
