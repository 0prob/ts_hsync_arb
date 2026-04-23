import assert from "node:assert/strict";

import { CONTRACT_CATALOG, POLYGON_CHAIN_ID, type AbiExpectation } from "../src/protocols/contract_catalog.ts";

type AbiInput = {
  type?: string;
  indexed?: boolean;
  components?: AbiInput[];
};

type AbiItem = {
  type?: string;
  name?: string;
  inputs?: AbiInput[];
};

function canonicalType(input: AbiInput | undefined): string {
  if (!input?.type) return "";
  if (input.type.startsWith("tuple")) {
    const suffix = input.type.slice("tuple".length);
    const components = (input.components ?? []).map(canonicalType).join(",");
    return `tuple(${components})${suffix}`;
  }
  return input.type;
}

function matchesExpectation(item: AbiItem, expected: AbiExpectation) {
  if (item.type !== expected.type || item.name !== expected.name) return false;
  const inputs = (item.inputs ?? []).map(canonicalType);
  if (inputs.length !== expected.inputs.length) return false;
  for (let i = 0; i < inputs.length; i++) {
    const expectedType = expected.inputs[i];
    if (expectedType === "tuple") {
      if (!inputs[i].startsWith("tuple(")) return false;
      continue;
    }
    if (expectedType === "tuple[]") {
      if (!inputs[i].startsWith("tuple(") || !inputs[i].endsWith("[]")) return false;
      continue;
    }
    if (inputs[i] !== expectedType) return false;
  }

  if (expected.type === "event" && expected.indexed) {
    const indexed = (item.inputs ?? []).map((input) => Boolean(input.indexed));
    if (indexed.length !== expected.indexed.length) return false;
    for (let i = 0; i < indexed.length; i++) {
      if (indexed[i] !== expected.indexed[i]) return false;
    }
  }

  return true;
}

async function fetchAbi(address: string, apiKey: string) {
  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("chainid", POLYGON_CHAIN_ID);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getabi");
  url.searchParams.set("address", address);
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${address}`);
  }

  const payload = await response.json();
  if (payload.status !== "1") {
    throw new Error(`Etherscan error for ${address}: ${payload.result}`);
  }

  return JSON.parse(payload.result) as AbiItem[];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAbiWithRetry(address: string, apiKey: string, attempts = 5) {
  let delayMs = 400;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetchAbi(address, apiKey);
    } catch (error: any) {
      const message = String(error?.message ?? error);
      const retryable = /rate limit/i.test(message) || /Max calls per sec/i.test(message);
      if (!retryable || attempt === attempts) {
        throw error;
      }
      await sleep(delayMs);
      delayMs *= 2;
    }
  }
  throw new Error(`unreachable retry state for ${address}`);
}

const apiKey = process.env.ETHERSCAN_API_KEY;
assert(apiKey, "ETHERSCAN_API_KEY is required to audit live contract ABIs");

let checked = 0;
for (const entry of CONTRACT_CATALOG) {
  const abi = await fetchAbiWithRetry(entry.address, apiKey);
  for (const expected of entry.expectations) {
    assert(
      abi.some((item) => matchesExpectation(item, expected)),
      `${entry.label} is missing ${expected.type} ${expected.name}(${expected.inputs.join(",")})`,
    );
  }
  checked++;
  console.log(`[etherscan-audit] ${entry.label}: ${entry.expectations.length} expectation(s) matched`);
  await sleep(350);
}

console.log(`[etherscan-audit] audited ${checked} contract(s) from Etherscan`);
