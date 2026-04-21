
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
  POLYGON_PRIVATE_MEMPOOL_URL,
  POLYGON_PRIVATE_MEMPOOL_METHOD,
  POLYGON_PRIVATE_MEMPOOL_AUTH_HEADER,
  POLYGON_PRIVATE_MEMPOOL_AUTH_TOKEN,
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
async function jsonRpc(url: any, method: any, params: any, headers: any = {}) {
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

function polygonPrivateMempoolHeaders() {
  if (!POLYGON_PRIVATE_MEMPOOL_AUTH_HEADER || !POLYGON_PRIVATE_MEMPOOL_AUTH_TOKEN) {
    return {};
  }
  return {
    [POLYGON_PRIVATE_MEMPOOL_AUTH_HEADER]: POLYGON_PRIVATE_MEMPOOL_AUTH_TOKEN,
  };
}

// ─── Sign transaction ─────────────────────────────────────────

export async function signTransaction(tx: any, privateKey: any, nonce: any, chainId = 137) {
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

export async function sendPrivateTransaction(rawTx: any, rpcUrl: any) {
  const url = rpcUrl || PRIVATE_MEMPOOL_URL;
  if (!url) throw new Error("sendPrivateTransaction: no URL");

  const response: any = await jsonRpc(url, "eth_sendPrivateTransaction", [{ tx: rawTx }]);
  if (response.error) throw new Error(`eth_sendPrivateTransaction failed: ${response.error.message}`);
  return response.result;
}

export async function sendPolygonPrivateTransaction(rawTx: any, rpcUrl: any = POLYGON_PRIVATE_MEMPOOL_URL) {
  const url = rpcUrl || POLYGON_PRIVATE_MEMPOOL_URL;
  if (!url) throw new Error("sendPolygonPrivateTransaction: no URL");

  const method = POLYGON_PRIVATE_MEMPOOL_METHOD || "eth_sendRawTransaction";
  const params =
    method === "eth_sendPrivateTransaction"
      ? [{ tx: rawTx }]
      : [rawTx];

  const response: any = await jsonRpc(
    url,
    method,
    params,
    polygonPrivateMempoolHeaders(),
  );
  if (response.error) {
    throw new Error(`${method} failed: ${response.error.message}`);
  }
  return response.result;
}

/**
 * Submit a bundle of transactions to Alchemy (Flashbots-compatible).
 */
export async function sendBundleAlchemy(rawTxs: any, options: any = {}, rpcUrl: any) {
  const url = rpcUrl || PRIVATE_MEMPOOL_URL;
  if (!url) throw new Error("sendBundleAlchemy: no URL");

  const response: any = await jsonRpc(
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

function privateMempoolSupportsBundles() {
  return Boolean(PRIVATE_MEMPOOL_URL && PRIVATE_MEMPOOL_METHOD === "eth_sendBundle");
}

export async function sendPrivateBundle(rawTxs: any, options: any = {}) {
  const { blockNumber } = options;
  if (!blockNumber) throw new Error("sendPrivateBundle: blockNumber required");

  const submissions = [];

  if (privateMempoolSupportsBundles()) {
    submissions.push(
      sendBundleAlchemy(rawTxs, { ...options, blockNumber }, PRIVATE_MEMPOOL_URL)
        .then((bundleHash) => ({ bundleHash, method: "eth_sendBundle" }))
    );
  }

  if (submissions.length === 0) {
    return {
      submitted: false,
      retryIndividually: true,
      error: "No bundle-capable relay configured",
    };
  }

  try {
    const result = await Promise.any(submissions);
    console.log(`[private_tx] Private bundle submitted via ${result.method}`);
    return { submitted: true, ...result };
  } catch (err: any) {
    return { submitted: false, error: err?.message ?? String(err) };
  }
}

export async function racePublicRPCs(rawTx: any, rpcs: any) {
  const targets = (rpcs && rpcs.length > 0) ? rpcs : FAST_PUBLIC_RPCS;

  const submissions = targets.map(async (url: any) => {
    const response: any = await jsonRpc(url, "eth_sendRawTransaction", [rawTx]);
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
export async function sendPrivateTx(rawTx: any, options: any = {}) {
  const { allowPublicFallback = true } = options;
  const submissions = [];

  // 1. Dedicated Polygon private mempool
  if (POLYGON_PRIVATE_MEMPOOL_URL) {
    submissions.push(
      sendPolygonPrivateTransaction(rawTx, POLYGON_PRIVATE_MEMPOOL_URL)
        .then(txHash => ({ txHash, method: `polygon_private_mempool:${POLYGON_PRIVATE_MEMPOOL_METHOD}` }))
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
        .then((res: any) => {
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
    } catch (err: any) {
      console.warn(`[private_tx] All parallel private submissions failed: ${err.message}`);
    }
  }

  // 4. Public RPC race (fallback)
  if (allowPublicFallback) {
    console.warn("[private_tx] Falling back to public RPC race");
    try {
      const txHash = await racePublicRPCs(rawTx, undefined);
      return { submitted: true, txHash, method: "public_race" };
    } catch (err: any) {
      return { submitted: false, error: `Public race failed: ${err.message}` };
    }
  }

  return { submitted: false, error: "No submission methods succeeded" };
}
