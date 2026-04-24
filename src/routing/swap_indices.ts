function normalizeAddress(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

export function resolveSwapTokenIndexes(edge: any, state: any) {
  const explicitIn = Number(edge?.tokenInIdx);
  const explicitOut = Number(edge?.tokenOutIdx);
  if (
    Number.isInteger(explicitIn) &&
    explicitIn >= 0 &&
    Number.isInteger(explicitOut) &&
    explicitOut >= 0 &&
    explicitIn !== explicitOut
  ) {
    return { tokenInIdx: explicitIn, tokenOutIdx: explicitOut };
  }

  const tokens = Array.isArray(state?.tokens) ? state.tokens.map(normalizeAddress) : [];
  const tokenIn = normalizeAddress(edge?.tokenIn);
  const tokenOut = normalizeAddress(edge?.tokenOut);

  if (tokens.length > 0 && tokenIn && tokenOut) {
    const tokenInIdx = tokens.indexOf(tokenIn);
    const tokenOutIdx = tokens.indexOf(tokenOut);
    if (tokenInIdx >= 0 && tokenOutIdx >= 0 && tokenInIdx !== tokenOutIdx) {
      return { tokenInIdx, tokenOutIdx };
    }
  }

  if (tokens.length === 2) {
    return edge?.zeroForOne
      ? { tokenInIdx: 0, tokenOutIdx: 1 }
      : { tokenInIdx: 1, tokenOutIdx: 0 };
  }

  return null;
}
