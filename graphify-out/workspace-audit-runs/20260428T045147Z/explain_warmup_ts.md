```bash
graphify explain warmup.ts
```

Node: test_warmup.ts
  ID:        scripts_test_warmup_ts
  Source:    scripts/test_warmup.ts L1
  Type:      code
  Community: 19
  Degree:    9

Connections (9):
  --> normalizer.ts [imports_from] [EXTRACTED]
  --> pool_record.ts [imports_from] [EXTRACTED]
  --> warmup.ts [imports_from] [EXTRACTED]
  --> pool() [contains] [EXTRACTED]
  --> poolWithTokens() [contains] [EXTRACTED]
  --> validV3Raw() [contains] [EXTRACTED]
  --> zeroLiquidityV3Raw() [contains] [EXTRACTED]
  --> createHarness() [contains] [EXTRACTED]
  --> zeroReserveV2Raw() [contains] [EXTRACTED]
