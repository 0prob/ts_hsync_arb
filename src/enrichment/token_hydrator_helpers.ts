import { normalizeEvmAddress } from "../util/pool_record.ts";

export function normalizeTokenHydrationAddress(address: any) {
  return normalizeEvmAddress(address);
}

export function normalizeHydrationAddresses(tokenAddresses: any) {
  if (!Array.isArray(tokenAddresses) || tokenAddresses.length === 0) return [];
  return [...new Set(tokenAddresses.map(normalizeTokenHydrationAddress).filter(Boolean))];
}
