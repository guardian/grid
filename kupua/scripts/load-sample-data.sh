#!/usr/bin/env bash
#
# Load sample data into Kupua's local Elasticsearch.
#
# Prerequisites:
#   - Kupua ES must be running: cd kupua && docker compose up -d
#   - Sample data file must exist: kupua/exploration/mock/sample-data.ndjson
#   - Mapping file from real ES cluster must exist: kupua/exploration/mock/mapping.json
#
# Usage:
#   ./kupua/scripts/load-sample-data.sh
#
# This script:
#   1. Waits for ES to be healthy
#   2. Creates the index with the correct mapping
#   3. Bulk-loads the sample data
#   4. Verifies the document count

set -euo pipefail

green='\033[0;32m'
red='\033[0;31m'
yellow='\033[0;33m'
plain='\033[0m'

# --- Configuration ---
ES_URL="${KUPUA_ES_URL:-http://localhost:9220}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KUPUA_DIR="${SCRIPT_DIR}/.."
MAPPING_FILE="${KUPUA_DIR}/exploration/mock/mapping.json"
DATA_FILE="${KUPUA_DIR}/exploration/mock/sample-data.ndjson"
INDEX_NAME="images"

# --- Safety guard: never write to non-local ES ---
# Port 9220 = kupua's own docker ES (safe to write)
# Port 9200 = Grid's ES or SSH tunnel to TEST/PROD (NEVER write)
if echo "$ES_URL" | grep -qv ':9220'; then
  echo -e "${red}SAFETY: Refusing to load data into ${ES_URL}${plain}"
  echo "  This script only writes to kupua's local ES on port 9220."
  echo "  It looks like you're pointing at a different ES instance"
  echo "  (possibly a TEST tunnel on port 9200)."
  echo ""
  echo "  If you really need to override this, edit the script."
  echo "  See kupua/exploration/docs/infra-safeguards.md for details."
  exit 1
fi

# --- Preflight checks ---
if [ ! -f "$MAPPING_FILE" ]; then
  echo -e "${red}ERROR: Mapping file not found at ${MAPPING_FILE}${plain}"
  echo "  Make sure kupua/exploration/mock/mapping.json exists."
  exit 1
fi

if [ ! -f "$DATA_FILE" ]; then
  echo -e "${red}ERROR: Sample data file not found at ${DATA_FILE}${plain}"
  echo "  Make sure kupua/exploration/mock/sample-data.ndjson exists."
  exit 1
fi

# --- Wait for ES ---
echo -e "${yellow}Waiting for Elasticsearch at ${ES_URL}...${plain}"
max_retries=30
retry=0
until curl -sf "${ES_URL}/_cluster/health" > /dev/null 2>&1; do
  retry=$((retry + 1))
  if [ $retry -ge $max_retries ]; then
    echo -e "${red}ERROR: Elasticsearch not available after ${max_retries} attempts.${plain}"
    echo "  Is kupua's docker compose running? Try: cd kupua && docker compose up -d"
    exit 1
  fi
  echo "  Waiting... (attempt ${retry}/${max_retries})"
  sleep 2
done
echo -e "${green}Elasticsearch is up!${plain}"

# --- Wait for shards to be ready (yellow = primaries allocated) ---
# After container restart, _cluster/health responds before shard recovery finishes.
# _count / _search will fail with 503 until at least yellow status.
retry=0
until curl -sf "${ES_URL}/_cluster/health?wait_for_status=yellow&timeout=2s" > /dev/null 2>&1; do
  retry=$((retry + 1))
  if [ $retry -ge 15 ]; then
    echo -e "${yellow}  Warning: cluster not yet yellow after 30s — proceeding anyway${plain}"
    break
  fi
  printf "  Waiting for shard recovery... (%d/15)\r" "$retry"
  sleep 2
done

# --- Check if index already exists ---
if curl -sf "${ES_URL}/${INDEX_NAME}" > /dev/null 2>&1; then
  DOC_COUNT=$(curl -sf "${ES_URL}/${INDEX_NAME}/_count" | python3 -c "import sys,json; d=sys.stdin.read().strip(); print(json.loads(d)['count'] if d else 0)" 2>/dev/null || echo "0")
  echo -e "${yellow}Index '${INDEX_NAME}' already exists with ${DOC_COUNT} documents.${plain}"
  read -p "  Delete and recreate? [y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "  Deleting index..."
    curl -sf -X DELETE "${ES_URL}/${INDEX_NAME}" > /dev/null
    echo -e "${green}  Deleted.${plain}"
  else
    echo "  Keeping existing index. Exiting."
    exit 0
  fi
fi

# --- Extract mapping and settings from the dump ---
# The mapping.json from ES has the format: {"index_name": {"mappings": {...}}}
# We need to extract just the mappings object and wrap it for index creation.
echo -e "${yellow}Creating index '${INDEX_NAME}' with mapping...${plain}"

# Extract the mappings from the first (only) key in the JSON
MAPPINGS_BODY=$(python3 -c "
import json, sys

with open('${MAPPING_FILE}') as f:
    data = json.load(f)

# Get the first (only) index name's mappings
index_name = list(data.keys())[0]
mappings = data[index_name]['mappings']

# Build the index creation body with settings for the custom analyzer
body = {
    'settings': {
        'analysis': {
            'analyzer': {
                'english_s_stemmer': {
                    'tokenizer': 'standard',
                    'filter': ['lowercase', 'english_s_stemmer']
                },
                'hierarchyAnalyzer': {
                    'tokenizer': 'hierarchy_tokenizer'
                }
            },
            'filter': {
                'english_s_stemmer': {
                    'type': 'stemmer',
                    'name': 'minimal_english'
                }
            },
            'tokenizer': {
                'hierarchy_tokenizer': {
                    'type': 'path_hierarchy',
                    'delimiter': '/'
                }
            }
        },
        'index': {
            'mapping.total_fields.limit': 2147483647,
            # Lower max_result_window so e2e tests exercise the deep seek path
            # (percentile estimation + search_after + countBefore) with only 10k docs.
            # Default ES value is 10000; with 500 any scrub past position ~500
            # must use the deep path — covering ~95% of the 10k dataset.
            'max_result_window': 500
        }
    },
    'mappings': mappings
}

print(json.dumps(body))
")

# Create the index
RESPONSE=$(curl -sf -X PUT "${ES_URL}/${INDEX_NAME}" \
  -H "Content-Type: application/json" \
  -d "${MAPPINGS_BODY}" 2>&1) || {
    echo -e "${red}ERROR: Failed to create index.${plain}"
    echo "  Response: ${RESPONSE}"
    exit 1
  }

echo -e "${green}Index created successfully.${plain}"

# --- Transform and bulk load data ---
echo -e "${yellow}Transforming and bulk loading sample data (this may take a minute)...${plain}"
DATA_SIZE=$(ls -lh "${DATA_FILE}" | awk '{print $5}')
echo "  File size: ${DATA_SIZE}"

TOTAL_DOCS=$(wc -l < "${DATA_FILE}" | tr -d ' ')
echo "  Total documents: ${TOTAL_DOCS}"

# The sample data is in ES search-dump format (one JSON hit per line):
#   {"_index": "...", "_id": "...", "_source": {...}}
# We need to convert to bulk API format (two lines per doc):
#   {"index": {"_id": "..."}}
#   {source document}

TEMP_DIR=$(mktemp -d)
trap "rm -rf ${TEMP_DIR}" EXIT
BULK_FILE="${TEMP_DIR}/bulk.ndjson"

echo "  Converting to bulk format..."
python3 -c "
import json, sys

with open('${DATA_FILE}') as infile, open('${BULK_FILE}', 'w') as outfile:
    count = 0
    for line in infile:
        line = line.strip()
        if not line:
            continue
        hit = json.loads(line)
        doc_id = hit['_id']
        source = hit['_source']
        # Write action line
        outfile.write(json.dumps({'index': {'_id': doc_id}}) + '\n')
        # Write document line
        outfile.write(json.dumps(source) + '\n')
        count += 1
    print(f'  Converted {count} documents')
"

# Split into chunks of 1000 docs (2000 lines) to stay well under ES request size limits
CHUNK_LINES=2000
split -l ${CHUNK_LINES} "${BULK_FILE}" "${TEMP_DIR}/chunk_"

CHUNK_NUM=0
TOTAL_CHUNKS=$(ls "${TEMP_DIR}"/chunk_* | wc -l | tr -d ' ')

for CHUNK_FILE in "${TEMP_DIR}"/chunk_*; do
  CHUNK_NUM=$((CHUNK_NUM + 1))
  CHUNK_DOC_COUNT=$(($(wc -l < "${CHUNK_FILE}" | tr -d ' ') / 2))

  printf "  Chunk %d/%d (%d docs)... " "${CHUNK_NUM}" "${TOTAL_CHUNKS}" "${CHUNK_DOC_COUNT}"

  RESULT=$(curl -sf -X POST "${ES_URL}/${INDEX_NAME}/_bulk" \
    -H "Content-Type: application/x-ndjson" \
    --data-binary @"${CHUNK_FILE}" 2>&1)

  # Check for errors in the bulk response
  HAS_ERRORS=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('errors', False))" 2>/dev/null || echo "true")

  if [ "${HAS_ERRORS}" = "True" ] || [ "${HAS_ERRORS}" = "true" ]; then
    ERROR_COUNT=$(echo "${RESULT}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
errors = [item for item in data.get('items', []) if 'error' in item.get('index', item.get('create', {}))]
print(len(errors))
" 2>/dev/null || echo "unknown")
    echo -e "${yellow}done (${ERROR_COUNT} errors)${plain}"
  else
    echo -e "${green}done${plain}"
  fi
done

# --- Refresh and verify ---
echo -e "${yellow}Refreshing index...${plain}"
curl -sf -X POST "${ES_URL}/${INDEX_NAME}/_refresh" > /dev/null

FINAL_COUNT=$(curl -sf "${ES_URL}/${INDEX_NAME}/_count" | python3 -c "import sys,json; d=sys.stdin.read().strip(); print(json.loads(d)['count'] if d else '?')" 2>/dev/null || echo "?")
echo ""
echo -e "${green}========================================${plain}"
echo -e "${green}  Done! Loaded ${FINAL_COUNT} documents into '${INDEX_NAME}'${plain}"
echo -e "${green}  ES URL: ${ES_URL}/${INDEX_NAME}${plain}"
echo -e "${green}========================================${plain}"
echo ""
echo "  Test query:"
echo "    curl -s '${ES_URL}/${INDEX_NAME}/_search?size=1&pretty' | head -30"

