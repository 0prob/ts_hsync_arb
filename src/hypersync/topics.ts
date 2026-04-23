import { encodeEventTopics, parseAbiItem } from "viem";

export function topic0ForSignature(signature: string) {
  const abiItem = parseAbiItem(signature) as any;
  return encodeEventTopics({ abi: [abiItem], eventName: abiItem.name })[0];
}

export function topic0sForSignatures(signatures: string[]) {
  return signatures.map((signature) => topic0ForSignature(signature));
}
