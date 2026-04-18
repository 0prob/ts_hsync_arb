
/**
 * src/protocols/curve_crypto_factory.js — Curve Crypto Factory definition
 */

export default {
  name: "Curve Crypto Factory",
  address: "0xE5De15A9C9bBedb4F5EC13B131E61245f2983A69",
  signature:
    "event PoolCreated(address indexed pool, address[2] coins, uint256 A, uint256 gamma, uint256 mid_fee, uint256 out_fee, uint256 allowed_extra_profit, uint256 fee_gamma, uint256 adjustment_step, uint256 admin_fee, uint256 ma_half_time, address deployer)",
  decode(decoded) {
    // indexed: [pool]; body: [coins, A, gamma, mid_fee, out_fee, ...]
    const coins = decoded.body[0]?.val || [];
    return {
      pool_address: decoded.indexed[0]?.val?.toString(),
      tokens: (Array.isArray(coins) ? coins : [coins]).map((c) =>
        c?.toString()
      ),
      metadata: {
        A: decoded.body[1]?.val?.toString(),
        gamma: decoded.body[2]?.val?.toString(),
        mid_fee: decoded.body[3]?.val?.toString(),
        out_fee: decoded.body[4]?.val?.toString(),
        allowed_extra_profit: decoded.body[5]?.val?.toString(),
        fee_gamma: decoded.body[6]?.val?.toString(),
        adjustment_step: decoded.body[7]?.val?.toString(),
        admin_fee: decoded.body[8]?.val?.toString(),
        ma_half_time: decoded.body[9]?.val?.toString(),
        deployer: decoded.body[10]?.val?.toString(),
      },
    };
  },
};
