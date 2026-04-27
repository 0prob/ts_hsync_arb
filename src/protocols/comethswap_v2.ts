import { createPairCreatedProtocol } from "./factories.ts";

export default createPairCreatedProtocol(
  "ComethSwap V2",
  "0x800b052609c355cA8103E06F022aA30647eAd60a",
  {
    feeNumerator: 995,
    router: "0x93bcDc45f7e62f89a8e901DC4A0E2c6C427D9F25",
  },
  { startBlock: 0 },
);
