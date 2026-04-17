#!/usr/bin/env python3

from __future__ import annotations

from pathlib import Path
import sys

TARGET = Path("src/enrichment/token_hydrator.ts")

MULTICALL_NEEDLE = """  return addresses.map((addr, i) => {
"""
META_NEEDLE = """      const meta = await fetchMetaBatch(batch);

      // Only persist entries where decimals resolved — symbol/name are optional
"""

MULTICALL_LOG = """  const successCount = Array.isArray(results)
    ? results.filter((r) => r?.status === "success").length
    : 0;
  logger.info({
    addresses: addresses.length,
    callCount: contracts.length,
    resultCount: Array.isArray(results) ? results.length : 0,
    successCount,
    firstResults: Array.isArray(results) ? results.slice(0, 6) : results,
  }, "[token_hydrator] multicall raw result summary");

  return addresses.map((addr, i) => {
"""

META_LOG = """      const meta = await fetchMetaBatch(batch);
      logger.info({
        batchSize: batch.length,
        sample: meta.slice(0, 5),
        decimalsResolved: meta.filter((m) => m.decimals !== null).length,
        symbolResolved: meta.filter((m) => m.symbol !== null).length,
        nameResolved: meta.filter((m) => m.name !== null).length,
      }, "[token_hydrator] batch decode summary");

      // Only persist entries where decimals resolved — symbol/name are optional
"""

def fail(msg: str) -> int:
    print(f"error: {msg}", file=sys.stderr)
    return 1

def main() -> int:
    if not TARGET.exists():
        return fail(f"target file not found: {TARGET}")

    text = TARGET.read_text(encoding="utf-8")

    if "[token_hydrator] multicall raw result summary" in text or "[token_hydrator] batch decode summary" in text:
        print("logs already present; no changes made")
        return 0

    if MULTICALL_NEEDLE not in text:
        return fail("could not find insertion point for multicall results log")

    if META_NEEDLE not in text:
        return fail("could not find insertion point for batch decode log")

    text = text.replace(MULTICALL_NEEDLE, MULTICALL_LOG, 1)
    text = text.replace(META_NEEDLE, META_LOG, 1)

    TARGET.write_text(text, encoding="utf-8")
    print(f"updated {TARGET}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
