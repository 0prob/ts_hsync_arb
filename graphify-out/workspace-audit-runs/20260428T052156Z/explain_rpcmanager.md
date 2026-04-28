```bash
graphify explain RpcManager
```

Node: RpcManager
  ID:        rpc_manager_rpcmanager
  Source:    src/utils/rpc_manager.ts L234
  Type:      code
  Community: 5
  Degree:    23

Connections (23):
  --> rpc_manager.ts [contains] [EXTRACTED]
  --> .getBestEndpoint() [method] [EXTRACTED]
  --> ._selectEndpoint() [method] [EXTRACTED]
  --> ._methodAvailableEndpoints() [method] [EXTRACTED]
  --> .msUntilAnyEndpointAvailable() [method] [EXTRACTED]
  --> .checkoutBestEndpoint() [method] [EXTRACTED]
  --> .markError() [method] [EXTRACTED]
  --> .markSuccess() [method] [EXTRACTED]
  --> .methodUnavailableCount() [method] [EXTRACTED]
  --> .areAllEndpointsMethodUnavailable() [method] [EXTRACTED]
  --> .probe() [method] [EXTRACTED]
  --> .getBestClient() [method] [EXTRACTED]
  --> .markRateLimited() [method] [EXTRACTED]
  --> .markMethodUnavailable() [method] [EXTRACTED]
  --> .releaseEndpoint() [method] [EXTRACTED]
  --> .start() [method] [EXTRACTED]
  --> ._compareScores() [method] [EXTRACTED]
  --> ._roundRobinTieBreak() [method] [EXTRACTED]
  --> ._isMethodUnavailable() [method] [EXTRACTED]
  --> .constructor() [method] [EXTRACTED]
  ... and 3 more
