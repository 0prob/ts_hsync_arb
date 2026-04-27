import assert from "node:assert/strict";

import {
  createHypersyncClient,
  normalizeHypersyncClientConfig,
} from "../src/hypersync/client.ts";

{
  assert.deepEqual(
    normalizeHypersyncClientConfig({
      url: "  https://polygon.hypersync.xyz  ",
      apiToken: "  token-value  ",
      httpReqTimeoutMillis: "45000",
      maxNumRetries: "4",
      retryBackoffMs: "750",
      retryBaseMs: "250",
      retryCeilingMs: "3000",
    } as any),
    {
      url: "https://polygon.hypersync.xyz",
      apiToken: "token-value",
      httpReqTimeoutMillis: 45_000,
      maxNumRetries: 4,
      retryBackoffMs: 750,
      retryBaseMs: 250,
      retryCeilingMs: 3_000,
    },
    "client config should be trimmed and preserve native HyperSync retry tuning",
  );

  assert.deepEqual(
    normalizeHypersyncClientConfig({
      url: "  https://polygon.hypersync.xyz  ",
      apiToken: "  token-value  ",
    }),
    {
      url: "https://polygon.hypersync.xyz",
      apiToken: "token-value",
    },
    "client config should omit unset native tuning fields",
  );

  assert.throws(
    () => normalizeHypersyncClientConfig({ url: "ftp://polygon.hypersync.xyz", apiToken: "" }),
    /valid HTTP\(S\) URL/i,
    "client config should reject non-HTTP HyperSync URLs",
  );

  assert.throws(
    () => normalizeHypersyncClientConfig({
      url: "https://polygon.hypersync.xyz",
      apiToken: "",
      retryBaseMs: 5_000,
      retryCeilingMs: 1_000,
    }),
    /retryCeilingMs must be >= retryBaseMs/i,
    "client config should reject inverted native retry bounds",
  );
}

{
  let receivedConfig: unknown = null;
  class MockHypersyncClient {
    constructor(config: unknown) {
      receivedConfig = config;
    }

    async getHeight() {
      return 123;
    }

    async streamHeight() {
      return { recv: async () => null, close: async () => {} };
    }
  }

  const client = createHypersyncClient(
    { HypersyncClient: MockHypersyncClient as any },
    { url: " https://polygon.hypersync.xyz ", apiToken: " token " },
  ) as { getHeight: () => Promise<number>; streamHeight: () => Promise<{ recv: () => Promise<null>; close: () => Promise<void> }> };

  assert.equal(await client.getHeight(), 123);
  assert.deepEqual(receivedConfig, {
    url: "https://polygon.hypersync.xyz",
    apiToken: "token",
  });
  const heightStream = await client.streamHeight();
  assert.equal(typeof heightStream.recv, "function");
  assert.equal(typeof heightStream.close, "function");
}

{
  class ThrowingHypersyncClient {
    constructor() {
      throw new Error("bad native config");
    }
  }

  const client = createHypersyncClient(
    { HypersyncClient: ThrowingHypersyncClient as any },
    { url: "https://polygon.hypersync.xyz", apiToken: "" },
  ) as { getHeight: () => Promise<number> };

  await assert.rejects(
    () => client.getHeight(),
    /bad native config/,
    "constructor failures should surface when the client is used, not when the module imports",
  );
}

{
  const client = createHypersyncClient(
    null,
    { url: "https://polygon.hypersync.xyz", apiToken: "" },
    new Error("native binding missing"),
  ) as { get: () => Promise<unknown>; stream: () => Promise<unknown>; streamHeight: () => Promise<unknown> };

  await assert.rejects(
    () => client.get(),
    /native binding missing|native binding/i,
    "missing native bindings should surface through lazy client methods",
  );
  await assert.rejects(
    () => client.stream(),
    /native binding missing|native binding/i,
    "missing native bindings should surface through lazy stream methods",
  );
  await assert.rejects(
    () => client.streamHeight(),
    /native binding missing|native binding/i,
    "missing native bindings should surface through lazy height stream methods",
  );
}

console.log("HyperSync client checks passed.");
