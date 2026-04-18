
/**
 * Converts a bigint, number, or string to a finite number.
 * Returns `fallback` (default 0) for NaN, Infinity, or unrecognized input.
 */
export function toFiniteNumber(value: bigint | number | string | unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}
