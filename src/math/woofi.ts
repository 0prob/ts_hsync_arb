const ONE = 10n ** 18n;
const WOOFI_FEE_DENOMINATOR = 100_000n;

function toBigInt(value: any, fallback = 0n): bigint {
  if (typeof value === "bigint") return value;
  if (value == null) return fallback;
  try {
    return BigInt(value);
  } catch {
    return fallback;
  }
}

function tokenKey(token: any) {
  return typeof token === "string" ? token.toLowerCase() : "";
}

function getBaseState(poolState: any, token: any) {
  const key = tokenKey(token);
  const states = poolState?.baseTokenStates ?? poolState?.baseStates ?? {};
  return states[key] ?? null;
}

function getQuoteToken(poolState: any) {
  return tokenKey(poolState?.quoteToken ?? poolState?.tokens?.[0]);
}

function hasPositiveSwapFactor(gamma: bigint, spread: bigint) {
  return gamma >= 0n && spread >= 0n && gamma + spread < ONE;
}

function calcQuoteAmountSellBase(baseState: any, baseAmount: bigint, spreadOverride: bigint | null = null) {
  const price = toBigInt(baseState?.price);
  const coeff = toBigInt(baseState?.coeff);
  const spread = spreadOverride ?? toBigInt(baseState?.spread);
  const baseDec = toBigInt(baseState?.baseDec, 1n);
  const quoteDec = toBigInt(baseState?.quoteDec, 1n);
  const priceDec = toBigInt(baseState?.priceDec, 1n);
  const maxGamma = toBigInt(baseState?.maxGamma);
  const maxNotionalSwap = toBigInt(baseState?.maxNotionalSwap);

  if (baseAmount <= 0n || price <= 0n || baseDec <= 0n || quoteDec <= 0n || priceDec <= 0n) return 0n;
  if (baseState?.feasible === false || baseState?.woFeasible === false) return 0n;

  const notionalSwap = (((baseAmount * price) * quoteDec) / baseDec) / priceDec;
  if (maxNotionalSwap > 0n && notionalSwap > maxNotionalSwap) return 0n;

  const gamma = (((baseAmount * price) * coeff) / priceDec) / baseDec;
  if (maxGamma > 0n && gamma > maxGamma) return 0n;
  if (!hasPositiveSwapFactor(gamma, spread)) return 0n;

  return (((baseAmount * price * quoteDec) / priceDec) * (ONE - gamma - spread)) / ONE / baseDec;
}

function calcBaseAmountSellQuote(baseState: any, quoteAmount: bigint, spreadOverride: bigint | null = null) {
  const price = toBigInt(baseState?.price);
  const coeff = toBigInt(baseState?.coeff);
  const spread = spreadOverride ?? toBigInt(baseState?.spread);
  const baseDec = toBigInt(baseState?.baseDec, 1n);
  const quoteDec = toBigInt(baseState?.quoteDec, 1n);
  const priceDec = toBigInt(baseState?.priceDec, 1n);
  const maxGamma = toBigInt(baseState?.maxGamma);
  const maxNotionalSwap = toBigInt(baseState?.maxNotionalSwap);

  if (quoteAmount <= 0n || price <= 0n || baseDec <= 0n || quoteDec <= 0n || priceDec <= 0n) return 0n;
  if (baseState?.feasible === false || baseState?.woFeasible === false) return 0n;
  if (maxNotionalSwap > 0n && quoteAmount > maxNotionalSwap) return 0n;

  const gamma = (quoteAmount * coeff) / quoteDec;
  if (maxGamma > 0n && gamma > maxGamma) return 0n;
  if (!hasPositiveSwapFactor(gamma, spread)) return 0n;

  return (((quoteAmount * baseDec * priceDec) / price) * (ONE - gamma - spread)) / ONE / quoteDec;
}

function applyWoofiFee(amount: bigint, feeRate: bigint) {
  if (amount <= 0n) return 0n;
  if (feeRate < 0n || feeRate >= WOOFI_FEE_DENOMINATOR) return 0n;
  return amount - (amount * feeRate) / WOOFI_FEE_DENOMINATOR;
}

export function getWoofiFeeRate(poolState: any, tokenIn: any, tokenOut: any) {
  const quoteToken = getQuoteToken(poolState);
  const inKey = tokenKey(tokenIn);
  const outKey = tokenKey(tokenOut);
  if (!quoteToken || !inKey || !outKey || inKey === outKey) return 0n;

  if (inKey === quoteToken) return toBigInt(getBaseState(poolState, outKey)?.feeRate);
  if (outKey === quoteToken) return toBigInt(getBaseState(poolState, inKey)?.feeRate);

  const inFee = toBigInt(getBaseState(poolState, inKey)?.feeRate);
  const outFee = toBigInt(getBaseState(poolState, outKey)?.feeRate);
  return inFee > outFee ? inFee : outFee;
}

export function getWoofiEdgeFeeBps(poolState: any, tokenIn: any, tokenOut: any) {
  const feeRate = getWoofiFeeRate(poolState, tokenIn, tokenOut);
  return Number(feeRate) / 10;
}

export function getWoofiAmountOut(poolState: any, amountIn: bigint, tokenIn: any, tokenOut: any) {
  const amount = toBigInt(amountIn);
  if (amount <= 0n) return 0n;

  const quoteToken = getQuoteToken(poolState);
  const inKey = tokenKey(tokenIn);
  const outKey = tokenKey(tokenOut);
  if (!quoteToken || !inKey || !outKey || inKey === outKey) return 0n;

  const quoteReserve = toBigInt(poolState?.quoteReserve);

  if (outKey === quoteToken) {
    const baseState = getBaseState(poolState, inKey);
    if (!baseState) return 0n;
    const grossQuote = calcQuoteAmountSellBase(baseState, amount);
    const quoteOut = applyWoofiFee(grossQuote, toBigInt(baseState.feeRate));
    return quoteReserve > 0n && quoteOut <= quoteReserve ? quoteOut : 0n;
  }

  if (inKey === quoteToken) {
    const baseState = getBaseState(poolState, outKey);
    if (!baseState) return 0n;
    const feeAdjustedQuote = applyWoofiFee(amount, toBigInt(baseState.feeRate));
    const baseOut = calcBaseAmountSellQuote(baseState, feeAdjustedQuote);
    const baseReserve = toBigInt(baseState.reserve);
    return baseReserve > 0n && baseOut <= baseReserve ? baseOut : 0n;
  }

  const sellBaseState = getBaseState(poolState, inKey);
  const buyBaseState = getBaseState(poolState, outKey);
  if (!sellBaseState || !buyBaseState) return 0n;

  const sharedSpread = (() => {
    const left = toBigInt(sellBaseState.spread);
    const right = toBigInt(buyBaseState.spread);
    return (left > right ? left : right) / 2n;
  })();
  const quoteAmount = calcQuoteAmountSellBase(sellBaseState, amount, sharedSpread);
  const feeAdjustedQuote = applyWoofiFee(quoteAmount, getWoofiFeeRate(poolState, inKey, outKey));
  const baseOut = calcBaseAmountSellQuote(buyBaseState, feeAdjustedQuote, sharedSpread);
  const baseReserve = toBigInt(buyBaseState.reserve);

  return baseReserve > 0n && baseOut <= baseReserve ? baseOut : 0n;
}

export function simulateWoofiSwap(
  amountIn: bigint,
  poolState: any,
  tokenInIdx: number,
  tokenOutIdx: number,
): { amountOut: bigint; gasEstimate: number } {
  if (amountIn <= 0n) return { amountOut: 0n, gasEstimate: 0 };
  const tokens = Array.isArray(poolState?.tokens) ? poolState.tokens : [];
  const tokenIn = tokens[tokenInIdx];
  const tokenOut = tokens[tokenOutIdx];
  if (!tokenIn || !tokenOut) return { amountOut: 0n, gasEstimate: 0 };

  return {
    amountOut: getWoofiAmountOut(poolState, amountIn, tokenIn, tokenOut),
    gasEstimate: 150000,
  };
}
