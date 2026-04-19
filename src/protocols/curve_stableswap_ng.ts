import { discoverCurveListedFactory } from "./curve_list_factory.ts";

const FACTORY_ADDRESS = "0x1764ee18e8B3ccA4787249Ceb249356192594585";

export default {
  name: "Curve StableSwap NG",
  address: FACTORY_ADDRESS,
  async discover({ key, registry, chainHeight }: any) {
    return discoverCurveListedFactory({
      protocolKey: key,
      protocolName: "Curve StableSwap NG",
      factoryAddress: FACTORY_ADDRESS,
      dynamicCoins: true,
      registry,
      checkpointBlock: chainHeight,
      metadataForPool: () => ({
        factory: FACTORY_ADDRESS,
        variant: "stableswap-ng",
      }),
    });
  },
};
