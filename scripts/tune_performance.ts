import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type PerfParams = Record<string, number>;

type HardwareProfile = {
  name: string;
  cpuModel: string;
  cpuCores: number;
  memoryGb: number;
  nodeMaxOldSpaceSizeMb: number;
  params: PerfParams;
};

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PERF_JSON_PATH = path.join(PROJECT_ROOT, "data", "perf.json");

function roundGb(bytes: number) {
  return Math.max(1, Math.round(bytes / 1024 ** 3));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeProfileName(value: string | undefined) {
  return String(value || "auto").trim().toLowerCase();
}

export function buildPerformanceProfile(options: {
  profile?: string;
  cpuModel?: string;
  cpuCores?: number;
  memoryGb?: number;
} = {}): HardwareProfile {
  const profile = normalizeProfileName(options.profile);
  const detectedCpus = os.cpus();
  const cpuModel = options.cpuModel || detectedCpus[0]?.model || "unknown";
  const cpuCores = Math.max(1, Math.floor(options.cpuCores ?? (detectedCpus.length || 1)));
  const memoryGb = Math.max(1, Math.floor(options.memoryGb ?? roundGb(os.totalmem())));

  if (profile === "i5-9500-8gb" || profile === "intel-i5-9500-8gb") {
    return {
      name: "i5-9500-8gb",
      cpuModel: "Intel(R) Core(TM) i5-9500 CPU @ 3.00GHz",
      cpuCores: 6,
      memoryGb: 8,
      nodeMaxOldSpaceSizeMb: 4096,
      params: {
        DISCOVERY_PROTOCOL_CONCURRENCY: 2,
        ENRICH_CONCURRENCY: 4,
        V2_POLL_CONCURRENCY: 6,
        V2_RESERVES_MULTICALL_CHUNK_SIZE: 96,
        V3_POLL_CONCURRENCY: 2,
        WORKER_COUNT: 2,
        EVAL_WORKER_THRESHOLD: 250,
        MAX_TOTAL_PATHS: 12_000,
        MAX_PATHS_TO_OPTIMIZE: 10,
        MAX_SYNC_WARMUP_POOLS: 280,
        MAX_SYNC_WARMUP_V3_POOLS: 48,
        MAX_SYNC_WARMUP_ONE_HUB_POOLS: 96,
        MAX_SYNC_WARMUP_ONE_HUB_V3_POOLS: 0,
        V3_POLL_MAX_POOLS: 450,
        QUIET_POOL_SWEEP_BATCH_SIZE: 16,
        QUIET_POOL_SWEEP_INTERVAL_MS: 90_000,
        CYCLE_REFRESH_INTERVAL_MS: 180_000,
        SELECTIVE_4HOP_TOKEN_LIMIT: 4,
        DYNAMIC_PIVOT_TOKEN_LIMIT: 10,
        SELECTIVE_4HOP_PATH_BUDGET: 1_800,
        SELECTIVE_4HOP_MAX_PATHS_PER_TOKEN: 700,
        GAS_POLL_INTERVAL_MS: 7_500,
        HYPERSYNC_BATCH_SIZE: 4_000,
        HYPERSYNC_MAX_FILTERS_PER_REQUEST: 6,
      },
    };
  }

  const memoryPressure = memoryGb <= 8 ? "low" : memoryGb <= 16 ? "medium" : "high";
  const workerCount = memoryPressure === "low"
    ? clamp(Math.floor(cpuCores / 3), 1, 2)
    : clamp(cpuCores - 2, 2, 6);
  const maxTotalPaths = memoryPressure === "low" ? 12_000 : memoryPressure === "medium" ? 20_000 : 32_000;
  const v3PollConcurrency = memoryPressure === "low" ? 2 : 3;

  return {
    name: "auto",
    cpuModel,
    cpuCores,
    memoryGb,
    nodeMaxOldSpaceSizeMb: memoryPressure === "low" ? 4096 : clamp(Math.floor(memoryGb * 640), 4096, 12_288),
    params: {
      DISCOVERY_PROTOCOL_CONCURRENCY: memoryPressure === "low" ? 2 : 3,
      ENRICH_CONCURRENCY: memoryPressure === "low" ? 4 : 6,
      V2_POLL_CONCURRENCY: memoryPressure === "low" ? 6 : 10,
      V2_RESERVES_MULTICALL_CHUNK_SIZE: memoryPressure === "low" ? 96 : 128,
      V3_POLL_CONCURRENCY: v3PollConcurrency,
      WORKER_COUNT: workerCount,
      EVAL_WORKER_THRESHOLD: memoryPressure === "low" ? 250 : 100,
      MAX_TOTAL_PATHS: maxTotalPaths,
      MAX_PATHS_TO_OPTIMIZE: memoryPressure === "low" ? 10 : 15,
      MAX_SYNC_WARMUP_POOLS: memoryPressure === "low" ? 280 : 400,
      MAX_SYNC_WARMUP_V3_POOLS: memoryPressure === "low" ? 48 : 80,
      MAX_SYNC_WARMUP_ONE_HUB_POOLS: memoryPressure === "low" ? 96 : 160,
      MAX_SYNC_WARMUP_ONE_HUB_V3_POOLS: 0,
      V3_POLL_MAX_POOLS: memoryPressure === "low" ? 450 : 750,
      QUIET_POOL_SWEEP_BATCH_SIZE: memoryPressure === "low" ? 16 : 24,
      QUIET_POOL_SWEEP_INTERVAL_MS: memoryPressure === "low" ? 90_000 : 60_000,
      CYCLE_REFRESH_INTERVAL_MS: memoryPressure === "low" ? 180_000 : 120_000,
      SELECTIVE_4HOP_TOKEN_LIMIT: memoryPressure === "low" ? 4 : 6,
      DYNAMIC_PIVOT_TOKEN_LIMIT: memoryPressure === "low" ? 10 : 12,
      SELECTIVE_4HOP_PATH_BUDGET: Math.max(800, Math.floor(maxTotalPaths * 0.15)),
      SELECTIVE_4HOP_MAX_PATHS_PER_TOKEN: memoryPressure === "low" ? 700 : 1_500,
      GAS_POLL_INTERVAL_MS: memoryPressure === "low" ? 7_500 : 5_000,
      HYPERSYNC_BATCH_SIZE: memoryPressure === "low" ? 4_000 : 5_000,
      HYPERSYNC_MAX_FILTERS_PER_REQUEST: memoryPressure === "low" ? 6 : 8,
    },
  };
}

function parseArgs(argv: string[]) {
  const parsed: { profile?: string; write: boolean; print: boolean } = {
    write: true,
    print: true,
  };

  for (const arg of argv) {
    if (arg === "--no-write") parsed.write = false;
    else if (arg === "--quiet") parsed.print = false;
    else if (arg.startsWith("--profile=")) parsed.profile = arg.slice("--profile=".length);
    else if (!parsed.profile) parsed.profile = arg;
  }

  return parsed;
}

export async function writePerformanceProfile(profile: HardwareProfile, outputPath = PERF_JSON_PATH) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    profile: profile.name,
    hardware: {
      cpuModel: profile.cpuModel,
      cpuCores: profile.cpuCores,
      memoryGb: profile.memoryGb,
    },
    runtime: {
      nodeOptions: `--max-old-space-size=${profile.nodeMaxOldSpaceSizeMb}`,
    },
    params: profile.params,
  };
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = buildPerformanceProfile({ profile: args.profile });
  const payload = args.write ? await writePerformanceProfile(profile) : {
    profile: profile.name,
    hardware: {
      cpuModel: profile.cpuModel,
      cpuCores: profile.cpuCores,
      memoryGb: profile.memoryGb,
    },
    runtime: {
      nodeOptions: `--max-old-space-size=${profile.nodeMaxOldSpaceSizeMb}`,
    },
    params: profile.params,
  };

  if (args.print) {
    console.log(JSON.stringify(payload, null, 2));
    if (args.write) {
      console.log(`\nWrote ${path.relative(PROJECT_ROOT, PERF_JSON_PATH)}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
