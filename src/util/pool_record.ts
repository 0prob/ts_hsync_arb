const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const tokenCache = new WeakMap<object, string[]>();
const metadataCache = new WeakMap<object, Record<string, any>>();

export function parsePoolTokensValue(value: unknown): string[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || "[]") : value;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((token) =>
      typeof token === "string" ? token.toLowerCase() : String(token).toLowerCase()
    );
  } catch {
    return [];
  }
}

export function parsePoolMetadataValue(value: unknown): Record<string, any> {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || "{}") : (value ?? {});
    return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : {};
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
