import assert from "node:assert/strict";

import { discoverFactoryIndexesToScan } from "../src/protocols/curve_list_factory.ts";

function pool(factoryIndex: unknown) {
  return {
    pool_address: "0x" + String(Number(factoryIndex) + 1).padStart(40, "0"),
    metadata: { factoryIndex },
  };
}

{
  assert.deepEqual(
    discoverFactoryIndexesToScan([], 4),
    [0, 1, 2, 3],
    "a new Curve factory scan should enumerate every listed slot",
  );
}

{
  assert.deepEqual(
    discoverFactoryIndexesToScan([pool(0), pool(1), pool(2)], 5),
    [3, 4],
    "a contiguous existing factory index set should keep the incremental fast path",
  );
}

{
  assert.deepEqual(
    discoverFactoryIndexesToScan([pool(0), pool(2), pool(4)], 5),
    [1, 3],
    "Curve factory discovery should revisit missing index gaps after earlier slot failures",
  );
}

{
  assert.deepEqual(
    discoverFactoryIndexesToScan([pool(-1), pool(1.5), { metadata: {} }, pool(10)], 3),
    [0, 1, 2],
    "malformed or out-of-range factoryIndex metadata should not hide listed slots",
  );
}

console.log("Curve factory discovery checks passed.");
