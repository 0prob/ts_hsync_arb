import assert from "node:assert/strict";

import { CONTRACT_CATALOG } from "../src/protocols/contract_catalog.ts";
import CURVE_CRYPTO_FACTORY from "../src/protocols/curve_crypto_factory.ts";
import CURVE_STABLE_FACTORY from "../src/protocols/curve_stable_factory.ts";
import { PROTOCOLS } from "../src/protocols/index.ts";

const activeFactoryProtocols = new Set([
  "QUICKSWAP_V2",
  "SUSHISWAP_V2",
  "DFYN_V2",
  "COMETHSWAP_V2",
  "UNISWAP_V3",
  "QUICKSWAP_V3",
  "SUSHISWAP_V3",
  "KYBERSWAP_ELASTIC",
  "BALANCER_V2",
  "CURVE_MAIN_REGISTRY",
  "CURVE_STABLE_FACTORY",
  "CURVE_CRYPTO_FACTORY",
  "CURVE_STABLESWAP_NG",
  "CURVE_TRICRYPTO_NG",
]);

for (const entry of CONTRACT_CATALOG) {
  assert.match(
    entry.address,
    /^0x[0-9a-fA-F]{40}$/,
    `${entry.label} should use a valid address`,
  );
}

for (const protocol of activeFactoryProtocols) {
  const definition = (PROTOCOLS as Record<string, { address?: string }>)[protocol];
  assert(definition, `${protocol} should exist in the protocol registry`);

  const contract = CONTRACT_CATALOG.find(
    (entry) => entry.protocol === protocol && entry.address.toLowerCase() === definition.address?.toLowerCase(),
  );
  assert(contract, `${protocol} should have a matching contract catalog entry`);
  assert.equal(contract.integration, "active", `${protocol} should be marked active in the contract catalog`);
}

assert(
  CONTRACT_CATALOG.some((entry) => entry.protocol === "DODO"),
  "DODO contracts should be present in the catalog for ABI auditing",
);
assert(
  CONTRACT_CATALOG.some((entry) => entry.protocol === "WOOFI"),
  "WOOFi contracts should be present in the catalog for ABI auditing",
);
assert(
  CONTRACT_CATALOG.some((entry) => entry.protocol === "DFYN_V2"),
  "DFYN contracts should be present in the catalog for ABI auditing",
);

const stablePlainDecoded = CURVE_STABLE_FACTORY.decode(
  {
    event: { name: "PlainPoolDeployed" },
    body: [
      { val: ["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222"] },
      { val: 100n },
      { val: 4000000n },
      { val: "0x3333333333333333333333333333333333333333" },
    ],
  },
  { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
);
assert.equal(stablePlainDecoded.pool_address, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
assert.deepEqual(stablePlainDecoded.tokens, [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
]);
assert.equal(stablePlainDecoded.metadata.variant, "plain");
assert.equal(
  typeof CURVE_STABLE_FACTORY.discover,
  "function",
  "Curve StableSwap Factory should use pool-list enumeration for discovery coverage",
);

const stableMetaDecoded = CURVE_STABLE_FACTORY.decode(
  {
    event: { name: "MetaPoolDeployed" },
    body: [
      { val: "0x1111111111111111111111111111111111111111" },
      { val: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      { val: 200n },
      { val: 5000000n },
      { val: "0x3333333333333333333333333333333333333333" },
    ],
  },
  { address: "0xcccccccccccccccccccccccccccccccccccccccc" },
);
assert.equal(stableMetaDecoded.pool_address, "0xcccccccccccccccccccccccccccccccccccccccc");
assert.deepEqual(stableMetaDecoded.tokens, ["0x1111111111111111111111111111111111111111"]);
assert.equal(stableMetaDecoded.metadata.variant, "meta");
assert.equal(stableMetaDecoded.metadata.basePool, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
assert.equal(stableMetaDecoded.metadata.A, "200");
assert.equal(stableMetaDecoded.metadata.fee, "5000000");

const cryptoDecoded = CURVE_CRYPTO_FACTORY.decode(
  {
    body: [
      { val: "0x9999999999999999999999999999999999999999" },
      { val: ["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222"] },
      { val: 10n },
      { val: 20n },
      { val: 30n },
      { val: 40n },
      { val: 50n },
      { val: 60n },
      { val: 70n },
      { val: 80n },
      { val: 90n },
      { val: 100n },
      { val: "0x3333333333333333333333333333333333333333" },
    ],
  },
  { address: "0xdddddddddddddddddddddddddddddddddddddddd" },
);
assert.equal(cryptoDecoded.pool_address, "0xdddddddddddddddddddddddddddddddddddddddd");
assert.deepEqual(cryptoDecoded.tokens, [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
]);
assert.equal(cryptoDecoded.metadata.token, "0x9999999999999999999999999999999999999999");
assert.equal(cryptoDecoded.metadata.initial_price, "100");
assert.equal(
  typeof CURVE_CRYPTO_FACTORY.discover,
  "function",
  "Curve Crypto Factory should use pool-list enumeration for discovery coverage",
);

console.log("Contract catalog checks passed.");
