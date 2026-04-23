type TokenMetaLike = {
  decimals?: number | null;
  symbol?: string | null;
} | null | undefined;

type PriceOracleLike = {
  fromMatic: (tokenAddress: string, maticWei: bigint) => bigint;
  getFreshRate: (tokenAddress: string, maxAgeMs?: number) => bigint;
} | null;

type PricingServiceDeps = {
  getTokenMeta: (tokenAddress: string) => TokenMetaLike;
  getPriceOracle: () => PriceOracleLike;
  maxPriceAgeMs: number;
  minProbeAmount: bigint;
  testAmountWei: bigint;
};

function uniqueSortedBigInts(values: Array<string | number | bigint>) {
  return [...new Set(values.map(String))]
    .map((value) => BigInt(value))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function formatTokenAmount(amount: bigint, decimals: number, fractionDigits = 6) {
  const safeDecimals = Math.max(0, Math.min(Number(decimals) || 0, 18));
  const scale = 10n ** BigInt(safeDecimals);
  const negative = amount < 0n;
  const absAmount = negative ? -amount : amount;
  const whole = absAmount / scale;
  const fraction = absAmount % scale;

  if (fractionDigits <= 0 || safeDecimals === 0) {
    return `${negative ? "-" : ""}${whole.toString()}`;
  }

  const paddedFraction = fraction.toString().padStart(safeDecimals, "0");
  const clippedFraction = paddedFraction
    .slice(0, Math.min(fractionDigits, safeDecimals))
    .replace(/0+$/, "");

  return clippedFraction.length > 0
    ? `${negative ? "-" : ""}${whole.toString()}.${clippedFraction}`
    : `${negative ? "-" : ""}${whole.toString()}`;
}

export function createPricingService(deps: PricingServiceDeps) {
  function getFreshTokenToMaticRate(tokenAddress: string) {
    return deps.getPriceOracle()?.getFreshRate?.(tokenAddress, deps.maxPriceAgeMs) ?? 0n;
  }

  function getProbeAmountsForToken(tokenAddress: string) {
    let decimals = deps.getTokenMeta(tokenAddress)?.decimals;
    if (decimals == null) decimals = 18;

    const rawUnit = 10n ** BigInt(Math.max(0, Math.min(Number(decimals), 18)));
    const oracle = deps.getPriceOracle();
    const oracleScaledProbes = oracle
      ? [
          oracle.fromMatic(tokenAddress, 5n * 10n ** 16n), // 0.05 MATIC
          oracle.fromMatic(tokenAddress, 5n * 10n ** 17n), // 0.5 MATIC
          oracle.fromMatic(tokenAddress, 2n * 10n ** 18n), // 2 MATIC
          oracle.fromMatic(tokenAddress, 10n ** 19n),      // 10 MATIC
        ]
      : [];
    const probes = uniqueSortedBigInts([
      deps.minProbeAmount,
      rawUnit / 10n,
      rawUnit,
      rawUnit * 10n,
      rawUnit * 100n,
      rawUnit * 1_000n,
      deps.testAmountWei,
      ...oracleScaledProbes,
    ]);

    return probes.filter((amount) => amount >= deps.minProbeAmount);
  }

  function fmtSym(addr: string) {
    return deps.getTokenMeta(addr)?.symbol ?? addr.slice(2, 8).toUpperCase();
  }

  function fmtProfit(netWei: bigint, tokenAddr: string) {
    const meta = deps.getTokenMeta(tokenAddr);
    const decimals = meta?.decimals ?? 18;
    const symbol = meta?.symbol ?? tokenAddr.slice(2, 8).toUpperCase();
    return `${formatTokenAmount(netWei, decimals, 6)} ${symbol}`;
  }

  return {
    getFreshTokenToMaticRate,
    getProbeAmountsForToken,
    fmtSym,
    fmtProfit,
    formatTokenAmount,
  };
}
