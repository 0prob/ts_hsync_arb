import assert from "node:assert/strict";

import { parseRunnerArgs } from "../src/bootstrap/cli.ts";

const defaults = parseRunnerArgs([], 30);
assert.deepEqual(defaults, {
  loopMode: false,
  liveMode: false,
  discoveryOnly: false,
  tuiMode: false,
  pollIntervalSec: 30,
});

const parsed = parseRunnerArgs(["--loop", "--live", "--tui", "--interval", "45"], 30);
assert.deepEqual(parsed, {
  loopMode: true,
  liveMode: true,
  discoveryOnly: false,
  tuiMode: true,
  pollIntervalSec: 45,
});

assert.throws(
  () => parseRunnerArgs(["--interval"], 30),
  /--interval requires a positive integer value in seconds/,
  "missing interval values should fail fast with a clear operator-facing error",
);

assert.throws(
  () => parseRunnerArgs(["--interval", "--loop"], 30),
  /--interval requires a positive integer value in seconds/,
  "flags should not be consumed as interval values",
);

assert.throws(
  () => parseRunnerArgs(["--interval", "abc"], 30),
  /--interval must be a positive integer/,
  "non-numeric interval values should be rejected",
);

assert.throws(
  () => parseRunnerArgs(["--interval", "0"], 30),
  /--interval must be a positive integer/,
  "zero-second interval should be rejected",
);

console.log("CLI argument checks passed.");
