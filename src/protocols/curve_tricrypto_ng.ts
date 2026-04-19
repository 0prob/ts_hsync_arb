import { discoverCurveListedFactory } from "./curve_list_factory.ts";

const FACTORY_ADDRESS = "0x0c0e5f2fF0ff18a3be9b835635039256dC4B4963";

export default {
  name: "Curve Tricrypto NG",
  address: FACTORY_ADDRESS,
  async discover({ key, registry, chainHeight }: any) {
    return discoverCurveListedFactory({
      protocolKey: key,
      protocolName: "Curve Tricrypto NG",
      factoryAddress: FACTORY_ADDRESS,
      slotCount: 3,
      registry,
      checkpointBlock: chainHeight,
      metadataForPool: () => ({
        factory: FACTORY_ADDRESS,
        variant: "tricrypto-ng",
      }),
    });
  },
};
