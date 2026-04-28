import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const configUrl = pathToFileURL(path.resolve("src/config/index.ts")).href;

async function loadConfigWithMetricsPort(value: string | undefined, label: string) {
  const previous = process.env.METRICS_PORT;
  if (value == null) delete process.env.METRICS_PORT;
  else process.env.METRICS_PORT = value;
  try {
    return await import(`${configUrl}?metrics-port-${label}-${Date.now()}`);
  } finally {
    if (previous == null) delete process.env.METRICS_PORT;
    else process.env.METRICS_PORT = previous;
  }
}

{
  const config = await loadConfigWithMetricsPort("0", "ephemeral");
  assert.equal(config.METRICS_PORT, 0, "METRICS_PORT=0 should request an ephemeral metrics port");
}

{
  const config = await loadConfigWithMetricsPort("19191", "custom");
  assert.equal(config.METRICS_PORT, 19191, "METRICS_PORT should be configurable");
}

{
  const config = await loadConfigWithMetricsPort("70000", "invalid");
  assert.equal(config.METRICS_PORT, 9090, "out-of-range METRICS_PORT should fall back to 9090");
}

console.log("Config checks passed.");
