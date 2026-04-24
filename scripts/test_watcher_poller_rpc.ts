import assert from "node:assert/strict";

import { TimedPoller } from "../src/state/poller_base.ts";
import { StateWatcher } from "../src/state/watcher.ts";
import { isRetryableError, rpcManager } from "../src/utils/rpc_manager.ts";

class TestPoller extends TimedPoller {
  startLoop(intervalMs: number, poll: () => Promise<unknown>) {
    return this._startLoop("test_poller", intervalMs, poll);
  }
}

{
  const poller = new TestPoller();
  let started = 0;
  let released!: () => void;
  const firstPollStarted = new Promise<void>((resolve) => {
    void poller.startLoop(5, async () => {
      started += 1;
      resolve();
      await new Promise<void>((resume) => {
        released = resume;
      });
    });
  });

  await firstPollStarted;
  const stopPromise = poller.stop();
  released();
  await stopPromise;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(started, 1, "stopping a poller should not let a stale loop schedule another pass");
}

{
  const registry = {
    getCheckpoint: () => ({ last_block: 10 }),
    getGlobalCheckpoint: () => null,
  };
  const cache = new Map<any, any>([
    ["0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", {}],
    [" bad ", {}],
  ]);
  const watcher = new StateWatcher(registry as any, cache as any) as any;
  watcher._loop = async () => {};
  watcher._haltMeta = { reason: "stale halt" };
  watcher._consecutivePollErrors = 4;
  watcher._consecutiveIntegrityPollErrors = 2;

  await watcher.start(undefined);

  assert.equal(watcher.haltMeta, null, "watcher start should clear stale halt state");
  assert.equal(
    watcher._watchedAddresses.length,
    1,
    "watcher start should normalize the initial watchlist from cache keys",
  );

  await watcher.addPools(["0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 7, "bad"]);
  assert.deepEqual(
    watcher._watchedAddresses,
    [
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ],
    "watcher should dedupe and ignore invalid pool addresses when extending the filter",
  );
}

assert.equal(isRetryableError(new Error("socket hang up")), true, "socket hang ups should be treated as retryable");
assert.equal(isRetryableError(new Error("fetch failed")), true, "fetch failures should be treated as retryable");
assert.equal(isRetryableError(new Error("ETIMEDOUT")), true, "timeout transport failures should be retryable");

{
  const originalGetBlockNumbers = rpcManager.endpoints.map((endpoint) => endpoint.client.getBlockNumber);
  try {
    rpcManager.endpoints.forEach((endpoint, index) => {
      endpoint.latencyMs = 1;
      endpoint.consecutiveErrors = 0;
      endpoint.rateLimitedUntil = 0;
      endpoint.errorCooldownUntil = 0;
      endpoint.client.getBlockNumber = async () => {
        if (index === 0) throw new Error("socket hang up");
        return 1n;
      };
    });

    await rpcManager.probe();

    assert.equal(
      rpcManager.endpoints[0].isCoolingDown(),
      true,
      "failed endpoint probes should put the endpoint into retry cooldown",
    );
  } finally {
    rpcManager.endpoints.forEach((endpoint, index) => {
      endpoint.client.getBlockNumber = originalGetBlockNumbers[index];
      endpoint.rateLimitedUntil = 0;
      endpoint.errorCooldownUntil = 0;
      endpoint.consecutiveErrors = 0;
      endpoint.latencyMs = Infinity;
    });
  }
}
