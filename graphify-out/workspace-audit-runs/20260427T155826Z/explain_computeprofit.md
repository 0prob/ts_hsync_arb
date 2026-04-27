```bash
graphify explain computeProfit\(\)
```

Node: computeProfit()
  ID:        compute_computeprofit
  Source:    src/profit/compute.ts L221
  Type:      code
  Community: 0
  Degree:    10

Connections (10):
  --> compute.ts [contains] [EXTRACTED]
  --> assessRouteResult() [calls] [INFERRED]
  --> getResultHopCount() [calls] [INFERRED]
  --> gasCostInTokenUnits() [calls] [EXTRACTED]
  --> roiMicroUnits() [calls] [EXTRACTED]
  --> invalidAssessment() [calls] [EXTRACTED]
  --> gasCostWei() [calls] [EXTRACTED]
  --> applySlippage() [calls] [EXTRACTED]
  --> revertRiskPenalty() [calls] [EXTRACTED]
  --> isProfitable() [calls] [EXTRACTED]
