
/**
 * src/execution/private_tx.js — Polygon private mempool transaction submitter
 *
 * Optimized for HFT:
 *   - Implements parallel submission racing across all configured private relays.
 *   - Minimizes inclusion latency by firing to all endpoints simultaneously.
 */

import { createWalletClient, http } from "viem";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  POLYGON_RPC,
  PRIVATE_MEMPOOL_URL,
  PRIVATE_MEMPOOL_METHOD,
  BLOXROUTE_AUTH,
} from "../config/index.ts";

// ─── Constants ────────────────────────────────────────────────

const FAST_PUBLIC_RPCS = [
  "https://polygon-rpc.com",
  "https://rpc.polygon.technology",
  "https://rpc-mainnet.maticvigil.com",
];

// ─── Low-level JSON-RPC helper ────────────────────────────────

/**
 * Send a raw JSON-RPC request to a URL.
 */
async function jsonRpc(url, method, params, headers = {}) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

// ─── Sign transaction ─────────────────────────────────────────

export async function signTransaction(tx, privateKey, nonce, chainId = 137) {
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(POLYGON_RPC, {
      fetchOptions: { headers: { Connection: 'keep-alive' } }
    }),
  });

  const request = await walletClient.prepareTransactionRequest({
    to: tx.to,
    data: tx.data,
    value: tx.value ?? 0n,
    maxFeePerGas: tx.maxFeePerGas,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    gas: tx.gasLimit,
    ...(nonce != null ? { nonce: Number(nonce) } : {}),
    chainId,
  });

  return await account.signTransaction(request);
}

// ─── Submission strategies ────────────────────────────────────

export async function sendPrivateTransaction(rawTx, rpcUrl) {
  const url = rpcUrl || PRIVATE_MEMPOOL_URL;
  if (!url) throw new Error("sendPrivateTransaction: no URL");

  const response = await jsonRpc(url, "eth_sendPrivateTransaction", [{ tx: rawTx }]);
  if (response.error) throw new Error(`eth_sendPrivateTransaction failed: ${response.error.message}`);
  return response.result;
}

export async function sendViaBloXroute(rawTx, auth) {
  const token = auth || BLOXROUTE_AUTH;
  if (!token) throw new Error("sendViaBloXroute: no auth token");

  const BLOXROUTE_URL = "https://mdn.api.bloxroute.com/";
  const rawHex = rawTx.startsWith("0x") ? rawTx.slice(2) : rawTx;

  const response = await jsonRpc(
    BLOXROUTE_URL,
    "blxr_tx",
    [{ transaction: rawHex }],
    { Authorization: token }
  );

  if (response.error) throw new Error(`blxr_tx failed: ${response.error.message}`);
  return response.result?.tx_hash || response.result;
}

/**
 * Submit a bundle of transactions to BloXroute.
 * @param {string[]} rawTxs  Array of signed raw transactions
 * @param {Object} options   Bundle options (blockNumber, etc.)
 */
export async function sendBundleBloXroute(rawTxs, options = {}, auth) {
  const token = auth || BLOXROUTE_AUTH;
  if (!token) throw new Error("sendBundleBloXroute: no auth token");

  const BLOXROUTE_URL = "https://mdn.api.bloxroute.com/";
  const transactions = rawTxs.map(tx => ({ transaction: tx.startsWith("0x") ? tx.slice(2) : tx }));

  const response = await jsonRpc(
    BLOXROUTE_URL,
    "blxr_submit_bundle",
    [{
      transactions,
      block_number: options.blockNumber,
      min_timestamp: options.minTimestamp,
      max_timestamp: options.maxTimestamp,
    }],
    { Authorization: token }
  );

  if (response.error) throw new Error(`blxr_submit_bundle failed: ${response.error.message}`);
  return response.result;
}

/**
 * Submit a bundle of transactions to Alchemy (Flashbots-compatible).
 */
export async function sendBundleAlchemy(rawTxs, options = {}, rpcUrl) {
  const url = rpcUrl || PRIVATE_MEMPOOL_URL;
  if (!url) throw new Error("sendBundleAlchemy: no URL");

  const response = await jsonRpc(
    url,
    "eth_sendBundle",
    [{
      txs: rawTxs,
      blockNumber: `0x${options.blockNumber.toString(16)}`,
      minTimestamp: options.minTimestamp,
      maxTimestamp: options.maxTimestamp,
    }]
  );

  if (response.error) throw new Error(`eth_sendBundle failed: ${response.error.message}`);
  return response.result;
}

export async function racePublicRPCs(rawTx, rpcs) {
  const targets = (rpcs && rpcs.length > 0) ? rpcs : FAST_PUBLIC_RPCS;

  const submissions = targets.map(async (url) => {
    const response = await jsonRpc(url, "eth_sendRawTransaction", [rawTx]);
    if (response.error) throw new Error(`${url}: ${response.error.message}`);
    return response.result;
  });

  return Promise.any(submissions);
}

// ─── Main private TX sender (Optimized) ────────────────────────

/**
 * Submit a signed transaction via parallel racing across all private relays.
 * 
 * Instead of sequential attempts, we fire to all configured endpoints 
 * simultaneously. This ensures the fastest relay wins and minimizes latency.
 */
export async function sendPrivateTx(rawTx, options = {}) {
  const { allowPublicFallback = true } = options;
  const submissions = [];

  // 1. BloXroute
  if (BLOXROUTE_AUTH) {
    submissions.push(
      sendViaBloXroute(rawTx)
        .then(txHash => ({ txHash, method: "bloxroute" }))
    );
  }

  // 2. eth_sendPrivateTransaction (Alchemy/QuickNode)
  if (PRIVATE_MEMPOOL_URL && PRIVATE_MEMPOOL_METHOD === "eth_sendPrivateTransaction") {
    submissions.push(
      sendPrivateTransaction(rawTx, PRIVATE_MEMPOOL_URL)
        .then(txHash => ({ txHash, method: "eth_sendPrivateTransaction" }))
    );
  }

  // 3. eth_sendRawTransaction to private endpoint
  if (
    PRIVATE_MEMPOOL_URL &&
    (!PRIVATE_MEMPOOL_METHOD || PRIVATE_MEMPOOL_METHOD === "eth_sendRawTransaction")
  ) {
    submissions.push(
      jsonRpc(PRIVATE_MEMPOOL_URL, "eth_sendRawTransaction", [rawTx])
        .then(res => {
          if (res.error) throw new Error(res.error.message);
          return { txHash: res.result, method: "eth_sendRawTransaction_private" };
        })
    );
  }

  // Fire all private submissions in parallel
  if (submissions.length > 0) {
    try {
      const result = await Promise.any(submissions);
      console.log(`[private_tx] Raced private submission success: ${result.txHash} via ${result.method}`);
      return { submitted: true, ...result };
    } catch (err) {
      console.warn(`[private_tx] All parallel private submissions failed: ${err.message}`);
    }
  }

  // 4. Public RPC race (fallback)
  if (allowPublicFallback) {
    console.warn("[private_tx] Falling back to public RPC race");
    try {
      const txHash = await racePublicRPCs(rawTx);
      return { submitted: true, txHash, method: "public_race" };
    } catch (err) {
      return { submitted: false, error: `Public race failed: ${err.message}` };
    }
  }

  return { submitted: false, error: "No submission methods succeeded" };
}
