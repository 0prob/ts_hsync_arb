import assert from "node:assert/strict";

async function importConfigWithEnv(env: Record<string, string | undefined>, suffix: string) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await import(`../src/config/index.ts?case=${suffix}`);
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const fractional = await importConfigWithEnv(
  {
    ENVIO_API_TOKEN: "test-token",
    ENRICH_CONCURRENCY: "2.5",
  },
  "fractional",
);
assert.equal(
  fractional.ENRICH_CONCURRENCY,
  6,
  "fractional numeric config should fall back instead of being accepted as a worker-count-like value",
);

const negative = await importConfigWithEnv(
  {
    ENVIO_API_TOKEN: "test-token",
    QUIET_POOL_SWEEP_INTERVAL_MS: "-1",
  },
  "negative",
);
assert.equal(
  negative.QUIET_POOL_SWEEP_INTERVAL_MS,
  60_000,
  "negative numeric config should fall back instead of producing invalid intervals",
);

const unsafe = await importConfigWithEnv(
  {
    ENVIO_API_TOKEN: "test-token",
    MAX_TOTAL_PATHS: "9007199254740993",
  },
  "unsafe",
);
assert.equal(
  unsafe.MAX_TOTAL_PATHS,
  20_000,
  "unsafe-large numeric config should fall back instead of accepting imprecise numbers",
);

const valid = await importConfigWithEnv(
  {
    ENVIO_API_TOKEN: "test-token",
    MAX_CONSECUTIVE_ERRORS: "7",
  },
  "valid",
);
assert.equal(valid.MAX_CONSECUTIVE_ERRORS, 7);

console.log("Number config checks passed.");
