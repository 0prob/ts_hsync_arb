```bash
graphify explain recommendGasParams\(\)
```

Node: recommendGasParams()
  ID:        gas_recommendgasparams
  Source:    src/execution/gas.ts L464
  Type:      code
  Community: 7
  Degree:    20

Connections (20):
  --> .get() [calls] [INFERRED]
  --> get() [calls] [INFERRED]
  --> .get() [calls] [INFERRED]
  --> gas.ts [contains] [EXTRACTED]
  --> buildArbTx() [calls] [INFERRED]
  --> ensureFreshGasOracle() [calls] [EXTRACTED]
  --> effectiveGasPriceWei() [calls] [EXTRACTED]
  --> normalizeFeeSnapshot() [calls] [EXTRACTED]
  --> .getFees() [calls] [EXTRACTED]
  --> getCachedGasEstimate() [calls] [EXTRACTED]
  --> rememberGasEstimate() [calls] [EXTRACTED]
  --> estimateGasFn() [calls] [INFERRED]
  --> buildTransferTx() [calls] [INFERRED]
  --> maxBigInt() [calls] [EXTRACTED]
  --> capGasFeesToBudget() [calls] [EXTRACTED]
  --> bufferedGasLimit() [calls] [EXTRACTED]
  --> normalizeGasEstimate() [calls] [EXTRACTED]
  --> normalizeCacheTtlMs() [calls] [EXTRACTED]
  --> normalizeCacheMaxEntries() [calls] [EXTRACTED]
  --> normalizeNowMs() [calls] [EXTRACTED]
