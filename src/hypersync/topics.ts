import { encodeEventTopics, parseAbiItem } from "viem";

const topic0Cache = new Map<string, string>();

export function normalizeTopic(topic: unknown) {
  const value = String(topic ?? "").trim();
  return value.length > 0 ? value.toLowerCase() : "";
}

export function topic0ForSignature(signature: string) {
  const normalizedSignature = String(signature ?? "").trim();
  const cached = topic0Cache.get(normalizedSignature);
  if (cached) return cached;

  const abiItem = parseAbiItem(normalizedSignature) as any;
  const topic0 = normalizeTopic(encodeEventTopics({ abi: [abiItem], eventName: abiItem.name })[0]);
  topic0Cache.set(normalizedSignature, topic0);
  return topic0;
}

export function topic0sForSignatures(signatures: string[]) {
  return signatures.map((signature) => topic0ForSignature(signature));
}
