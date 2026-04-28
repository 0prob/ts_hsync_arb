import assert from "node:assert/strict";

import { buildPerformanceProfile } from "./tune_performance.ts";

{
  const profile = buildPerformanceProfile({ profile: "i5-9500-8gb" });

  assert.equal(profile.cpuCores, 6);
  assert.equal(profile.memoryGb, 8);
  assert.equal(profile.nodeMaxOldSpaceSizeMb, 4096);
  assert.equal(profile.params.WORKER_COUNT, 2);
  assert.equal(profile.params.MAX_TOTAL_PATHS, 12_000);
  assert.equal(profile.params.MAX_SYNC_WARMUP_POOLS, 280);
  assert.equal(profile.params.V3_POLL_CONCURRENCY, 2);
  assert.equal(profile.params.SELECTIVE_4HOP_TOKEN_LIMIT, 4);
}

{
  const profile = buildPerformanceProfile({
    cpuModel: "small host",
    cpuCores: 4,
    memoryGb: 8,
  });

  assert.equal(profile.name, "auto");
  assert.equal(profile.nodeMaxOldSpaceSizeMb, 4096);
  assert.equal(profile.params.WORKER_COUNT, 1);
  assert.equal(profile.params.ENRICH_CONCURRENCY, 4);
  assert.equal(profile.params.MAX_TOTAL_PATHS, 12_000);
}

{
  const profile = buildPerformanceProfile({
    cpuModel: "large host",
    cpuCores: 12,
    memoryGb: 32,
  });

  assert.equal(profile.name, "auto");
  assert.equal(profile.params.WORKER_COUNT, 6);
  assert.equal(profile.params.MAX_TOTAL_PATHS, 32_000);
  assert.equal(profile.params.ENRICH_CONCURRENCY, 6);
}

console.log("Performance tuning profile checks passed.");
