const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function normalizeTokenHydrationAddress(address: any) {
  if (typeof address !== "string") return null;
  const trimmed = address.trim().toLowerCase();
  if (!trimmed || trimmed === ZERO_ADDRESS) return null;
  return trimmed;
}

export function normalizeHydrationAddresses(tokenAddresses: any) {
  if (!Array.isArray(tokenAddresses) || tokenAddresses.length === 0) return [];
  return [...new Set(tokenAddresses.map(normalizeTokenHydrationAddress).filter(Boolean))];
}
