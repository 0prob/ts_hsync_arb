import { createArbSearcher, toRouteResultLike } from "./search.ts";
import { createExecutionCoordinator } from "./execution_coordinator.ts";
import { createRouteRevalidator } from "./route_revalidation.ts";

export function createOpportunityEngine(deps: {
  search: any;
  execution: any;
  revalidation: any;
}) {
  const executionCoordinator = createExecutionCoordinator(deps.execution);
  const {
    clearExecutionRouteQuarantine,
    executeBatchIfIdle,
    filterQuarantinedCandidates,
  } = executionCoordinator;

  const searcher = createArbSearcher({
    ...deps.search,
    filterQuarantinedCandidates,
  });

  const revalidateCachedRoutes = createRouteRevalidator({
    ...deps.revalidation,
    filterQuarantinedCandidates,
    executeBatchIfIdle,
  });

  return {
    search: searcher,
    revalidateCachedRoutes,
    clearExecutionRouteQuarantine,
    executeBatchIfIdle,
    filterQuarantinedCandidates,
    toRouteResultLike,
  };
}
