import type { ArbPathLike } from "../arb/assessment.ts";

type TopologyServiceLike = {
  refreshCycles: (options: {
    force?: boolean;
    minLiquidityWmatic: bigint;
    selective4HopPathBudget: number;
    selective4HopMaxPathsPerToken: number;
    getRateWei: ((addr: string) => bigint) | null;
    clearExecutionRouteQuarantine?: (reason: string) => void;
  }) => Promise<ArbPathLike[]>;
};

type PriceOracleLike = {
  isFresh: (maxAgeMs: number) => boolean;
  update: () => void;
  getFreshRate: (address: string, maxAgeMs: number) => bigint;
} | null;

type TopologyRefreshDeps = {
  getPriceOracle: () => PriceOracleLike;
  getTopologyService: () => TopologyServiceLike | null;
  clearExecutionRouteQuarantine: (reason: string) => void;
  maxPriceAgeMs: number;
  minLiquidityWmatic: bigint;
  selective4HopPathBudget: number;
  selective4HopMaxPathsPerToken: number;
};

export function createTopologyRefreshCoordinator(deps: TopologyRefreshDeps) {
  function refreshPriceOracleIfStale() {
    const oracle = deps.getPriceOracle();
    if (oracle && !oracle.isFresh(deps.maxPriceAgeMs)) {
      oracle.update();
    }
    return oracle;
  }

  function getRateWei() {
    const oracle = refreshPriceOracleIfStale();
    return oracle
      ? ((addr: string) => oracle.getFreshRate(addr, deps.maxPriceAgeMs))
      : null;
  }

  async function refreshCycles(force = false) {
    return deps.getTopologyService()?.refreshCycles({
      force,
      minLiquidityWmatic: deps.minLiquidityWmatic,
      selective4HopPathBudget: deps.selective4HopPathBudget,
      selective4HopMaxPathsPerToken: deps.selective4HopMaxPathsPerToken,
      getRateWei: getRateWei(),
      clearExecutionRouteQuarantine: deps.clearExecutionRouteQuarantine,
    });
  }

  return {
    refreshCycles,
    refreshPriceOracleIfStale,
  };
}
