
/**
 * src/execution/send_tx.js — Transaction signer and submitter
 *
 * Optimized for HFT:
 *   - Reuses the shared, persistent PublicClient from gas.js.
 *   - Eliminates redundant client creation overhead.
 */

import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { executionClient } from "./gas.ts";
import { signTransaction, sendPrivateBundle, sendPrivateTx } from "./private_tx.ts";
import { logger } from "../utils/logger.ts";
import { txLatency } from "../utils/metrics.ts";

// ─── Constants ────────────────────────────────────────────────

const DEFAULT_RECEIPT_TIMEOUT_MS = 60_000;
const DEFAULT_DRY_RUN = true;
const MAX_SUBMISSION_RETRIES = 3;
const RECEIPT_POLL_INTERVAL_MS = 5_000;
const RECEIPT_DROP_AFTER_MS = 45_000;
const RECEIPT_MISS_THRESHOLD = 3;

type PendingReceiptEntry = {
  txHash: string;
  fromAddress: string;
  builtTx: any;
  publicClient: any;
  nonceManager?: any;
  submittedAt: number;
  missCount: number;
  lastSeenAt: number;
};

const pendingReceiptPolls = new Map<string, PendingReceiptEntry>();
let receiptPollTimer: ReturnType<typeof setInterval> | null = null;
let receiptPollInFlight = false;
const sendTxLogger: any = logger.child({ component: "send_tx" });

export function classifySubmissionError(error: unknown) {
  const message = String((error as { shortMessage?: string; message?: string } | null | undefined)?.shortMessage
    ?? (error as { message?: string } | null | undefined)?.message
    ?? error
    ?? "").toLowerCase();

  if (message.includes("nonce too low") || message.includes("nonce too high") || message.includes("already known")) {
    return "nonce";
  }
  if (message.includes("insufficient funds")) {
    return "funds";
  }
  if (message.includes("execution reverted")) {
    return "revert";
  }
  if (message.includes("intrinsic gas too low") || message.includes("gas required exceeds allowance")) {
    return "gas";
  }
  return "transient";
}

function stopReceiptPollerIfIdle() {
  if (pendingReceiptPolls.size === 0 && receiptPollTimer) {
    clearInterval(receiptPollTimer);
    receiptPollTimer = null;
  }
}

function clearTrackedReceipt(txHash: string | null | undefined) {
  if (!txHash) return;
  pendingReceiptPolls.delete(txHash);
  stopReceiptPollerIfIdle();
}

export function hasTrackedPendingTx(fromAddress?: string | null | undefined) {
  if (!fromAddress) return pendingReceiptPolls.size > 0;
  const account = fromAddress.toLowerCase();
  for (const entry of pendingReceiptPolls.values()) {
    if (entry.fromAddress.toLowerCase() === account) return true;
  }
  return false;
}

async function pollTrackedReceipt(entry: PendingReceiptEntry) {
  try {
    const receipt = await entry.publicClient.getTransactionReceipt({ hash: entry.txHash });
    if (receipt?.status === "reverted") {
      sendTxLogger.warn({ txHash: entry.txHash }, "Transaction reverted after submission");
      logFailure(entry.txHash, entry.builtTx, receipt);
    } else {
      sendTxLogger.info(
        { txHash: entry.txHash, blockNumber: receipt.blockNumber?.toString?.() },
        "Transaction confirmed via poller"
      );
    }
    clearTrackedReceipt(entry.txHash);
    return;
  } catch {
    // Receipt not found yet.
  }

  try {
    await entry.publicClient.getTransaction({ hash: entry.txHash });
    entry.lastSeenAt = Date.now();
    entry.missCount = 0;
    return;
  } catch {
    entry.missCount++;
  }

  const ageMs = Date.now() - entry.submittedAt;
  if (ageMs < RECEIPT_DROP_AFTER_MS || entry.missCount < RECEIPT_MISS_THRESHOLD) {
    return;
  }

  sendTxLogger.warn({ txHash: entry.txHash, ageMs, missCount: entry.missCount }, "Transaction appears dropped from mempool");
  entry.nonceManager?.markDropped?.(entry.fromAddress);
  clearTrackedReceipt(entry.txHash);
}

async function pollPendingReceipts() {
  if (receiptPollInFlight || pendingReceiptPolls.size === 0) return;
  receiptPollInFlight = true;
  try {
    for (const entry of [...pendingReceiptPolls.values()]) {
      await pollTrackedReceipt(entry);
    }
  } finally {
    receiptPollInFlight = false;
    stopReceiptPollerIfIdle();
  }
}

function trackSubmittedTx(txHash: string, builtTx: any, fromAddress: string, publicClient: any, nonceManager?: any) {
  pendingReceiptPolls.set(txHash, {
    txHash,
    builtTx,
    fromAddress,
    publicClient,
    nonceManager,
    submittedAt: Date.now(),
    missCount: 0,
    lastSeenAt: Date.now(),
  });

  if (!receiptPollTimer) {
    receiptPollTimer = setInterval(() => {
      void pollPendingReceipts();
    }, RECEIPT_POLL_INTERVAL_MS);
    receiptPollTimer.unref?.();
  }
}

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

function rawTxHash(rawTx: string) {
  return keccak256(rawTx as `0x${string}`);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

async function submitSignedTransactionsIndividually(
  rawTxs: string[],
  builtTxs: any[],
  context: {
    fromAddress: string;
    publicClient: any;
    nonceManager?: any;
    sendPrivateTxFn: typeof sendPrivateTx;
    allowPublicFallback: boolean;
  },
) {
  const { fromAddress, publicClient, nonceManager, sendPrivateTxFn, allowPublicFallback } = context;
  const txHashes: `0x${string}`[] = [];

  for (let index = 0; index < rawTxs.length; index++) {
    const result: any = await sendPrivateTxFn(rawTxs[index], { allowPublicFallback });
    if (!result.submitted || !result.txHash) {
      const unsentCount = rawTxs.length - index;
      if (nonceManager) {
        for (let i = 0; i < unsentCount; i++) {
          nonceManager.revert(fromAddress);
        }
      }
      return {
        submitted: false,
        confirmed: false,
        txHashes,
        error: result.error || "sendPrivateTx: no method succeeded during bundle fallback",
      };
    }

    txHashes.push(result.txHash as `0x${string}`);
    nonceManager?.confirm(fromAddress);
    trackSubmittedTx(result.txHash, builtTxs[index], fromAddress, publicClient, nonceManager);
  }

  return {
    submitted: true,
    confirmed: false,
    txHashes,
    submissionMode: "individual_fallback",
  };
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
      sendTxLogger.warn({ error: dryRunResult.error, fromAddress }, "Dry run failed");
      return {
        submitted: false,
        confirmed: false,
        dryRun: dryRunResult,
        error: `Dry run failed: ${dryRunResult.error}`,
      };
    }
    sendTxLogger.debug({ fromAddress }, "Dry run passed");
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
      sendTxLogger.info({ txHash, method: result.method, attempt: attempt + 1 }, "Transaction submitted");

      if (nonceManager) nonceManager.confirm(fromAddress);
      trackSubmittedTx(txHash, builtTx, fromAddress, publicClient, nonceManager);
      submitError = null;
      break;
    } catch (err: any) {
      submitError = err.shortMessage || err.message || String(err);
      sendTxLogger.warn({ error: submitError, attempt: attempt + 1 }, "Submission attempt failed");
      const errorCategory = classifySubmissionError(err);

      if (errorCategory !== "transient") {
        if (nonceManager && errorCategory === "nonce") {
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
    clearTrackedReceipt(txHash);
    if (!confirmed) {
      sendTxLogger.warn({ txHash }, "Transaction reverted");
      logFailure(txHash, builtTx, receipt);
    } else {
      sendTxLogger.info({ txHash, blockNumber: receipt.blockNumber?.toString?.() }, "Transaction confirmed");
    }

    return {
      submitted: true,
      confirmed,
      txHash,
      receipt,
      dryRun: dryRunResult,
    };
  } catch (err: any) {
    sendTxLogger.warn({ txHash, error: err.message }, "Receipt wait failed");
    return {
      submitted: true,
      confirmed: false,
      txHash,
      dryRun: dryRunResult,
      error: err.message,
    };
  }
}

export async function sendTxBundle(builtTxs: any[], config: any, options: any = {}) {
  const {
    privateKey,
    nonceManager,
  } = config;

  const {
    dryRunFirst = DEFAULT_DRY_RUN,
    submitTx = true,
    awaitReceipt = false,
    receiptTimeoutMs = DEFAULT_RECEIPT_TIMEOUT_MS,
    allowPublicFallback = true,
    publicClient: publicClientOverride,
    accountFromPrivateKey = privateKeyToAccount,
    signTransactionFn = signTransaction,
    sendPrivateBundleFn = sendPrivateBundle,
    sendPrivateTxFn = sendPrivateTx,
  } = options;

  if (!privateKey) throw new Error("sendTxBundle: privateKey required");
  if (!Array.isArray(builtTxs) || builtTxs.length === 0) {
    throw new Error("sendTxBundle: builtTxs required");
  }

  const account = accountFromPrivateKey(privateKey);
  const fromAddress = account.address;
  const publicClient = publicClientOverride || executionClient;

  if (dryRunFirst) {
    const dryRunResults = await mapWithConcurrency(
      builtTxs,
      builtTxs.length,
      (builtTx) => dryRun(builtTx, fromAddress, publicClient),
    );
    const failedDryRun = dryRunResults.find((result) => !result.success);
    if (failedDryRun) {
      sendTxLogger.warn(
        { event: "bundle_dry_run_failed", error: failedDryRun.error, bundleSize: builtTxs.length },
        "Bundle dry run failed"
      );
      return {
        submitted: false,
        confirmed: false,
        error: `Bundle dry run failed: ${failedDryRun.error}`,
      };
    }
  }

  if (!submitTx) {
    return {
      submitted: false,
      confirmed: false,
      txHashes: [],
    };
  }

  const reservedNonces: bigint[] = [];
  try {
    if (nonceManager) {
      for (let i = 0; i < builtTxs.length; i++) {
        reservedNonces.push(await nonceManager.next(fromAddress));
      }
    } else {
      const startingNonce = BigInt(await publicClient.getTransactionCount({
        address: fromAddress,
        blockTag: "pending",
      }));
      for (let i = 0; i < builtTxs.length; i++) {
        reservedNonces.push(startingNonce + BigInt(i));
      }
    }

    const rawTxs = await Promise.all(
      builtTxs.map((builtTx, index) =>
        signTransactionFn(builtTx, privateKey, reservedNonces[index], 137)
      )
    );
    const blockNumber = (await publicClient.getBlockNumber()) + 1n;
    const tSubmissionStart = Date.now();

    const result = await sendPrivateBundleFn(rawTxs, { blockNumber });
    txLatency.observe({ stage: "submission" }, Date.now() - tSubmissionStart);

    let txHashes: `0x${string}`[] = rawTxs.map(rawTxHash);
    let bundleHash = result.bundleHash;

    if (!result.submitted && result.retryIndividually) {
      sendTxLogger.warn(
        {
          event: "bundle_fallback_individual",
          error: result.error,
          bundleSize: builtTxs.length,
          blockNumber: blockNumber.toString(),
        },
        "Bundle relay unavailable; falling back to individual private submissions"
      );
      const fallbackResult = await submitSignedTransactionsIndividually(rawTxs, builtTxs, {
        fromAddress,
        publicClient,
        nonceManager,
        sendPrivateTxFn,
        allowPublicFallback,
      });
      if (!fallbackResult.submitted) {
        return fallbackResult;
      }
      txHashes = fallbackResult.txHashes;
      bundleHash = undefined;
    } else if (!result.submitted) {
      throw new Error(result.error || "sendPrivateBundle: no method succeeded");
    } else {
      if (nonceManager) {
        for (let i = 0; i < builtTxs.length; i++) {
          nonceManager.confirm(fromAddress);
        }
      }

      for (let i = 0; i < txHashes.length; i++) {
        trackSubmittedTx(txHashes[i], builtTxs[i], fromAddress, publicClient, nonceManager);
      }
    }

    if (!awaitReceipt) {
      return {
        submitted: true,
        confirmed: false,
        txHashes,
        bundleHash,
      };
    }

    const receipts = await Promise.race([
      Promise.all(txHashes.map((hash) => publicClient.waitForTransactionReceipt({ hash }))),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Bundle receipt timeout")), receiptTimeoutMs)
      ),
    ]) as any[];

    for (const hash of txHashes) clearTrackedReceipt(hash);
    const confirmed = receipts.every((receipt) => receipt?.status === "success");

    return {
      submitted: true,
      confirmed,
      txHashes,
      receipts,
      bundleHash,
    };
  } catch (err: any) {
    if (nonceManager) {
      for (let i = 0; i < reservedNonces.length; i++) {
        nonceManager.revert(fromAddress);
      }
      if (classifySubmissionError(err) === "nonce") {
        nonceManager.resync(fromAddress);
      }
    }
    return {
      submitted: false,
      confirmed: false,
      error: err?.message ?? String(err),
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
  sendTxLogger.error(entry, "Transaction failure details");
}
