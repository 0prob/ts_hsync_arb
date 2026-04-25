export const V2_PROTOCOLS = new Set([
  "QUICKSWAP_V2",
  "SUSHISWAP_V2",
  "UNISWAP_V2",
  "DFYN_V2",
  "COMETHSWAP_V2",
]);

export const V3_PROTOCOLS = new Set([
  "UNISWAP_V3",
  "QUICKSWAP_V3",
  "SUSHISWAP_V3",
  "KYBERSWAP_ELASTIC",
]);

export const CURVE_STABLE_PROTOCOLS = new Set([
  "CURVE_STABLE",
  "CURVE_MAIN",
  "CURVE_MAIN_REGISTRY",
  "CURVE_FACTORY_STABLE",
  "CURVE_STABLE_FACTORY",
  "CURVE_STABLESWAP_NG",
]);

export const CURVE_CRYPTO_PROTOCOLS = new Set([
  "CURVE_CRYPTO",
  "CURVE_FACTORY_CRYPTO",
  "CURVE_CRYPTO_FACTORY",
  "CURVE_TRICRYPTO_NG",
]);

export const CURVE_PROTOCOLS = new Set([
  ...CURVE_STABLE_PROTOCOLS,
  ...CURVE_CRYPTO_PROTOCOLS,
]);

export const BALANCER_PROTOCOLS = new Set([
  "BALANCER_WEIGHTED",
  "BALANCER_STABLE",
  "BALANCER_V2",
]);

export const SWAP_EXECUTION_PROTOCOLS = new Set([
  ...V2_PROTOCOLS,
  ...V3_PROTOCOLS,
  ...CURVE_PROTOCOLS,
  ...BALANCER_PROTOCOLS,
]);

export function normalizeProtocolKey(protocol: unknown) {
  return String(protocol ?? "").trim().toUpperCase();
}

export function isV2Protocol(protocol: unknown) {
  return V2_PROTOCOLS.has(normalizeProtocolKey(protocol));
}

export function isV3Protocol(protocol: unknown) {
  return V3_PROTOCOLS.has(normalizeProtocolKey(protocol));
}

export function isCurveProtocol(protocol: unknown) {
  return CURVE_PROTOCOLS.has(normalizeProtocolKey(protocol));
}

export function isBalancerProtocol(protocol: unknown) {
  return BALANCER_PROTOCOLS.has(normalizeProtocolKey(protocol));
}

export function isSwapExecutionProtocol(protocol: unknown) {
  return SWAP_EXECUTION_PROTOCOLS.has(normalizeProtocolKey(protocol));
}
