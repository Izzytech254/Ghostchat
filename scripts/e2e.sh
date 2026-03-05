#!/usr/bin/env bash
# scripts/e2e.sh – Run all test suites (unit + integration)
# ──────────────────────────────────────────────────────────
# Usage:
#   ./scripts/e2e.sh              # unit tests only (no Docker required)
#   ./scripts/e2e.sh --integration # unit + full integration (requires Docker)
#
# Returns exit code 1 if any suite fails.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTEGRATION=false

for arg in "$@"; do
  [[ "$arg" == "--integration" ]] && INTEGRATION=true
done

PASS=0
FAIL=0

run() {
  local label="$1"; shift
  echo ""
  echo "══ $label ══════════════════════════════════════════"
  if "$@"; then
    echo "  → PASSED"
    ((PASS++)) || true
  else
    echo "  → FAILED"
    ((FAIL++)) || true
  fi
}

# ── Unit tests ─────────────────────────────────────────────────────────────────

run "Relay server (Jest)" \
  bash -c "cd '$ROOT/backend' && npx jest --no-coverage 2>&1"

run "Relay server E2E in-process (Jest)" \
  bash -c "cd '$ROOT/backend' && npx jest --no-coverage tests/e2e.test.js 2>&1"

run "Key server (pytest)" \
  bash -c "cd '$ROOT/key-server' && .venv/bin/pytest tests/ -v 2>&1"

run "Web client (vitest)" \
  bash -c "cd '$ROOT/web-client' && npx vitest run 2>&1"

# ── Integration tests (optional, require live Docker services) ─────────────────

if $INTEGRATION; then
  echo ""
  echo "══ Starting Docker Compose stack ══════════════════════"
  docker compose -f "$ROOT/docker-compose.yml" up -d --wait relay key-server redis

  sleep 2   # give services a moment to become ready

  run "Full-stack integration (Node.js)" \
    bash -c "cd '$ROOT' && node e2e/integration.js"

  echo ""
  echo "── Tearing down Docker stack ──────────────────────────"
  docker compose -f "$ROOT/docker-compose.yml" down
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Suites passed: $PASS   Failed: $FAIL"
echo "══════════════════════════════════════════════════════"
echo ""

[[ $FAIL -eq 0 ]]
