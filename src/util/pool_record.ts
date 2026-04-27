export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const EVM_ADDRESS_RE = /^0x[0-9a-f]{40}$/;

const tokenCache = new WeakMap<object, string[]>();
const metadataCache = new WeakMap<object, Record<string, any>>();
const MAX_JSON_UNWRAP_DEPTH = 3;

export function normalizeEvmAddress(value: unknown, options: { allowZero?: boolean } = {}): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!EVM_ADDRESS_RE.test(normalized)) return null;
  if (!options.allowZero && normalized === ZERO_ADDRESS) return null;
  return normalized;
}

export function isEvmAddress(value: unknown, options: { allowZero?: boolean } = {}) {
  return normalizeEvmAddress(value, options) != null;
}

export function parsePoolTokensValue(value: unknown): string[] {
  try {
    let parsed = value;
    for (let depth = 0; depth < MAX_JSON_UNWRAP_DEPTH && typeof parsed === "string"; depth++) {
      parsed = JSON.parse(parsed || "[]");
    }
    if (!Array.isArray(parsed)) return [];
    const tokens: string[] = [];
    const seen = new Set<string>();
    for (const value of parsed) {
      const token = normalizeEvmAddress(value);
      if (!token || seen.has(token)) continue;
      seen.add(token);
      tokens.push(token);
    }
    return tokens;
  } catch {
    return [];
  }
}

export function parsePoolMetadataValue(value: unknown): Record<string, any> {
  try {
    let parsed = value ?? {};
    for (let depth = 0; depth < MAX_JSON_UNWRAP_DEPTH && typeof parsed === "string"; depth++) {
      parsed = JSON.parse(parsed || "{}");
    }
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : {};
  } catch {
    return {};
  }
}

export function getPoolTokens(pool: any): string[] {
  if (!pool || typeof pool !== "object") {
    try {
      return parsePoolTokensValue(pool?.tokens);
    } catch {
      return [];
    }
  }

  const cached = tokenCache.get(pool);
  if (cached) return cached;

  try {
    const tokens = parsePoolTokensValue(pool.tokens);
    tokenCache.set(pool, tokens);
    return tokens;
  } catch {
    tokenCache.set(pool, []);
    return [];
  }
}

export function getPoolMetadata(pool: any): Record<string, any> {
  if (!pool || typeof pool !== "object") {
    try {
      return parsePoolMetadataValue(pool?.metadata);
    } catch {
      return {};
    }
  }

  const cached = metadataCache.get(pool);
  if (cached) return cached;

  try {
    const metadata = parsePoolMetadataValue(pool.metadata);
    metadataCache.set(pool, metadata);
    return metadata;
  } catch {
    const metadata = {};
    metadataCache.set(pool, metadata);
    return metadata;
  }
}

export function hasZeroAddressToken(tokens: string[]): boolean {
  return tokens.some((token) => token === ZERO_ADDRESS);
}
