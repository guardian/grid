#!/usr/bin/env bash
#
# Start kupua for local development.
#
# This script:
#   1. Starts kupua's local Elasticsearch (docker compose, port 9220)
#   2. Waits for ES to be healthy
#   3. Loads sample data if the index is empty or missing
#   4. Installs npm dependencies if needed
#   5. Starts the Vite dev server on port 3000
#
# Usage:
#   ./kupua/scripts/start.sh
#
# Options:
#   --skip-es       Skip starting / waiting for Elasticsearch
#   --skip-data     Skip checking / loading sample data
#   --skip-install  Skip npm install check
#
# Prerequisites:
#   - Docker must be running
#   - Node.js ≥ 18 must be installed
#   - Sample data file must exist at kupua/exploration/mock/sample-data.ndjson
#     (download from S3 if missing: aws s3 cp s3://<sample-data-backup-bucket>/sample-data.ndjson kupua/exploration/mock/sample-data.ndjson)

set -euo pipefail

green='\033[0;32m'
red='\033[0;31m'
yellow='\033[0;33m'
cyan='\033[0;36m'
plain='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KUPUA_DIR="${SCRIPT_DIR}/.."
ES_URL="${KUPUA_ES_URL:-http://localhost:9220}"

SKIP_ES=false
SKIP_DATA=false
SKIP_INSTALL=false

for arg in "$@"; do
  case "$arg" in
    --skip-es)      SKIP_ES=true ;;
    --skip-data)    SKIP_DATA=true ;;
    --skip-install) SKIP_INSTALL=true ;;
    *)
      echo -e "${red}Unknown option: $arg${plain}"
      echo "Usage: $0 [--skip-es] [--skip-data] [--skip-install]"
      exit 1
      ;;
  esac
done

echo -e "${cyan}╔══════════════════════════════════════╗${plain}"
echo -e "${cyan}║         Starting Kupua               ║${plain}"
echo -e "${cyan}╚══════════════════════════════════════╝${plain}"
echo

# --- 1. Start Elasticsearch ---
if [ "$SKIP_ES" = false ]; then
  echo -e "${yellow}[1/4] Starting Elasticsearch (port 9220)...${plain}"
  cd "$KUPUA_DIR"
  docker compose up -d
  echo

  # Wait for ES to be healthy
  echo -e "${yellow}      Waiting for Elasticsearch to be ready...${plain}"
  max_retries=30
  retry=0
  until curl -sf "${ES_URL}/_cluster/health" > /dev/null 2>&1; do
    retry=$((retry + 1))
    if [ $retry -ge $max_retries ]; then
      echo -e "${red}ERROR: Elasticsearch not available after ${max_retries} attempts.${plain}"
      echo "  Check docker logs: docker compose -f kupua/docker-compose.yml logs"
      exit 1
    fi
    printf "      Waiting... (%d/%d)\r" "$retry" "$max_retries"
    sleep 2
  done
  echo -e "${green}      Elasticsearch is ready ✓${plain}"
else
  echo -e "${yellow}[1/4] Skipping Elasticsearch (--skip-es)${plain}"
fi
echo

# --- 2. Load sample data if needed ---
if [ "$SKIP_DATA" = false ] && [ "$SKIP_ES" = false ]; then
  echo -e "${yellow}[2/4] Checking sample data...${plain}"
  INDEX_EXISTS=$(curl -sf -o /dev/null -w "%{http_code}" "${ES_URL}/images" 2>/dev/null || echo "000")

  if [ "$INDEX_EXISTS" = "200" ]; then
    DOC_COUNT=$(curl -sf "${ES_URL}/images/_count" | python3 -c "import sys,json; print(json.load(sys.stdin)['count'])" 2>/dev/null || echo "0")
    if [ "$DOC_COUNT" -gt 0 ] 2>/dev/null; then
      echo -e "${green}      Index 'images' exists with ${DOC_COUNT} documents ✓${plain}"
    else
      echo -e "${yellow}      Index exists but is empty. Loading data...${plain}"
      "$SCRIPT_DIR/load-sample-data.sh"
    fi
  else
    echo -e "${yellow}      Index not found. Loading sample data...${plain}"
    "$SCRIPT_DIR/load-sample-data.sh"
  fi
else
  echo -e "${yellow}[2/4] Skipping data check${plain}"
fi
echo

# --- 3. Install dependencies ---
if [ "$SKIP_INSTALL" = false ]; then
  echo -e "${yellow}[3/4] Checking dependencies...${plain}"
  cd "$KUPUA_DIR"
  if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.package-lock.json" ]; then
    echo -e "${yellow}      Installing npm dependencies...${plain}"
    npm install
    echo -e "${green}      Dependencies installed ✓${plain}"
  else
    echo -e "${green}      Dependencies up to date ✓${plain}"
  fi
else
  echo -e "${yellow}[3/4] Skipping dependency check (--skip-install)${plain}"
fi
echo

# --- 4. Start dev server ---
echo -e "${yellow}[4/4] Starting Vite dev server...${plain}"
echo -e "${cyan}      → http://localhost:3000${plain}"
echo
cd "$KUPUA_DIR"
exec npm run dev

