#!/usr/bin/env bash
#
# Run kupua Playwright E2E tests with full orchestration.
#
# This script handles the entire lifecycle:
#   1. Ensures Docker is running
#   2. Starts kupua's local ES (port 9220) if not already up
#   3. Waits for ES to be healthy + shards recovered
#   4. Verifies sample data is loaded (loads if missing)
#   5. Kills any stale Vite dev server on port 3000
#   6. Runs Playwright tests (Vite auto-started by playwright.config.ts)
#   7. Reports results
#
# Usage:
#   ./kupua/scripts/run-e2e.sh                     # run all tests
#   ./kupua/scripts/run-e2e.sh --headed            # run with visible browser
#   ./kupua/scripts/run-e2e.sh --debug             # run in Playwright debug mode
#   ./kupua/scripts/run-e2e.sh --ui                # run in Playwright UI mode
#   ./kupua/scripts/run-e2e.sh -- <playwright args> # pass extra args to Playwright
#
# Cleanup:
#   The script does NOT stop Docker ES on exit — it stays running for
#   faster re-runs. Use `docker compose -f kupua/docker-compose.yml down`
#   to stop it manually.
#
# Timeout safety:
#   Individual test timeout: 30s (configurable via --timeout flag to Playwright)
#   Playwright global timeout: handled by playwright.config.ts
#   This script times out after 5 minutes if ES never becomes healthy.

set -euo pipefail

green='\033[0;32m'
red='\033[0;31m'
yellow='\033[0;33m'
cyan='\033[0;36m'
plain='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KUPUA_DIR="${SCRIPT_DIR}/.."

# Parse arguments — anything before "--" is ours, after is passed to Playwright
PW_ARGS=()
SKIP_INFRA=false
for arg in "$@"; do
  case "$arg" in
    --skip-infra)  SKIP_INFRA=true ;;
    --headed)      PW_ARGS+=(--headed) ;;
    --debug)       PW_ARGS+=(--debug) ;;
    --ui)          PW_ARGS+=(--ui) ;;
    --)            ;; # separator, skip it
    *)             PW_ARGS+=("$arg") ;;
  esac
done

# ---------------------------------------------------------------------------
# 1. Docker check
# ---------------------------------------------------------------------------
if [ "$SKIP_INFRA" = false ]; then
  if ! docker info > /dev/null 2>&1; then
    echo -e "${red}ERROR: Docker is not running.${plain}"
    echo "  E2E tests need Elasticsearch on port 9220."
    echo "  Start Docker Desktop and try again."
    echo "  Or use --skip-infra if ES is already running elsewhere."
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# 2. Start ES container (idempotent — docker compose up -d is a no-op if running)
# ---------------------------------------------------------------------------
if [ "$SKIP_INFRA" = false ]; then
  echo -e "${cyan}[1/4] Starting Elasticsearch (port 9220)...${plain}"
  cd "$KUPUA_DIR"
  docker compose up -d 2>&1 | grep -v "^$" || true

  # Wait for ES to be healthy
  echo -e "${yellow}      Waiting for ES to be ready...${plain}"
  max_retries=30
  retry=0
  until curl -sf http://localhost:9220/_cluster/health > /dev/null 2>&1; do
    retry=$((retry + 1))
    if [ $retry -ge $max_retries ]; then
      echo -e "${red}ERROR: Elasticsearch not available after ${max_retries} attempts (60s).${plain}"
      echo "  Check docker logs: docker compose -f kupua/docker-compose.yml logs"
      exit 1
    fi
    printf "      Waiting... (%d/%d)\r" "$retry" "$max_retries"
    sleep 2
  done
  echo -e "${green}      Elasticsearch is ready ✓${plain}"

  # Wait for shards to recover (yellow = primaries allocated)
  shard_retry=0
  until curl -sf "http://localhost:9220/_cluster/health?wait_for_status=yellow&timeout=2s" > /dev/null 2>&1; do
    shard_retry=$((shard_retry + 1))
    if [ $shard_retry -ge 15 ]; then
      echo -e "${yellow}      Warning: cluster not yet yellow after 30s — proceeding anyway${plain}"
      break
    fi
    sleep 2
  done
else
  echo -e "${yellow}[1/4] Skipping infrastructure (--skip-infra)${plain}"
fi

# ---------------------------------------------------------------------------
# 3. Verify sample data
# ---------------------------------------------------------------------------
if [ "$SKIP_INFRA" = false ]; then
  echo -e "${cyan}[2/4] Checking sample data...${plain}"
  INDEX_EXISTS=$(curl -sf -o /dev/null -w "%{http_code}" "http://localhost:9220/images" 2>/dev/null || echo "000")

  if [ "$INDEX_EXISTS" = "200" ]; then
    DOC_COUNT=$(curl -sf "http://localhost:9220/images/_count" | python3 -c "import sys,json; d=sys.stdin.read().strip(); print(json.loads(d)['count'] if d else 0)" 2>/dev/null || echo "0")
    if [ "$DOC_COUNT" -gt 0 ] 2>/dev/null; then
      echo -e "${green}      Index 'images' has ${DOC_COUNT} documents ✓${plain}"
    else
      echo -e "${yellow}      Index exists but is empty. Loading data...${plain}"
      "$SCRIPT_DIR/load-sample-data.sh"
    fi
  else
    echo -e "${yellow}      Index not found. Loading sample data...${plain}"
    "$SCRIPT_DIR/load-sample-data.sh"
  fi
else
  echo -e "${yellow}[2/4] Skipping data check (--skip-infra)${plain}"
fi

# ---------------------------------------------------------------------------
# 4. Kill stale processes on port 3000 (Vite) — prevent conflicts
# ---------------------------------------------------------------------------
echo -e "${cyan}[3/4] Cleaning up stale processes...${plain}"
STALE_VITE=$(lsof -i:3000 -sTCP:LISTEN -t 2>/dev/null || true)
if [ -n "$STALE_VITE" ]; then
  echo -e "${yellow}      Killing stale process on port 3000 (PID: ${STALE_VITE})${plain}"
  kill $STALE_VITE 2>/dev/null || true
  sleep 1
  # Force kill if still alive
  kill -9 $STALE_VITE 2>/dev/null || true
  sleep 1
fi

# Also kill any orphaned Playwright test runners
STALE_PW=$(pgrep -f "playwright.*test" 2>/dev/null || true)
if [ -n "$STALE_PW" ]; then
  echo -e "${yellow}      Killing stale Playwright processes: ${STALE_PW}${plain}"
  echo "$STALE_PW" | xargs kill 2>/dev/null || true
  sleep 1
fi
echo -e "${green}      Clean ✓${plain}"

# ---------------------------------------------------------------------------
# 5. Run Playwright
# ---------------------------------------------------------------------------
echo -e "${cyan}[4/4] Running Playwright tests...${plain}"
echo
cd "$KUPUA_DIR"

# Set NODE_OPTIONS to limit memory and prevent runaway processes
export NODE_OPTIONS="--max-old-space-size=2048"

# Run Playwright with the list reporter for CI-friendly output
# Playwright config auto-starts Vite via webServer config
if npx playwright test --reporter=list "${PW_ARGS[@]+"${PW_ARGS[@]}"}"; then
  echo
  echo -e "${green}═══════════════════════════════════════${plain}"
  echo -e "${green}  All E2E tests passed ✓${plain}"
  echo -e "${green}═══════════════════════════════════════${plain}"
  EXIT_CODE=0
else
  EXIT_CODE=$?
  echo
  echo -e "${red}═══════════════════════════════════════${plain}"
  echo -e "${red}  Some E2E tests failed (exit: ${EXIT_CODE})${plain}"
  echo -e "${red}═══════════════════════════════════════${plain}"
  echo
  echo -e "${yellow}  View report: npx playwright show-report kupua/playwright-report${plain}"
fi

# Clean up any Vite server that Playwright left behind
LEFTOVER_VITE=$(lsof -i:3000 -sTCP:LISTEN -t 2>/dev/null || true)
if [ -n "$LEFTOVER_VITE" ]; then
  kill $LEFTOVER_VITE 2>/dev/null || true
fi

exit ${EXIT_CODE}

