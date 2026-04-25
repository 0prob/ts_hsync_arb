import assert from "node:assert/strict";
import { executeWithRpcRetry } from "../src/enrichment/rpc.ts";
import { rpcManager } from "../src/utils/rpc_manager.ts";

function fakeEndpoint(url: string) {
  return {
    url,
    latencyMs: 1,
    consecutiveErrors: 0,
    rateLimitedUntil: 0,
    errorCooldownUntil: 0,
    inFlight: 0,
    client: {},
    isRateLimited() {
      return Date.now() < this.rateLimitedUntil;
    },
    isCoolingDown() {
      return Date.now() < this.errorCooldownUntil;
    },
    markRateLimited() {
      this.rateLimitedUntil = Date.now() + 86_400_000;
    },
    markError() {
      this.errorCooldownUntil = Date.now() + 5_000;
    },
    markSuccess() {
      this.rateLimitedUntil = 0;
      this.errorCooldownUntil = 0;
    },
  };
}

async function withFakeEndpoints<T>(fn: () => Promise<T>) {
  const originalEndpoints = rpcManager.endpoints;
  const originalProbeInterval = rpcManager._probeInterval;
  rpcManager.stop();
  rpcManager.endpoints = [
    fakeEndpoint("https://a.example") as any,
    fakeEndpoint("https://b.example") as any,
  ];

  try {
    return await fn();
  } finally {
    rpcManager.endpoints = originalEndpoints;
    rpcManager._probeInterval = originalProbeInterval;
  }
}

async function testCapabilityFailureFailsAfterEachEndpointOnce() {
  await withFakeEndpoints(async () => {
    const attempted: string[] = [];
    const startedAt = Date.now();

    await assert.rejects(
      () => executeWithRpcRetry((_client: any, endpoint: any) => {
        attempted.push(endpoint.url);
        throw new Error("method not available");
      }, { retries: 10 }),
      /unsupported by all configured endpoints \(2\).*method not available/,
    );

    assert.deepEqual(attempted.sort(), ["https://a.example", "https://b.example"]);
    assert.ok(Date.now() - startedAt < 1_000, "capability failures should not wait for cooldown");
  });
}

await testCapabilityFailureFailsAfterEachEndpointOnce();

console.log("test_rpc_retry: ok");
