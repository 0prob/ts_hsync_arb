
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

type HypersyncClientConfig = {
  url: string;
  apiToken: string;
};

export type HypersyncClientRuntime = {
  getHeight: () => Promise<number>;
  getChainId: () => Promise<number>;
  get: <T = unknown>(query: unknown) => Promise<T>;
  getWithRateLimit: <T = unknown>(query: unknown) => Promise<T>;
  getEvents: <T = unknown>(query: unknown) => Promise<T>;
  collect: <T = unknown>(query: unknown, config: unknown) => Promise<T>;
  collectEvents: <T = unknown>(query: unknown, config: unknown) => Promise<T>;
  collectParquet: (path: string, query: unknown, config: unknown) => Promise<void>;
  streamHeight: <T = unknown>() => Promise<T>;
  stream: <T = unknown>(query: unknown, config: unknown) => Promise<T>;
  streamEvents: <T = unknown>(query: unknown, config: unknown) => Promise<T>;
  rateLimitInfo: () => unknown;
  waitForRateLimit: () => Promise<void>;
};

type HypersyncModuleLike = {
  HypersyncClient?: new (cfg: HypersyncClientConfig) => HypersyncClientRuntime;
} | null;

function createUnsupportedHypersyncError(cause: any) {
  const err = new Error(
    "HyperSync client is unavailable on this runtime. " +
    "The installed @envio-dev/hypersync-client@1.3.0 package does not ship a native binding for this platform."
  );
  err.name = "HyperSyncClientUnavailableError";
  err.cause = cause;
  return err;
}

function createHypersyncConfigError(message: string, cause?: unknown) {
  const err = new Error(`HyperSync client configuration failed: ${message}`);
  err.name = "HyperSyncClientConfigError";
  if (cause !== undefined) err.cause = cause;
  return err;
}

let hypersync: any = null;
let hypersyncImportError: any = null;

try {
  hypersync = require("@envio-dev/hypersync-client");
} catch (err) {
  hypersyncImportError = createUnsupportedHypersyncError(err);
}

function throwUnsupportedHypersync(error = hypersyncImportError): never {
  throw error ?? createUnsupportedHypersyncError(new Error("unknown HyperSync client initialization failure"));
}

export function normalizeHypersyncClientConfig(rawConfig: HypersyncClientConfig) {
  const url = String(rawConfig?.url ?? "").trim();
  const apiToken = String(rawConfig?.apiToken ?? "").trim();
  if (!url) {
    throw createHypersyncConfigError("HYPERSYNC_URL must be a non-empty URL.");
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`unsupported protocol ${parsed.protocol}`);
    }
  } catch (err) {
    throw createHypersyncConfigError(`HYPERSYNC_URL is not a valid HTTP(S) URL: ${url}`, err);
  }
  return { url, apiToken };
}

export function createUnavailableHypersyncClient(error: unknown): HypersyncClientRuntime {
  const unavailableError = error instanceof Error ? error : createUnsupportedHypersyncError(error);
  return {
    getHeight: async () => throwUnsupportedHypersync(unavailableError),
    getChainId: async () => throwUnsupportedHypersync(unavailableError),
    get: async () => throwUnsupportedHypersync(unavailableError),
    getWithRateLimit: async () => throwUnsupportedHypersync(unavailableError),
    getEvents: async () => throwUnsupportedHypersync(unavailableError),
    collect: async () => throwUnsupportedHypersync(unavailableError),
    collectEvents: async () => throwUnsupportedHypersync(unavailableError),
    collectParquet: async () => throwUnsupportedHypersync(unavailableError),
    streamHeight: async () => throwUnsupportedHypersync(unavailableError),
    stream: async () => throwUnsupportedHypersync(unavailableError),
    streamEvents: async () => throwUnsupportedHypersync(unavailableError),
    rateLimitInfo: () => throwUnsupportedHypersync(unavailableError),
    waitForRateLimit: async () => throwUnsupportedHypersync(unavailableError),
  };
}

export function createHypersyncClient(
  hypersyncModule: HypersyncModuleLike,
  rawConfig: HypersyncClientConfig,
  importError: unknown = hypersyncImportError,
): HypersyncClientRuntime {
  const HypersyncClientImpl = hypersyncModule?.HypersyncClient ?? null;
  if (!HypersyncClientImpl) {
    return createUnavailableHypersyncClient(importError ?? createUnsupportedHypersyncError("missing HypersyncClient export"));
  }
  try {
    return new HypersyncClientImpl(normalizeHypersyncClientConfig(rawConfig));
  } catch (err) {
    return createUnavailableHypersyncClient(
      createHypersyncConfigError(String((err as { message?: string })?.message ?? err), err),
    );
  }
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
  Default: 0,
  JoinAll: 1,
  JoinNothing: 2,
};

const DecoderImpl = hypersync?.Decoder ?? UnsupportedDecoder;

export const BlockField = hypersync?.BlockField ?? fallbackBlockField;
export const LogField = hypersync?.LogField ?? fallbackLogField;
export const JoinMode = hypersync?.JoinMode ?? fallbackJoinMode;
export const Decoder = DecoderImpl;

const clientConfig = {
  url: HYPERSYNC_URL,
  apiToken: ENVIO_API_TOKEN || "",
};

export const client = createHypersyncClient(hypersync, clientConfig, hypersyncImportError);
