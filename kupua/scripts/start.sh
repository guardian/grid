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
#   ./kupua/scripts/start.sh                     # local mock data (default)
#   ./kupua/scripts/start.sh --use-TEST          # connect to TEST ES via SSH tunnel
#
# Options:
#   --use-TEST      Connect to real TEST ES cluster via SSH tunnel (port 9200).
#                   Requires: media-service AWS profile credentials.
#                   Skips local ES startup and sample data loading.
#                   Sets VITE_ES_IS_LOCAL=false (enables write protection).
#   --skip-es       Skip starting / waiting for Elasticsearch
#   --skip-data     Skip checking / loading sample data
#   --skip-install  Skip npm install check
#
# Prerequisites:
#   - Docker must be running (unless --use-TEST or --skip-es)
#   - Node.js ^20.19.0 || >=22.12.0 (required by Vite 8)
#   - For local mode: sample data file at kupua/exploration/mock/sample-data.ndjson
#   - For --use-TEST: media-service AWS profile with valid credentials
#
# See kupua/exploration/docs/safeguards.md for safety documentation.

set -euo pipefail

green='\033[0;32m'
red='\033[0;31m'
yellow='\033[0;33m'
cyan='\033[0;36m'
plain='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KUPUA_DIR="${SCRIPT_DIR}/.."

USE_TEST=false
SKIP_ES=false
SKIP_DATA=false
SKIP_INSTALL=false

for arg in "$@"; do
  case "$arg" in
    --use-TEST)     USE_TEST=true ;;
    --skip-es)      SKIP_ES=true ;;
    --skip-data)    SKIP_DATA=true ;;
    --skip-install) SKIP_INSTALL=true ;;
    *)
      echo -e "${red}Unknown option: $arg${plain}"
      echo "Usage: $0 [--use-TEST] [--skip-es] [--skip-data] [--skip-install]"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Check Node.js version — Vite 8 requires ^20.19.0 || >=22.12.0
# ---------------------------------------------------------------------------
if ! command -v node &> /dev/null; then
  echo -e "${red}ERROR: Node.js is not installed.${plain}"
  echo "  Install Node.js ≥ 20.19 (recommended: latest LTS via nvm or fnm)."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/^v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
NODE_MINOR=$(echo "$NODE_VERSION" | cut -d. -f2)

NODE_OK=false
if [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -ge 19 ]; then
  NODE_OK=true
elif [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -ge 12 ]; then
  NODE_OK=true
elif [ "$NODE_MAJOR" -ge 23 ]; then
  NODE_OK=true
fi

if [ "$NODE_OK" = false ]; then
  echo -e "${red}ERROR: Node.js v${NODE_VERSION} is not supported by Vite 8.${plain}"
  echo "  Required: ^20.19.0 || >=22.12.0"
  echo "  Current:  v${NODE_VERSION}"
  echo
  echo "  Update via nvm:  nvm install --lts"
  echo "  Update via fnm:  fnm install --lts"
  echo "  Update via brew: brew upgrade node"
  exit 1
fi

# ---------------------------------------------------------------------------
# Check Docker is running — only when we actually need it
# ---------------------------------------------------------------------------
# Local mode needs Docker for ES (unless --skip-es).
# TEST mode needs Docker for imgproxy and to stop local ES.
NEEDS_DOCKER=false
if [ "$USE_TEST" = true ]; then
  NEEDS_DOCKER=true
elif [ "$SKIP_ES" = false ]; then
  NEEDS_DOCKER=true
fi

if [ "$NEEDS_DOCKER" = true ]; then
  if ! docker info > /dev/null 2>&1; then
    echo -e "${red}ERROR: Docker is not running.${plain}"
    if [ "$USE_TEST" = true ]; then
      echo "  Docker is needed for imgproxy (full-size image proxy)."
      echo "  Start Docker Desktop and try again."
    else
      echo "  Docker is needed to run Elasticsearch (port 9220)."
      echo "  Start Docker Desktop and try again, or use --skip-es if ES is already running."
    fi
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Check port availability — fail early with a clear message
# ---------------------------------------------------------------------------
check_port() {
  local port="$1"
  local service="$2"
  local suggestion="$3"
  # -sTCP:LISTEN: only detect processes listening on the port, not clients connected to it
  if lsof -i:"$port" -sTCP:LISTEN -t > /dev/null 2>&1; then
    local pid=$(lsof -i:"$port" -sTCP:LISTEN -t | head -1)
    local proc=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
    echo -e "${red}ERROR: Port ${port} is already in use (PID ${pid}: ${proc}).${plain}"
    echo "  ${service} needs this port."
    echo "  ${suggestion}"
    return 1
  fi
  return 0
}

# Vite dev server port
PORT_OK=true
if ! check_port 3000 "Vite dev server" "Kill the process or change kupua's port in vite.config.ts"; then
  PORT_OK=false
fi

# ES port (only in local mode)
if [ "$USE_TEST" = false ] && [ "$SKIP_ES" = false ]; then
  # Port 9220 might be in use by our own kupua-elasticsearch container — that's OK
  ES_HOLDER=$(lsof -i:9220 -sTCP:LISTEN -t 2>/dev/null | head -1 || true)
  if [ -n "$ES_HOLDER" ]; then
    ES_PROC=$(ps -p "$ES_HOLDER" -o comm= 2>/dev/null || echo "unknown")
    if [[ "$ES_PROC" != *"com.docke"* ]] && [[ "$ES_PROC" != *"docker"* ]] && [[ "$ES_PROC" != *"vpnkit"* ]]; then
      echo -e "${red}ERROR: Port 9220 is already in use by a non-Docker process (PID ${ES_HOLDER}: ${ES_PROC}).${plain}"
      echo "  Kupua's Elasticsearch needs this port."
      echo "  Kill the process or use --skip-es if you have ES running elsewhere."
      PORT_OK=false
    fi
  fi
fi

if [ "$PORT_OK" = false ]; then
  exit 1
fi

# ---------------------------------------------------------------------------
# Mode: --use-TEST (connect to real TEST ES via SSH tunnel)
# ---------------------------------------------------------------------------
if [ "$USE_TEST" = true ]; then
  echo -e "${cyan}╔══════════════════════════════════════╗${plain}"
  echo -e "${cyan}║      Starting Kupua (TEST mode)      ║${plain}"
  echo -e "${cyan}╚══════════════════════════════════════╝${plain}"
  echo
  echo -e "${yellow}  ⚠  Connecting to real TEST Elasticsearch cluster.${plain}"
  echo -e "${yellow}     Write protection is enabled (read-only queries only).${plain}"
  echo -e "${yellow}     See kupua/exploration/docs/safeguards.md${plain}"
  echo

  # --- 1. Establish SSH tunnel if not already running ---
  # (Mirrors Grid's dev/script/start.sh startDockerContainers() behaviour)
  EXISTING_TUNNELS=$(ps -ef | grep ssh | grep 9200 | grep -v grep || true)

  # Stop kupua's local docker ES if running — port 9200 needed for tunnel
  if (docker stats --no-stream &> /dev/null); then
    echo -e "${yellow}[1/3] Stopping local docker ES (port 9220)...${plain}"
    cd "$KUPUA_DIR"
    docker compose down 2>/dev/null || true
  fi

  if [ -n "$EXISTING_TUNNELS" ]; then
    echo -e "${green}[1/3] Re-using existing SSH tunnel to TEST ES (port 9200) ✓${plain}"
  else
    echo -e "${yellow}[1/3] Establishing SSH tunnel to TEST ES (port 9200)...${plain}"

    if ! command -v ssm &> /dev/null; then
      echo -e "${red}ERROR: 'ssm' command not found.${plain}"
      echo "  Install ssm-scala: https://github.com/guardian/ssm-scala"
      exit 1
    fi

    # Check AWS credentials (same pattern as Grid's hasCredentials())
    STATUS=$(aws sts get-caller-identity --profile media-service 2>&1 || true)
    if [[ ${STATUS} =~ (ExpiredToken) ]]; then
      echo -e "${red}Credentials for the media-service profile are expired. Please fetch new credentials and run this again.${plain}"
      exit 1
    elif [[ ${STATUS} =~ ("could not be found") ]]; then
      echo -e "${red}Credentials for the media-service profile are missing. Please ensure you have the right credentials.${plain}"
      exit 1
    fi

    TUNNEL_OPTS="-o ExitOnForwardFailure=yes -o ServerAliveInterval=10 -o ServerAliveCountMax=2"
    SSH_COMMAND=$(ssm ssh --profile media-service -t elasticsearch-data,media-service,TEST --newest --raw)
    eval $SSH_COMMAND -f -N $TUNNEL_OPTS -L 9200:localhost:9200
    echo -e "${green}      SSH tunnel established ✓${plain}"
  fi
  echo

  # --- 2. Discover the index alias ---
  echo -e "${yellow}[2/3] Discovering TEST ES index...${plain}"
  # Give the tunnel a moment to stabilise
  sleep 1

  if ! curl -sf "http://localhost:9200/_cluster/health" > /dev/null 2>&1; then
    echo -e "${red}ERROR: Cannot reach ES at localhost:9200.${plain}"
    echo "  The SSH tunnel may not be ready. Try again in a few seconds."
    exit 1
  fi

  # Find the alias that looks like "images_current" or similar
  INDEX_ALIAS=$(curl -sf "http://localhost:9200/_cat/aliases?format=json" \
    | python3 -c "
import json, sys
aliases = json.load(sys.stdin)
for a in aliases:
    if a['alias'].lower() == 'images_current':
        print(a['index'])
        sys.exit(0)
for a in aliases:
    if a['alias'].lower().startswith('images'):
        print(a['index'])
        sys.exit(0)
print('')
" 2>/dev/null || echo "")

  if [ -z "$INDEX_ALIAS" ]; then
    echo -e "${red}ERROR: Could not discover an images index on TEST ES.${plain}"
    echo "  Check manually: curl 'http://localhost:9200/_cat/aliases?v' | grep -i images"
    echo "  Then set VITE_ES_INDEX=<alias> manually in kupua/.env.local"
    exit 1
  fi

  echo -e "${green}      Found index: ${INDEX_ALIAS} (via Images_Current alias) ✓${plain}"
  echo

  # Export env vars for Vite
  export KUPUA_ES_URL="http://localhost:9200"
  export VITE_ES_INDEX="$INDEX_ALIAS"
  export VITE_ES_IS_LOCAL="false"

  # --- 3. Discover S3 bucket names + start thumbnail proxy ---
  echo -e "${yellow}[3/6] Discovering S3 bucket names...${plain}"

  # Query ES for one document to extract bucket names from URLs
  SAMPLE_DOC=$(curl -sf "http://localhost:9200/${INDEX_ALIAS}/_search?size=1&_source=thumbnail.file,source.file" 2>/dev/null || echo "")

  THUMB_BUCKET=""
  IMAGE_BUCKET=""

  if [ -n "$SAMPLE_DOC" ]; then
    # Extract bucket name from thumbnail URL:
    # http://BUCKET.s3.amazonaws.com/... → BUCKET
    THUMB_BUCKET=$(echo "$SAMPLE_DOC" | python3 -c "
import json, sys, re
try:
    data = json.load(sys.stdin)
    hits = data.get('hits', {}).get('hits', [])
    for hit in hits:
        src = hit.get('_source', {})
        thumb_url = src.get('thumbnail', {}).get('file', '')
        if thumb_url:
            m = re.match(r'https?://([^.]+)\.s3', thumb_url)
            if m:
                print(m.group(1))
                sys.exit(0)
except: pass
print('')
" 2>/dev/null || echo "")

    IMAGE_BUCKET=$(echo "$SAMPLE_DOC" | python3 -c "
import json, sys, re
try:
    data = json.load(sys.stdin)
    hits = data.get('hits', {}).get('hits', [])
    for hit in hits:
        src = hit.get('_source', {})
        img_url = src.get('source', {}).get('file', '')
        if img_url:
            m = re.match(r'https?://([^.]+)\.s3', img_url)
            if m:
                print(m.group(1))
                sys.exit(0)
except: pass
print('')
" 2>/dev/null || echo "")
  fi

  S3_PROXY_PORT="${S3_PROXY_PORT:-3001}"

  if [ -n "$THUMB_BUCKET" ]; then
    echo -e "${green}      Thumb bucket: ${THUMB_BUCKET} ✓${plain}"
    if [ -n "$IMAGE_BUCKET" ]; then
      echo -e "${green}      Image bucket: ${IMAGE_BUCKET} ✓${plain}"
    fi

    export KUPUA_THUMB_BUCKET="$THUMB_BUCKET"
    export KUPUA_IMAGE_BUCKET="$IMAGE_BUCKET"
    export S3_PROXY_PORT
    export VITE_S3_PROXY_ENABLED="true"

    echo
    echo -e "${yellow}[4/6] Starting S3 thumbnail proxy (port ${S3_PROXY_PORT})...${plain}"

    # Kill any existing S3 proxy on this port
    lsof -ti:${S3_PROXY_PORT} | xargs kill 2>/dev/null || true

    cd "$KUPUA_DIR"
    node scripts/s3-proxy.mjs &
    S3_PROXY_PID=$!
    sleep 1

    # Check it started successfully
    if kill -0 $S3_PROXY_PID 2>/dev/null; then
      echo -e "${green}      S3 proxy started (PID ${S3_PROXY_PID}) ✓${plain}"
    else
      echo -e "${red}      S3 proxy failed to start. Thumbnails will not be available.${plain}"
      export VITE_S3_PROXY_ENABLED="false"
    fi

    # Ensure the proxy is killed when this script exits
    trap "kill $S3_PROXY_PID 2>/dev/null" EXIT
  else
    echo -e "${yellow}      Could not discover bucket names. Thumbnails disabled.${plain}"
    export VITE_S3_PROXY_ENABLED="false"
  fi
  echo

  # --- 5. Start imgproxy container for full-size images ---
  if [ -n "$IMAGE_BUCKET" ]; then
    echo -e "${yellow}[5/6] Starting imgproxy container (port 3002)...${plain}"
    export VITE_IMGPROXY_ENABLED="true"
    export VITE_IMAGE_BUCKET="$IMAGE_BUCKET"

    # Generate a minimal AWS config file declaring the media-service profile.
    # Janus writes credentials to ~/.aws/credentials under [media-service],
    # but the Go AWS SDK (used by imgproxy) also needs a matching
    # [profile media-service] entry in the config file to resolve the
    # profile.  This file contains NO secrets — just the profile name
    # and region.  The actual credentials are volume-mounted separately.
    cat > /tmp/kupua-aws-config <<EOF
[profile media-service]
region = eu-west-1
EOF

    cd "$KUPUA_DIR"
    if ! docker compose --profile imgproxy up -d imgproxy 2>&1; then
      echo -e "${red}      docker compose failed — trying fresh recreate...${plain}"
      docker compose --profile imgproxy down 2>/dev/null || true
      docker compose --profile imgproxy up -d imgproxy 2>&1
    fi

    # Wait briefly and check it's running
    sleep 2
    if curl -sf "http://127.0.0.1:3002/health" > /dev/null 2>&1; then
      echo -e "${green}      imgproxy started ✓${plain}"
    else
      echo -e "${red}      imgproxy may not be ready yet (will retry on first request)${plain}"
    fi
  else
    echo -e "${yellow}[5/6] Skipping imgproxy (image bucket not discovered)${plain}"
    export VITE_IMGPROXY_ENABLED="false"
  fi
  echo

  # --- 6. Install dependencies + start ---
  if [ "$SKIP_INSTALL" = false ]; then
    echo -e "${yellow}[6/6] Checking dependencies...${plain}"
    cd "$KUPUA_DIR"
    needs_install=false
    if [ ! -d "node_modules" ]; then
      needs_install=true
    elif [ "package.json" -nt "node_modules/.package-lock.json" ] 2>/dev/null; then
      needs_install=true
    elif [ ! -d "node_modules/vite" ] || [ ! -d "node_modules/react" ] || [ ! -d "node_modules/vitest" ]; then
      needs_install=true
    fi
    if [ "$needs_install" = true ]; then
      echo -e "${yellow}      Installing npm dependencies...${plain}"
      npm install
      echo -e "${green}      Dependencies installed ✓${plain}"
    else
      echo -e "${green}      Dependencies up to date ✓${plain}"
    fi
  else
    echo -e "${yellow}[6/6] Skipping dependency check (--skip-install)${plain}"
  fi
  echo

  echo -e "${yellow}Starting Vite dev server (TEST mode)...${plain}"
  echo -e "${cyan}      → http://localhost:3000${plain}"
  echo -e "${yellow}      → ES: ${KUPUA_ES_URL} / index: ${VITE_ES_INDEX}${plain}"
  echo -e "${yellow}      → Write protection: ON${plain}"
  if [ "$VITE_S3_PROXY_ENABLED" = "true" ]; then
    echo -e "${yellow}      → Thumbnails: ON (S3 proxy on port ${S3_PROXY_PORT})${plain}"
  else
    echo -e "${yellow}      → Thumbnails: OFF${plain}"
  fi
  if [ "$VITE_IMGPROXY_ENABLED" = "true" ]; then
    echo -e "${yellow}      → Full images: ON (imgproxy on port 3002)${plain}"
  else
    echo -e "${yellow}      → Full images: OFF${plain}"
  fi
  echo
  cd "$KUPUA_DIR"
  exec npm run dev

fi

# ---------------------------------------------------------------------------
# Mode: local (default — mock data on docker ES port 9220)
# ---------------------------------------------------------------------------
echo -e "${cyan}╔══════════════════════════════════════╗${plain}"
echo -e "${cyan}║      Starting Kupua (local mode)     ║${plain}"
echo -e "${cyan}╚══════════════════════════════════════╝${plain}"
echo

ES_URL="${KUPUA_ES_URL:-http://localhost:9220}"

# Kill any existing SSH tunnel to TEST ES — avoid port confusion
# (Mirrors Grid's dev/script/start.sh behaviour in non-TEST mode)
EXISTING_TUNNELS=$(ps -ef | grep ssh | grep 9200 | grep -v grep || true)
if [[ $EXISTING_TUNNELS ]]; then
  echo -e "${yellow}Killing existing SSH tunnel to TEST ES (port 9200)${plain}"
  # shellcheck disable=SC2046
  kill $(echo $EXISTING_TUNNELS | awk '{print $2}') 2>/dev/null || true
fi

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
  needs_install=false
  if [ ! -d "node_modules" ]; then
    needs_install=true
  elif [ "package.json" -nt "node_modules/.package-lock.json" ] 2>/dev/null; then
    needs_install=true
  elif [ ! -d "node_modules/vite" ] || [ ! -d "node_modules/react" ] || [ ! -d "node_modules/vitest" ]; then
    needs_install=true
  fi
  if [ "$needs_install" = true ]; then
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

