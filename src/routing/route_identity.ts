type EdgeIdentityLike = {
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
};

function normaliseRouteSegment(poolAddress: string, tokenIn: string, tokenOut: string) {
  return `${poolAddress.toLowerCase()}:${tokenIn.toLowerCase()}:${tokenOut.toLowerCase()}`;
}

export function routeIdentityFromEdges(startToken: string, edges: EdgeIdentityLike[]) {
  return [
    startToken.toLowerCase(),
    ...edges.map((edge) => normaliseRouteSegment(edge.poolAddress, edge.tokenIn, edge.tokenOut)),
  ].join("|");
}

export function routeIdentityFromSerializedPath(
  startToken: string,
  poolAddresses: string[],
  tokenIns: string[],
  tokenOuts: string[],
) {
  return [
    startToken.toLowerCase(),
    ...poolAddresses.map((poolAddress, index) =>
      normaliseRouteSegment(poolAddress, tokenIns[index], tokenOuts[index])
    ),
  ].join("|");
}

export function routeExecutionCacheKey(startToken: string, hopCount: number, edges: EdgeIdentityLike[]) {
  return `arb:${hopCount}:${routeIdentityFromEdges(startToken, edges)}`;
}
