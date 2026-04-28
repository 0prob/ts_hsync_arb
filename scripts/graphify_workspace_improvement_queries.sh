#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Compatibility entrypoint retained for older notes and operator muscle memory.
# The workspace audit pack now includes the improvement-roadmap queries.
exec "$ROOT_DIR/scripts/graphify_workspace_audit_queries.sh" "$@"
