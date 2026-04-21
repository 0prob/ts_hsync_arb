export type PoolsChangedEvent = {
  type: "pools_changed";
  changedPools: Set<string>;
};

export type ReorgDetectedEvent = {
  type: "reorg_detected";
  reorgBlock: number;
  changedPools: Set<string>;
};

export type PoolsDiscoveredEvent = {
  type: "pools_discovered";
  pools: any[];
};
