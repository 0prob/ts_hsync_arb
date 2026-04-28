# Workspace Graphify Audit Run

- Run ID: `20260428T045147Z`
- Root: `/home/x/arb/t`
- Scope: correctness, production safety, optimization, and verification gaps

- Query budget: `800`
- Scope notes: [SCOPE.md](SCOPE.md)

- PASS `update`: [refresh root graph](update_refresh_root_graph.md)
- PASS `query`: [cross community bridge risk](query_cross_community_bridge_risk.md)
- PASS `query`: [profitable trade correctness](query_profitable_trade_correctness.md)
- PASS `query`: [state freshness and rollback correctness](query_state_freshness_and_rollback_correctness.md)
- PASS `query`: [discovery coverage and topology admission](query_discovery_coverage_and_topology_admission.md)
- PASS `query`: [gas math and token unit parity](query_gas_math_and_token_unit_parity.md)
- PASS `query`: [execution and abi safety](query_execution_and_abi_safety.md)
- PASS `query`: [rpc resilience and endpoint optimization](query_rpc_resilience_and_endpoint_optimization.md)
- PASS `query`: [database transaction and cache consistency](query_database_transaction_and_cache_consistency.md)
- PASS `query`: [math invariant and precision audit](query_math_invariant_and_precision_audit.md)
- PASS `query`: [hot path optimization opportunities](query_hot_path_optimization_opportunities.md)
- PASS `query`: [startup warmup and hang risks](query_startup_warmup_and_hang_risks.md)
- PASS `query`: [runtime config and package script drift](query_runtime_config_and_package_script_drift.md)
- PASS `query`: [route topology cache and performance persistence](query_route_topology_cache_and_performance_persistence.md)
- PASS `query`: [graph confidence and inferred edge validation](query_graph_confidence_and_inferred_edge_validation.md)
- PASS `query`: [audit pack coverage and query quality](query_audit_pack_coverage_and_query_quality.md)
- PASS `query`: [observability and operator confusion](query_observability_and_operator_confusion.md)
- PASS `query`: [test and verification gaps](query_test_and_verification_gaps.md)
- PASS `query`: [dead code and conflicting ownership](query_dead_code_and_conflicting_ownership.md)
- PASS `query`: [combined repair roadmap](query_combined_repair_roadmap.md)
- PASS `path`: [discoverPools() to computeProfit()](path_discoverpools_to_computeprofit.md)
- PASS `path`: [StateWatcher to simulateHop()](path_statewatcher_to_simulatehop.md)
- PASS `path`: [rollbackToBlock() to RouteCache](path_rollbacktoblock_to_routecache.md)
- PASS `path`: [scoreRoute() to buildArbTx()](path_scoreroute_to_buildarbtx.md)
- PASS `path`: [computeProfit() to recommendGasParams()](path_computeprofit_to_recommendgasparams.md)
- PASS `path`: [RpcManager to readContractWithRetry()](path_rpcmanager_to_readcontractwithretry.md)
- PASS `path`: [RegistryService to buildGraph()](path_registryservice_to_buildgraph.md)
- PASS `path`: [RouteCache to sendTx()](path_routecache_to_sendtx.md)
- PASS `path`: [log() to startTui()](path_log_to_starttui.md)
- PASS `path`: [createTopologyService() to enumerateCyclesDual()](path_createtopologyservice_to_enumeratecyclesdual.md)
- PASS `path`: [startMetricsServer() to runner.ts](path_startmetricsserver_to_runner_ts.md)
- PASS `path`: [warmup.ts to boot_mode.ts](path_warmup_ts_to_boot_mode_ts.md)
- PASS `path`: [boot_mode.ts to startMetricsServer()](path_boot_mode_ts_to_startmetricsserver.md)
- PASS `explain`: [RegistryService](explain_registryservice.md)
- PASS `explain`: [StateWatcher](explain_statewatcher.md)
- PASS `explain`: [RouteCache](explain_routecache.md)
- PASS `explain`: [RpcManager](explain_rpcmanager.md)
- PASS `explain`: [startMetricsServer()](explain_startmetricsserver.md)
- PASS `explain`: [warmup.ts](explain_warmup_ts.md)
- PASS `explain`: [createTopologyService()](explain_createtopologyservice.md)
- PASS `explain`: [computeProfit()](explain_computeprofit.md)
- PASS `explain`: [scoreRoute()](explain_scoreroute.md)
- PASS `explain`: [recommendGasParams()](explain_recommendgasparams.md)
- PASS `explain`: [buildArbTx()](explain_buildarbtx.md)
- PASS `explain`: [sendTx()](explain_sendtx.md)
- PASS `explain`: [WorkerPool](explain_workerpool.md)

## Summary

- Outputs: `graphify-out/workspace-audit-runs/20260428T045147Z`
- Scope: `graphify-out/workspace-audit-runs/20260428T045147Z/SCOPE.md`
- Commands: `graphify-out/workspace-audit-runs/20260428T045147Z/commands.tsv`
