import assert from "node:assert/strict";
import { jsonRpc, racePublicRPCs, sendPrivateTx } from "../src/execution/private_tx.ts";

type FetchHandler = (url: string, init: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function withMockFetch<T>(handler: FetchHandler, fn: () => Promise<T>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    return handler(String(url), init ?? {});
  }) as typeof fetch;

  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testJsonRpcThrowsJsonRpcErrors() {
  await withMockFetch(
    async () => jsonResponse({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "already known" } }),
    async () => {
      await assert.rejects(
        () => jsonRpc("https://rpc.example/path", "eth_sendRawTransaction", ["0xabc"]),
        /eth_sendRawTransaction.*rpc\.example\/path.*-32000: already known/,
      );
    },
  );
}

async function testJsonRpcRejectsInvalidJson() {
  await withMockFetch(
    async () => new Response("<html>bad gateway</html>", { status: 200 }),
    async () => {
      await assert.rejects(
        () => jsonRpc("https://rpc.example", "eth_blockNumber", []),
        /invalid JSON.*bad gateway/,
      );
    },
  );
}

async function testJsonRpcTimesOut() {
  await withMockFetch(
    async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    }),
    async () => {
      await assert.rejects(
        () => jsonRpc("https://slow.example", "eth_blockNumber", [], {}, { timeoutMs: 5 }),
        /timeout after 5ms/,
      );
    },
  );
}

async function testRacePublicRpcsUsesFirstSuccess() {
  await withMockFetch(
    async (url) => {
      if (url.includes("bad")) {
        return jsonResponse({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "rejected" } });
      }
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0xhash" });
    },
    async () => {
      const hash = await racePublicRPCs("0xraw", ["https://bad.example", "https://good.example"]);
      assert.equal(hash, "0xhash");
    },
  );
}

async function testSendPrivateTxReportsAllPublicFailures() {
  await withMockFetch(
    async (url) => jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32000, message: `${new URL(url).hostname} failed` },
    }),
    async () => {
      const result = await sendPrivateTx("0xraw", {
        publicRpcs: ["https://a.example", "https://b.example"],
        requestTimeoutMs: 10,
      });

      assert.equal(result.submitted, false);
      assert.match(result.error, /Public race failed/);
      assert.match(result.error, /a\.example failed/);
      assert.match(result.error, /b\.example failed/);
    },
  );
}

await testJsonRpcThrowsJsonRpcErrors();
await testJsonRpcRejectsInvalidJson();
await testJsonRpcTimesOut();
await testRacePublicRpcsUsesFirstSuccess();
await testSendPrivateTxReportsAllPublicFailures();

console.log("test_private_tx_rpc: ok");
