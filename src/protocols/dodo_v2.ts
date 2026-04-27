import { FULLY_SUPPORTED_CAPABILITIES, type ProtocolDefinition } from "./factories.ts";

const DVM_FACTORY = "0x79887f65f83bdf15Bcc8736b5e5BcDB48fb8fE13";
const DPP_FACTORY = "0xd24153244066F0afA9415563bFC7Ba248bfB7a51";
const DSP_FACTORY = "0x43C49f8DD240e1545F147211Ec9f917376Ac1e87";

function valueToString(value: any) {
  const unwrapped = value && typeof value === "object" && "val" in value ? value.val : value;
  return unwrapped?.toString?.();
}

function createDodoV2Protocol({
  name,
  address,
  eventName,
  poolType,
}: {
  name: string;
  address: string;
  eventName: "NewDVM" | "NewDPP" | "NewDSP";
  poolType: "DVM" | "DPP" | "DSP";
}): ProtocolDefinition {
  const poolArgName = poolType.toLowerCase();
  return {
    name,
    address,
    startBlock: 0,
    capabilities: FULLY_SUPPORTED_CAPABILITIES,
    signature: `event ${eventName}(address baseToken, address quoteToken, address creator, address ${poolArgName})`,
    decode(decoded: any) {
      return {
        pool_address: valueToString(decoded.body[3]),
        tokens: [
          valueToString(decoded.body[0]),
          valueToString(decoded.body[1]),
        ],
        metadata: {
          factory: address,
          poolType,
          baseToken: valueToString(decoded.body[0]),
          quoteToken: valueToString(decoded.body[1]),
          creator: valueToString(decoded.body[2]),
        },
      };
    },
  };
}

export const DODO_DVM = createDodoV2Protocol({
  name: "DODO V2 DVM",
  address: DVM_FACTORY,
  eventName: "NewDVM",
  poolType: "DVM",
});

export const DODO_DPP = createDodoV2Protocol({
  name: "DODO V2 DPP",
  address: DPP_FACTORY,
  eventName: "NewDPP",
  poolType: "DPP",
});

export const DODO_DSP = createDodoV2Protocol({
  name: "DODO V2 DSP",
  address: DSP_FACTORY,
  eventName: "NewDSP",
  poolType: "DSP",
});
