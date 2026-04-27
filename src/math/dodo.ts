const ONE = 10n ** 18n;
const ONE2 = ONE * ONE;

export const DODO_RSTATE_ONE = 0;
export const DODO_RSTATE_ABOVE_ONE = 1;
export const DODO_RSTATE_BELOW_ONE = 2;

function toBigInt(value: any, fallback = 0n): bigint {
  if (typeof value === "bigint") return value;
  if (value == null) return fallback;
  try {
    return BigInt(value);
  } catch {
    return fallback;
  }
}

function sqrt(value: bigint) {
  if (value < 0n) throw new Error("DODOMath: sqrt undefined for negative");
  if (value < 2n) return value;

  let x0 = value / 2n;
  let x1 = (x0 + value / x0) / 2n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + value / x0) / 2n;
  }
  return x0;
}

function mulFloor(a: bigint, b: bigint) {
  return (a * b) / ONE;
}

function divFloor(a: bigint, b: bigint) {
  if (b <= 0n) return 0n;
  return (a * ONE) / b;
}

function divCeil(a: bigint, b: bigint) {
  if (b <= 0n) return 0n;
  return (a * ONE + b - 1n) / b;
}

function reciprocalFloor(target: bigint) {
  if (target <= 0n) return 0n;
  return ONE2 / target;
}

function generalIntegrate(V0: bigint, V1: bigint, V2: bigint, i: bigint, k: bigint) {
  if (V0 <= 0n || V1 <= 0n || V2 <= 0n || V1 < V2 || i <= 0n || k < 0n || k > ONE) return 0n;

  const fairAmount = i * (V1 - V2);
  if (k === 0n) return fairAmount / ONE;

  const v0v0v1v2 = divFloor((V0 * V0) / V1, V2);
  const penalty = mulFloor(k, v0v0v1v2);
  return ((ONE - k + penalty) * fairAmount) / ONE2;
}

function solveQuadraticFunctionForTrade(V0: bigint, V1: bigint, delta: bigint, i: bigint, k: bigint) {
  if (V0 <= 0n || V1 <= 0n || delta <= 0n || i <= 0n || k < 0n || k > ONE) return 0n;

  if (k === 0n) {
    const linear = mulFloor(i, delta);
    return linear > V1 ? V1 : linear;
  }

  if (k === ONE) {
    const idelta = i * delta;
    const temp = idelta === 0n ? 0n : (idelta * V1) / (V0 * V0);
    return temp === 0n ? 0n : (V1 * temp) / (temp + ONE);
  }

  let part2 = ((k * V0) / V1) * V0 + i * delta;
  let bAbs = (ONE - k) * V1;
  let bSig = false;
  if (bAbs >= part2) {
    bAbs -= part2;
  } else {
    bAbs = part2 - bAbs;
    bSig = true;
  }
  bAbs /= ONE;

  let squareRoot = mulFloor((ONE - k) * 4n, mulFloor(k, V0) * V0);
  squareRoot = sqrt(bAbs * bAbs + squareRoot);

  const denominator = (ONE - k) * 2n;
  if (denominator <= 0n) return 0n;

  let numerator;
  if (bSig) {
    if (squareRoot <= bAbs) return 0n;
    numerator = squareRoot - bAbs;
  } else {
    numerator = bAbs + squareRoot;
  }

  const V2 = divCeil(numerator, denominator);
  return V2 > V1 ? 0n : V1 - V2;
}

export function getDodoGrossAmountOut(poolState: any, amountIn: bigint, baseToQuote: boolean) {
  const amount = toBigInt(amountIn);
  if (amount <= 0n) return 0n;

  const state = {
    i: toBigInt(poolState.i),
    K: toBigInt(poolState.k ?? poolState.K),
    B: toBigInt(poolState.baseReserve ?? poolState.B),
    Q: toBigInt(poolState.quoteReserve ?? poolState.Q),
    B0: toBigInt(poolState.baseTarget ?? poolState.B0),
    Q0: toBigInt(poolState.quoteTarget ?? poolState.Q0),
    R: Number(poolState.rState ?? poolState.R ?? DODO_RSTATE_ONE),
  };

  if (state.i <= 0n || state.K < 0n || state.K > ONE) return 0n;
  if (state.B <= 0n || state.Q <= 0n || state.B0 <= 0n || state.Q0 <= 0n) return 0n;

  if (baseToQuote) {
    if (state.R === DODO_RSTATE_ONE) {
      return solveQuadraticFunctionForTrade(state.Q0, state.Q0, amount, state.i, state.K);
    }
    if (state.R === DODO_RSTATE_ABOVE_ONE) {
      if (state.B0 < state.B || state.Q < state.Q0) return 0n;
      const backToOnePayBase = state.B0 - state.B;
      const backToOneReceiveQuote = state.Q - state.Q0;
      if (amount < backToOnePayBase) {
        const receiveQuote = generalIntegrate(state.B0, state.B + amount, state.B, state.i, state.K);
        return receiveQuote > backToOneReceiveQuote ? backToOneReceiveQuote : receiveQuote;
      }
      if (amount === backToOnePayBase) return backToOneReceiveQuote;
      return backToOneReceiveQuote +
        solveQuadraticFunctionForTrade(state.Q0, state.Q0, amount - backToOnePayBase, state.i, state.K);
    }
    return solveQuadraticFunctionForTrade(state.Q0, state.Q, amount, state.i, state.K);
  }

  const inverseI = reciprocalFloor(state.i);
  if (inverseI <= 0n) return 0n;
  if (state.R === DODO_RSTATE_ONE) {
    return solveQuadraticFunctionForTrade(state.B0, state.B0, amount, inverseI, state.K);
  }
  if (state.R === DODO_RSTATE_ABOVE_ONE) {
    return solveQuadraticFunctionForTrade(state.B0, state.B, amount, inverseI, state.K);
  }
  if (state.Q0 < state.Q || state.B < state.B0) return 0n;
  const backToOnePayQuote = state.Q0 - state.Q;
  const backToOneReceiveBase = state.B - state.B0;
  if (amount < backToOnePayQuote) {
    const receiveBase = generalIntegrate(state.Q0, state.Q + amount, state.Q, inverseI, state.K);
    return receiveBase > backToOneReceiveBase ? backToOneReceiveBase : receiveBase;
  }
  if (amount === backToOnePayQuote) return backToOneReceiveBase;
  return backToOneReceiveBase +
    solveQuadraticFunctionForTrade(state.B0, state.B0, amount - backToOnePayQuote, inverseI, state.K);
}

export function getDodoAmountOut(poolState: any, amountIn: bigint, baseToQuote: boolean) {
  const gross = getDodoGrossAmountOut(poolState, amountIn, baseToQuote);
  if (gross <= 0n) return 0n;

  const lpFeeRate = toBigInt(poolState.lpFeeRate);
  const mtFeeRate = toBigInt(poolState.mtFeeRate);
  if (lpFeeRate < 0n || mtFeeRate < 0n || lpFeeRate + mtFeeRate >= ONE) return 0n;

  return gross - mulFloor(gross, lpFeeRate) - mulFloor(gross, mtFeeRate);
}

export function simulateDodoSwap(
  poolState: any,
  amountIn: bigint,
  baseToQuote: boolean,
): { amountOut: bigint; gasEstimate: number } {
  if (amountIn <= 0n) return { amountOut: 0n, gasEstimate: 0 };
  return {
    amountOut: getDodoAmountOut(poolState, amountIn, baseToQuote),
    gasEstimate: 120000,
  };
}
