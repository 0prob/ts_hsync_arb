
/**
 * src/hypersync/client.js — HyperSync client factory
 *
 * Creates and exports a singleton HypersyncClient configured from
 * environment variables. Also re-exports commonly used enums.
 *
 * HyperSync 1.3.0 ships native bindings only for Darwin/Linux targets.
 * On unsupported runtimes (for example Android/Termux) the package throws
 * during module import. We catch that here so the rest of the repo can still
 * import cleanly and fail only when HyperSync operations are actually used.
 */

import { createRequire } from "module";
import { HYPERSYNC_URL, ENVIO_API_TOKEN } from "../config/index.ts";

const require = createRequire(import.meta.url);

function createUnsupportedHypersyncError(cause: any) {
  const err = new Error(
    "HyperSync client is unavailable on this runtime. " +
    "The installed @envio-dev/hypersync-client@1.3.0 package does not ship a native binding for this platform."
  );
  err.cause = cause;
  return err;
}

let hypersync: any = null;
let hypersyncImportError: any = null;

try {
  hypersync = require("@envio-dev/hypersync-client");
} catch (err) {
  hypersyncImportError = createUnsupportedHypersyncError(err);
}

function throwUnsupportedHypersync() {
  throw hypersyncImportError;
}

class UnsupportedDecoder {
  static fromSignatures() {
    return new UnsupportedDecoder();
  }

  async decodeLogs() {
    throwUnsupportedHypersync();
  }
}

const fallbackBlockField = {
  Number: "Number",
  Timestamp: "Timestamp",
};

const fallbackLogField = {
  Address: "Address",
  Data: "Data",
  Topic0: "Topic0",
  Topic1: "Topic1",
  Topic2: "Topic2",
  Topic3: "Topic3",
  BlockNumber: "BlockNumber",
  TransactionHash: "TransactionHash",
  LogIndex: "LogIndex",
  TransactionIndex: "TransactionIndex",
};

const fallbackJoinMode = {
  JoinAll: "JoinAll",
  JoinNothing: "JoinNothing",
};

const HypersyncClientImpl = hypersync?.HypersyncClient ?? null;
const DecoderImpl = hypersync?.Decoder ?? UnsupportedDecoder;

export const BlockField = hypersync?.BlockField ?? fallbackBlockField;
export const LogField = hypersync?.LogField ?? fallbackLogField;
export const JoinMode = hypersync?.JoinMode ?? fallbackJoinMode;
export const Decoder = DecoderImpl;

const clientConfig = {
  url: HYPERSYNC_URL,
  apiToken: ENVIO_API_TOKEN || "",
};

export const client = HypersyncClientImpl
  ? new HypersyncClientImpl(clientConfig)
  : {
      getHeight: async () => throwUnsupportedHypersync(),
      get: async () => throwUnsupportedHypersync(),
      getEvents: async () => throwUnsupportedHypersync(),
      collect: async () => throwUnsupportedHypersync(),
      collectEvents: async () => throwUnsupportedHypersync(),
      stream: async () => throwUnsupportedHypersync(),
      streamEvents: async () => throwUnsupportedHypersync(),
    };
