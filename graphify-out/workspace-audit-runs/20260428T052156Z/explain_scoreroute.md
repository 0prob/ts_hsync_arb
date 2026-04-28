```bash
graphify explain scoreRoute\(\)
```

Node: scoreRoute()
  ID:        score_route_scoreroute
  Source:    src/routing/score_route.ts L112
  Type:      code
  Community: 0
  Degree:    8

Connections (8):
  --> score_route.ts [contains] [EXTRACTED]
  --> getPathHopCount() [calls] [INFERRED]
  --> scoreForCandidate() [calls] [INFERRED]
  --> bigintToApproxNumber() [calls] [EXTRACTED]
  --> scaledRatioToApproxNumber() [calls] [EXTRACTED]
  --> gasCostInStartTokenUnits() [calls] [EXTRACTED]
  --> rankRoutes() [calls] [EXTRACTED]
  --> estimateGasCostWei() [calls] [EXTRACTED]
