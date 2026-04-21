#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_PATH="${1:-.}"

cd "$ROOT_DIR"

run() {
  printf '\n==> %s\n' "$*"
  "$@"
}

run graphify update "$TARGET_PATH"

run graphify query "Trace the live TUI architecture end to end. Identify the active renderer, how BotState is populated and mutated, how logs and opportunities are summarized for display, and whether any alternate TUI components are currently dead code or disconnected from runtime."

run graphify query "Audit the TUI for robustness risks. Focus on raw-mode terminal handling, cleanup on exit, non-TTY behavior, stdout write failures, signal handling, resize behavior, accidental exits from input parsing, and any ways the TUI could leave the terminal in a broken state."

run graphify query "Audit the TUI for appearance and operator usability. Focus on information density, visual hierarchy, truncation strategy, noisy styling, scanability under pressure, ambiguity in status or profit display, and whether the most important recent events are easy to spot quickly."

run graphify query "Audit the TUI for performance costs and unnecessary churn. Focus on fixed-interval redraws, string construction, full-screen writes, log list copying, repeated formatting work, and whether rendering happens even when state has not changed."

run graphify query "Rank the top 10 highest-leverage TUI improvements across appearance, performance, and robustness. Prefer concrete changes with likely owner files and explain why each would improve operator outcomes or runtime safety."

run graphify query "Trace how runner.ts log() populates botState.logs and how runPass updates botState.opportunities. Identify where important context is lost before reaching the TUI, which fields should be normalized, and where summaries risk hiding actionable information."

run graphify query "Look specifically for TUI regressions or confusion caused by type looseness, shape drift, or mismatched assumptions between runner.ts, src/runtime/runtime_context.ts, src/tui/types.ts, and src/tui/index.tsx."

run graphify path "runner.ts" "startTui()"
run graphify path "log()" "botState.logs"
run graphify path "runPass()" "botState.opportunities"
run graphify path "createRuntimeContext()" "startTui()"

run graphify explain "startTui()"
run graphify explain "BotState"
run graphify explain "runPass()"
