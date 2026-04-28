```bash
graphify explain buildArbTx\(\)
```

Node: buildArbTx()
  ID:        build_tx_buildarbtx
  Source:    src/execution/build_tx.ts L203
  Type:      code
  Community: 10
  Degree:    9

Connections (9):
  --> recommendGasParams() [calls] [INFERRED]
  --> build_tx.ts [contains] [EXTRACTED]
  --> encodeRoute() [calls] [INFERRED]
  --> buildFlashParams() [calls] [INFERRED]
  --> assertValidRouteForExecution() [calls] [EXTRACTED]
  --> gasEstimateCacheKeyForRoute() [calls] [EXTRACTED]
  --> encodeExecuteArb() [calls] [INFERRED]
  --> resolveFlashLoan() [calls] [EXTRACTED]
  --> gasEstimateCacheKey() [calls] [INFERRED]
