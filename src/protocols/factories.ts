import { discoverCurveListedFactory } from "./curve_list_factory.ts";

const EMPTY_METADATA = Object.freeze({});

type DecodeResult = {
  pool_address: string | undefined;
  tokens: Array<string | undefined>;
  metadata: Record<string, unknown>;
};

export type ProtocolCapabilities = {
  discovery: boolean;
  routing: boolean;
  execution: boolean;
};

type ProtocolDefinition = {
  name: string;
  address: string;
  signature?: string;
  decode?: (decoded: any, rawLog?: any) => DecodeResult;
  enrichTokens?: (poolMeta: any) => Promise<string[]>;
  discover?: (context: any) => Promise<any>;
  capabilities?: ProtocolCapabilities;
};

export const FULLY_SUPPORTED_CAPABILITIES: ProtocolCapabilities = Object.freeze({
  discovery: true,
  routing: true,
  execution: true,
});

export function createPairCreatedProtocol(
  name: string,
  address: string,
  metadata: Record<string, unknown> = EMPTY_METADATA,
): ProtocolDefinition {
  return {
    name,
    address,
    capabilities: FULLY_SUPPORTED_CAPABILITIES,
    signature: "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)",
    decode(decoded: any) {
      return {
        pool_address: decoded.body[0]?.val?.toString(),
        tokens: [
          decoded.indexed[0]?.val?.toString(),
          decoded.indexed[1]?.val?.toString(),
        ],
        metadata,
      };
    },
  };
}

export function createUniV3PoolProtocol(
  name: string,
  address: string,
  metadata: Record<string, unknown> = EMPTY_METADATA,
  capabilities: ProtocolCapabilities = FULLY_SUPPORTED_CAPABILITIES,
): ProtocolDefinition {
  return {
    name,
    address,
    capabilities,
    signature:
      "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)",
    decode(decoded: any) {
      return {
        pool_address: decoded.body[1]?.val?.toString(),
        tokens: [
          decoded.indexed[0]?.val?.toString(),
          decoded.indexed[1]?.val?.toString(),
        ],
        metadata: {
          ...metadata,
          fee: decoded.indexed[2]?.val?.toString(),
          tickSpacing: decoded.body[0]?.val?.toString(),
        },
      };
    },
  };
}

export function createRpcTokenProtocol({
  name,
  address,
  signature,
  decode,
  enrichTokens,
  capabilities = FULLY_SUPPORTED_CAPABILITIES,
}: Required<Pick<ProtocolDefinition, "name" | "address" | "signature" | "decode" | "enrichTokens">> & {
  capabilities?: ProtocolCapabilities;
}): ProtocolDefinition {
  return { name, address, signature, decode, enrichTokens, capabilities };
}

type CurveListedFactoryOptions = {
  name: string;
  address: string;
  slotCount?: number;
  dynamicCoins?: boolean;
  metadataForPool?: (poolAddress: string, tokens: string[]) => Record<string, any>;
};

export function createCurveListedFactoryProtocol({
  name,
  address,
  slotCount,
  dynamicCoins,
  metadataForPool,
}: CurveListedFactoryOptions): ProtocolDefinition {
  return {
    name,
    address,
    capabilities: FULLY_SUPPORTED_CAPABILITIES,
    async discover({ key, registry, chainHeight }: any) {
      return discoverCurveListedFactory({
        protocolKey: key,
        protocolName: name,
        factoryAddress: address,
        slotCount,
        dynamicCoins,
        registry,
        checkpointBlock: chainHeight,
        metadataForPool,
      });
    },
  };
}
