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

async function withFakeEndpoints<T>(fn: () => Promise<T>, urls = ["https://a.example", "https://b.example"]) {
  const originalEndpoints = rpcManager.endpoints;
  const originalProbeInterval = rpcManager._probeInterval;
  rpcManager.stop();
  rpcManager.endpoints = urls.map((url) => fakeEndpoint(url) as any);

  try {
    return await fn();
  } finally {
    rpcManager.endpoints = originalEndpoints;
    rpcManager._probeInterval = originalProbeInterval;
  }
}

async function testCapabilityFailureTriesEveryEndpointEvenWithLowRetryBudget() {
  await withFakeEndpoints(async () => {
    const attempted: string[] = [];

    await assert.rejects(
      () => executeWithRpcRetry((_client: any, endpoint: any) => {
        attempted.push(endpoint.url);
        throw new Error("method not available");
      }, { retries: 1 }),
      /unsupported by all configured endpoints \(4\).*method not available/,
    );

    assert.deepEqual(attempted.sort(), [
      "https://a.example",
      "https://b.example",
      "https://c.example",
      "https://d.example",
    ]);
  }, [
    "https://a.example",
    "https://b.example",
    "https://c.example",
    "https://d.example",
  ]);
}

async function testRetryableErrorsFailOverBeforeBackoffWhenEndpointHealthy() {
  await withFakeEndpoints(async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const attempted: string[] = [];
      const startedAt = Date.now();
      const result = await executeWithRpcRetry((_client: any, endpoint: any) => {
        attempted.push(endpoint.url);
        if (attempted.length === 1) {
          throw new Error("HTTP request failed: 502");
        }
        return "ok";
      }, { retries: 1 });

      assert.equal(result, "ok");
      assert.equal(attempted.length, 2);
      assert.ok(
        Date.now() - startedAt < 250,
        "retryable endpoint failures should switch to a healthy endpoint before sleeping",
      );
    } finally {
      Math.random = originalRandom;
    }
  });
}

async function testRetryBudgetAllowsRecoveryAfterEndpointSweep() {
  await withFakeEndpoints(async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const attempted: string[] = [];
      const result = await executeWithRpcRetry((_client: any, endpoint: any) => {
        attempted.push(endpoint.url);
        if (attempted.length <= 4) {
          throw new Error("HTTP request failed: 502");
        }
        return "ok";
      }, { retries: 1 });

      assert.equal(result, "ok");
      assert.equal(attempted.length, 5);
      assert.deepEqual(
        [...new Set(attempted.slice(0, 4))].sort(),
        [
          "https://a.example",
          "https://b.example",
          "https://c.example",
          "https://d.example",
        ],
      );
    } finally {
      Math.random = originalRandom;
    }
  }, [
    "https://a.example",
    "https://b.example",
    "https://c.example",
    "https://d.example",
  ]);
}

async function testEndpointSwitchingPrefersKnownFastEndpointOverUnprobedIdleEndpoint() {
  await withFakeEndpoints(async () => {
    const [fast, unprobed] = rpcManager.endpoints as any[];
    fast.latencyMs = 25;
    fast.inFlight = 1;
    unprobed.latencyMs = Infinity;
    unprobed.inFlight = 0;

    const chosen = rpcManager.checkoutBestEndpoint();
    try {
      assert.equal(chosen.url, "https://a.example");
    } finally {
      rpcManager.releaseEndpoint(chosen.url);
    }
  });
}

async function testEndpointSwitchingSpreadsLoadWhenLatencyPenaltyJustifiesIt() {
  await withFakeEndpoints(async () => {
    const [fast, slower] = rpcManager.endpoints as any[];
    fast.latencyMs = 25;
    fast.inFlight = 3;
    slower.latencyMs = 400;
    slower.inFlight = 0;

    const chosen = rpcManager.checkoutBestEndpoint();
    try {
      assert.equal(chosen.url, "https://b.example");
    } finally {
      rpcManager.releaseEndpoint(chosen.url);
    }
  });
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

async function testWaitsForCooldownBeforeRetrying() {
  await withFakeEndpoints(async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const waitUntil = Date.now() + 80;
      for (const endpoint of rpcManager.endpoints) {
        endpoint.errorCooldownUntil = waitUntil;
      }

      const attempted: string[] = [];
      const startedAt = Date.now();
      const result = await executeWithRpcRetry((_client: any, endpoint: any) => {
        attempted.push(endpoint.url);
        return "ok";
      }, { retries: 0 });

      assert.equal(result, "ok");
      assert.equal(attempted.length, 1);
      assert.ok(
        Date.now() - startedAt >= 75,
        "RPC retry should wait for endpoint cooldown before issuing the call",
      );
    } finally {
      Math.random = originalRandom;
    }
  });
}

async function testProbeDoesNotExtendActiveErrorCooldown() {
  const endpoint = rpcManager.endpoints[0] as any;
  const originalGetBlockNumber = endpoint.client.getBlockNumber;
  const originalCooldownUntil = endpoint.errorCooldownUntil;
  const originalConsecutiveErrors = endpoint.consecutiveErrors;
  const originalLatencyMs = endpoint.latencyMs;

  const cooldownUntil = Date.now() + 80;
  endpoint.errorCooldownUntil = cooldownUntil;
  endpoint.consecutiveErrors = 3;
  endpoint.latencyMs = 10;
  endpoint.client.getBlockNumber = async () => {
    throw new Error("probe timeout");
  };

  try {
    await endpoint.probe();

    assert.equal(endpoint.errorCooldownUntil, cooldownUntil);
    assert.equal(endpoint.consecutiveErrors, 3);
    assert.equal(endpoint.latencyMs, Infinity);
  } finally {
    endpoint.client.getBlockNumber = originalGetBlockNumber;
    endpoint.errorCooldownUntil = originalCooldownUntil;
    endpoint.consecutiveErrors = originalConsecutiveErrors;
    endpoint.latencyMs = originalLatencyMs;
  }
}

async function testManagerProbeIsSingleFlight() {
  await withFakeEndpoints(async () => {
    let probeCalls = 0;
    let activeProbes = 0;
    let maxActiveProbes = 0;

    for (const endpoint of rpcManager.endpoints as any[]) {
      endpoint.probe = async () => {
        probeCalls++;
        activeProbes++;
        maxActiveProbes = Math.max(maxActiveProbes, activeProbes);
        await new Promise((resolve) => setTimeout(resolve, 40));
        activeProbes--;
      };
    }

    await Promise.all([
      rpcManager.probe(),
      rpcManager.probe(),
      rpcManager.probe(),
    ]);

    assert.equal(probeCalls, rpcManager.endpoints.length);
    assert.equal(maxActiveProbes, rpcManager.endpoints.length);
    assert.equal((rpcManager as any)._probePromise, null);
  });
}

async function testSuccessfulRetryClearsEndpointRateLimitState() {
  await withFakeEndpoints(async () => {
    const endpoint = rpcManager.endpoints[0] as any;
    endpoint.rateLimitedUntil = Date.now() + 80;

    const result = await executeWithRpcRetry((_client: any, selected: any) => {
      assert.equal(selected.url, endpoint.url);
      return "ok";
    }, { retries: 0 });

    assert.equal(result, "ok");
    assert.equal(endpoint.rateLimitedUntil, 0);
  }, ["https://a.example"]);
}

await testCapabilityFailureFailsAfterEachEndpointOnce();
await testCapabilityFailureTriesEveryEndpointEvenWithLowRetryBudget();
await testRetryableErrorsFailOverBeforeBackoffWhenEndpointHealthy();
await testRetryBudgetAllowsRecoveryAfterEndpointSweep();
await testEndpointSwitchingPrefersKnownFastEndpointOverUnprobedIdleEndpoint();
await testEndpointSwitchingSpreadsLoadWhenLatencyPenaltyJustifiesIt();
await testWaitsForCooldownBeforeRetrying();
await testProbeDoesNotExtendActiveErrorCooldown();
await testManagerProbeIsSingleFlight();
await testSuccessfulRetryClearsEndpointRateLimitState();

console.log("test_rpc_retry: ok");
