#!/usr/bin/env bash
# Requires bash 4.3+ (namerefs, associative arrays). macOS: `brew install bash`.
#
# Benchmark imgproxy encoding: WebP vs AVIF vs JXL
#
# Compares wall-clock latency and output file size for each format using
# imgproxy's own default quality per format (WebP 79, AVIF 63, JXL 77).
# These are supposedly perceptually normalised — so comparison is fair.
#
# JPEG is excluded: no alpha channel support, so PNGs/TIFFs with
# transparency would be broken. WebP, AVIF, and JXL all support alpha.
#
# Image selection: curates a diverse set by megapixel range:
#   - Tiny     (< 2MP):   small web graphics, below fit size
#   - Normal   (2-25MP):  standard editorial photos (the 90% case)
#   - Large    (25-100MP): press panoramas, hi-res scans
#   - Monster  (> 100MP): extreme outliers (reported separately)
#   - PNG/TIFF: at least one transparent-capable source if available
#
# Usage:
#   ./kupua/scripts/bench-formats.sh                     # default curated set
#   ./kupua/scripts/bench-formats.sh --no-monster         # skip the 500MP beast
#   ./kupua/scripts/bench-formats.sh --save               # save images for visual inspection
#   ./kupua/scripts/bench-formats.sh --label-imgproxy     # add #imgproxy labelled images (curated test corpus)
#
# Prerequisites:
#   - imgproxy running on port 3002 (start.sh --use-TEST)
#   - ES accessible on port 9200 (SSH tunnel) or 9220 (local)
#   - curl, jq, python3
#
# What it measures:
#   Wall-clock time (curl total_time) for each request. This includes S3
#   download + decode + resize + encode + response transfer. Since all
#   three formats share the same S3 download + decode + resize steps,
#   the difference is almost entirely encode time + output transfer.
#
# Caching:
#   imgproxy OSS has NO output cache — every request is a full pipeline.
#   libvips internal cache is also disabled (vips_cache_set_max(0)).
#   We add a cache-bust query param to prevent any HTTP-level caching.
#   First request per image is a warmup (S3 download + decode) that we
#   discard; subsequent format requests benefit from OS-level disk cache
#   for the S3 source. This isolates the encode step more cleanly.
#
set -euo pipefail

IMGPROXY_URL="http://localhost:3002"
ES_URL="http://localhost:9200"
SKIP_MONSTER=false
SAVE_IMAGES=false
SAVE_DIR=""
LABEL_IMGPROXY=false

# Match perf experiments viewport: 1987×1110 CSS px, DPR 1.25.
# DPR 1.25 ≤ 1.3 → detectDpr() returns multiplier 1 → no DPR scaling.
# So fullscreen image requests are fit:1987:1110 — that's what we test.
FIT_W=1987
FIT_H=1110

# Corpus pinning — same date as perf experiments and e2e-perf STABLE_UNTIL.
# Ensures the image set is identical between runs (new uploads won't change it).
STABLE_UNTIL="2026-02-15T00:00:00.000Z"

# Parse args
for arg in "$@"; do
  case "$arg" in
    --no-monster) SKIP_MONSTER=true ;;
    --save) SAVE_IMAGES=true ;;
    --label-imgproxy) LABEL_IMGPROXY=true ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

if [[ "$SAVE_IMAGES" == "true" ]]; then
  SAVE_DIR="/tmp/kupua-bench-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$SAVE_DIR"
fi

# ── Read imgproxy config from Docker container ───────────────────────
# These are used in filenames so you can see at a glance what settings produced each image.
IMGPROXY_CFG_WEBP_Q="79"   # defaults
IMGPROXY_CFG_AVIF_Q="63"
IMGPROXY_CFG_JXL_Q="77"
IMGPROXY_CFG_WEBP_EFFORT="4"
IMGPROXY_CFG_AVIF_SPEED="8"
IMGPROXY_CFG_JXL_EFFORT="4"

if docker inspect kupua-imgproxy >/dev/null 2>&1; then
  # Read only IMGPROXY_* env vars — exclude AWS credentials and other noise.
  _env=$(docker inspect kupua-imgproxy --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | grep '^IMGPROXY_' || true)
  _read_env() { echo "$_env" | grep "^$1=" | head -1 | cut -d= -f2 || true; }
  # FORMAT_QUALITY overrides per-format defaults: "webp=70,avif=50,jxl=60"
  _fq=$(_read_env IMGPROXY_FORMAT_QUALITY)
  if [[ -n "$_fq" ]]; then
    for _pair in ${_fq//,/ }; do
      _k="${_pair%%=*}"; _v="${_pair##*=}"
      case "$_k" in
        webp) IMGPROXY_CFG_WEBP_Q="$_v" ;;
        avif) IMGPROXY_CFG_AVIF_Q="$_v" ;;
        jxl)  IMGPROXY_CFG_JXL_Q="$_v" ;;
      esac
    done
  fi
  _v=$(_read_env IMGPROXY_WEBP_EFFORT);  [[ -n "$_v" ]] && IMGPROXY_CFG_WEBP_EFFORT="$_v"
  _v=$(_read_env IMGPROXY_AVIF_SPEED);   [[ -n "$_v" ]] && IMGPROXY_CFG_AVIF_SPEED="$_v"
  _v=$(_read_env IMGPROXY_JXL_EFFORT);   [[ -n "$_v" ]] && IMGPROXY_CFG_JXL_EFFORT="$_v"
fi

# Build per-format config strings for filenames: "q79e4" etc.
declare -A FMT_TAG
FMT_TAG[webp]="q${IMGPROXY_CFG_WEBP_Q}e${IMGPROXY_CFG_WEBP_EFFORT}"
FMT_TAG[avif]="q${IMGPROXY_CFG_AVIF_Q}s${IMGPROXY_CFG_AVIF_SPEED}"
FMT_TAG[jxl]="q${IMGPROXY_CFG_JXL_Q}e${IMGPROXY_CFG_JXL_EFFORT}"

# Colours
green=$'\033[0;32m'
yellow=$'\033[0;33m'
red=$'\033[0;31m'
cyan=$'\033[0;36m'
dim=$'\033[0;37m'
bold=$'\033[1m'
plain=$'\033[0m'

# ── Connect to ES ────────────────────────────────────────────────────
echo "${bold}Connecting to ES...${plain}"

if curl -sf "$ES_URL/_cluster/health" >/dev/null 2>&1; then
  true
else
  ES_URL="http://localhost:9220"
  if ! curl -sf "$ES_URL/_cluster/health" >/dev/null 2>&1; then
    echo "${red}Error: No ES available on port 9200 or 9220${plain}"
    exit 1
  fi
fi

# Find the images index — same discovery as start.sh:
# On TEST: look up "Images_Current" alias → physical index name
# On local: use "images" directly
INDEX=$(curl -sf "$ES_URL/_cat/aliases?format=json" 2>/dev/null | python3 -c "
import json, sys
try:
    aliases = json.load(sys.stdin)
    # Prefer Images_Current alias (TEST ES)
    for a in aliases:
        if a['alias'].lower() == 'images_current':
            print(a['index']); sys.exit(0)
    # Fall back to any images-like alias
    for a in aliases:
        if a['alias'].lower().startswith('images'):
            print(a['index']); sys.exit(0)
except: pass
print('')
" 2>/dev/null)
if [ -z "$INDEX" ]; then
  INDEX="images"
fi

TOTAL_DOCS=$(curl -sf "$ES_URL/$INDEX/_count" | jq '.count')
echo "  ES: $ES_URL  Index: $INDEX  Docs: $TOTAL_DOCS"

# Discover bucket name
SAMPLE_DOC=$(curl -sf "$ES_URL/$INDEX/_search?size=1" | jq -r '.hits.hits[0]._source')
IMAGE_BUCKET=$(echo "$SAMPLE_DOC" | python3 -c "
import sys, json
doc = json.load(sys.stdin)
url = doc.get('source', {}).get('file', '') or ''
if url.startswith('s3://'):
    print(url.split('/')[2])
elif 'amazonaws.com' in url:
    import urllib.parse
    parsed = urllib.parse.urlparse(url)
    print(parsed.hostname.split('.')[0])
else:
    print('')
" 2>/dev/null)

if [ -z "$IMAGE_BUCKET" ]; then
  echo "${red}Error: Could not discover image bucket from ES${plain}"
  exit 1
fi
echo "  Bucket: $IMAGE_BUCKET"

# ── Verify imgproxy ──────────────────────────────────────────────────
if ! curl -sf "$IMGPROXY_URL/health" >/dev/null 2>&1; then
  echo "${red}Error: imgproxy not responding on $IMGPROXY_URL${plain}"
  echo "  Start it with: ./kupua/scripts/start.sh --use-TEST"
  exit 1
fi
echo "  imgproxy: $IMGPROXY_URL ✓"
echo

# ── Curate diverse image set ─────────────────────────────────────────
echo "${bold}Curating test images...${plain}"

# Collect images into arrays
ALL_IDS=()
ALL_WIDTHS=()
ALL_HEIGHTS=()
ALL_MIMES=()
ALL_LABELS=()
MONSTER_IDS=()
MONSTER_WIDTHS=()
MONSTER_HEIGHTS=()
MONSTER_MIMES=()

add_from_json() {
  local json="$1"
  local label="$2"
  local is_monster="${3:-false}"

  local count
  count=$(echo "$json" | jq '.hits.hits | length')

  for ((k=0; k<count; k++)); do
    local id w h mime
    id=$(echo "$json" | jq -r ".hits.hits[$k]._source.id")
    w=$(echo "$json" | jq -r ".hits.hits[$k]._source.source.dimensions.width // \"?\"")
    h=$(echo "$json" | jq -r ".hits.hits[$k]._source.source.dimensions.height // \"?\"")
    mime=$(echo "$json" | jq -r ".hits.hits[$k]._source.source.mimeType // \"?\"")

    if [ "$is_monster" = "true" ]; then
      MONSTER_IDS+=("$id")
      MONSTER_WIDTHS+=("$w")
      MONSTER_HEIGHTS+=("$h")
      MONSTER_MIMES+=("$mime")
    else
      ALL_IDS+=("$id")
      ALL_WIDTHS+=("$w")
      ALL_HEIGHTS+=("$h")
      ALL_MIMES+=("$mime")
      ALL_LABELS+=("$label")
    fi

    local mp
    mp=$(python3 -c "
w, h = int('$w') if '$w' != '?' else 0, int('$h') if '$h' != '?' else 0
print(f'{w*h/1e6:.1f}MP') if w > 0 else print('?')
" 2>/dev/null)
    echo "  ${dim}${label}:${plain} ${id:0:12}… ${w}×${h} (${mp}) ${dim}${mime}${plain}"
  done
}

# Helper: fetch images in a width range
fetch_by_width() {
  local min_w="$1"
  local max_w="$2"
  local count="$3"
  local extra="${4:-}"

  local must_clauses="
    { \"exists\": { \"field\": \"source.dimensions.width\" } },
    { \"range\": { \"source.dimensions.width\": { \"gte\": $min_w, \"lt\": $max_w } } },
    { \"range\": { \"uploadTime\": { \"lte\": \"$STABLE_UNTIL\" } } }
  "
  if [ -n "$extra" ]; then
    must_clauses="$must_clauses, $extra"
  fi

  # Sort by id (deterministic) — not uploadTime (unstable if new images are
  # ingested with backdated timestamps). Same image set every run.
  curl -sf "$ES_URL/$INDEX/_search" -H 'Content-Type: application/json' -d "{
    \"size\": $count,
    \"_source\": [\"id\", \"source.dimensions.width\", \"source.dimensions.height\", \"source.mimeType\"],
    \"query\": { \"bool\": { \"must\": [ $must_clauses ] } },
    \"sort\": [{ \"id\": \"asc\" }]
  }" 2>/dev/null
}

# Tiny: width 800-1700 (~0.5-2MP)
echo "${cyan}Tiny (< 2MP)...${plain}"
TINY_JSON=$(fetch_by_width 800 1700 2)
add_from_json "$TINY_JSON" "tiny"

# Normal: width 1700-6100 (~2-25MP)
echo "${cyan}Normal (2-25MP)...${plain}"
NORMAL_JSON=$(fetch_by_width 1700 6100 4)
add_from_json "$NORMAL_JSON" "normal"

# Large: width 6100-12200 (~25-100MP)
echo "${cyan}Large (25-100MP)...${plain}"
LARGE_JSON=$(fetch_by_width 6100 12200 2)
add_from_json "$LARGE_JSON" "large"

# PNG — at least one, for alpha channel coverage
echo "${cyan}PNG (for alpha channel test)...${plain}"
PNG_JSON=$(curl -sf "$ES_URL/$INDEX/_search" -H 'Content-Type: application/json' -d "{
  \"size\": 1,
  \"_source\": [\"id\", \"source.dimensions.width\", \"source.dimensions.height\", \"source.mimeType\"],
  \"query\": {
    \"bool\": {
      \"must\": [
        { \"exists\": { \"field\": \"source.dimensions.width\" } },
        { \"term\": { \"source.mimeType\": \"image/png\" } },
        { \"range\": { \"uploadTime\": { \"lte\": \"$STABLE_UNTIL\" } } }
      ]
    }
  },
  \"sort\": [{ \"id\": \"asc\" }]
}" 2>/dev/null)
PNG_FOUND=$(echo "$PNG_JSON" | jq '.hits.total.value')
if [ "$PNG_FOUND" -gt 0 ]; then
  add_from_json "$PNG_JSON" "png"
else
  echo "  ${dim}(no PNGs found — all formats still support alpha, just can't test it)${plain}"
fi

# #imgproxy label — curated test corpus for visual quality assessment
if [[ "$LABEL_IMGPROXY" == "true" ]]; then
  echo "${cyan}#imgproxy label (curated test corpus)...${plain}"
  LABEL_JSON=$(curl -sf "$ES_URL/$INDEX/_search" -H 'Content-Type: application/json' -d "{
    \"size\": 50,
    \"_source\": [\"id\", \"source.dimensions.width\", \"source.dimensions.height\", \"source.mimeType\"],
    \"query\": {
      \"bool\": {
        \"must\": [
          { \"exists\": { \"field\": \"source.dimensions.width\" } },
          { \"term\": { \"userMetadata.labels\": \"imgproxy\" } }
        ]
      }
    },
    \"sort\": [{ \"id\": \"asc\" }]
  }" 2>/dev/null)
  LABEL_COUNT=$(echo "$LABEL_JSON" | jq '.hits.hits | length')
  if [[ "$LABEL_COUNT" -gt 0 ]]; then
    add_from_json "$LABEL_JSON" "#imgproxy"
  else
    echo "  ${dim}(no images with #imgproxy label found)${plain}"
  fi
fi

# Monster: width > 12200 (~100MP+)
if [ "$SKIP_MONSTER" = "false" ]; then
  echo "${cyan}Monster (> 100MP)...${plain}"
  MONSTER_JSON=$(fetch_by_width 12200 999999 1)
  MONSTER_FOUND=$(echo "$MONSTER_JSON" | jq '.hits.hits | length')
  if [ "$MONSTER_FOUND" -gt 0 ]; then
    add_from_json "$MONSTER_JSON" "monster" "true"
  else
    echo "  ${dim}(no monsters found)${plain}"
  fi
fi

echo
echo "  ${bold}Test set: ${#ALL_IDS[@]} normal + ${#MONSTER_IDS[@]} monster(s)${plain}"
echo

if [ ${#ALL_IDS[@]} -eq 0 ]; then
  echo "${red}Error: No images found${plain}"
  exit 1
fi

# ── Helpers ──────────────────────────────────────────────────────────
id_to_s3key() {
  local id="$1"
  echo "${id:0:1}/${id:1:1}/${id:2:1}/${id:3:1}/${id:4:1}/${id:5:1}/$id"
}

bench_one() {
  local s3_key="$1"
  local format="$2"
  local bust="$3"
  local save_path="${4:-/dev/null}"

  local url="$IMGPROXY_URL/insecure/rs:fit:${FIT_W}:${FIT_H}/plain/s3://${IMAGE_BUCKET}/${s3_key}@${format}?_bust=${bust}"

  local result
  result=$(curl -s -o "$save_path" -w '%{time_total} %{size_download} %{http_code}' \
    -H 'Cache-Control: no-cache' \
    "$url")

  local time_s size_bytes http_code
  time_s=$(echo "$result" | awk '{print $1}')
  size_bytes=$(echo "$result" | awk '{print $2}')
  http_code=$(echo "$result" | awk '{print $3}')

  local time_ms
  time_ms=$(python3 -c "print(int(float('$time_s') * 1000))")

  echo "$time_ms $size_bytes $http_code"
}

# ── Benchmark runner ─────────────────────────────────────────────────
FORMATS=(webp avif jxl)
FORMAT_LABELS=(WebP AVIF JXL)

bench_set() {
  local -n ids_ref=$1 widths_ref=$2 heights_ref=$3 mimes_ref=$4

  declare -A T S C
  for fmt in "${FORMATS[@]}"; do T[$fmt]=0; S[$fmt]=0; C[$fmt]=0; done

  for i in "${!ids_ref[@]}"; do
    local id="${ids_ref[$i]}" w="${widths_ref[$i]}" h="${heights_ref[$i]}" mime="${mimes_ref[$i]}"
    local s3_key mp
    s3_key=$(id_to_s3key "$id")
    mp=$(python3 -c "print(f'{int(\"$w\")*int(\"$h\")/1e6:.1f}MP')" 2>/dev/null || echo "?")
    echo "${cyan}  ${id:0:12}… (${w}×${h}, ${mp}, ${mime})${plain}"

    # Warmup
    bench_one "$s3_key" "webp" "warmup-$(date +%s%N)" >/dev/null

    for j in "${!FORMATS[@]}"; do
      local fmt="${FORMATS[$j]}" label="${FORMAT_LABELS[$j]}"
      local time_ms size_bytes http_code
      local save_path="/dev/null"
      local save_tmp=""
      if [[ "$SAVE_IMAGES" == "true" && -n "$SAVE_DIR" ]]; then
        save_tmp="${SAVE_DIR}/.tmp_${id:0:12}.${fmt}"
        save_path="$save_tmp"
      fi
      read -r time_ms size_bytes http_code <<< "$(bench_one "$s3_key" "$fmt" "bench-${fmt}-$(date +%s%N)" "$save_path")"

      if [[ "$http_code" != "200" ]]; then
        echo "    ${label}: ${yellow}HTTP ${http_code}${plain}"
        [[ -f "$save_tmp" ]] && rm -f "$save_tmp"
        continue
      fi

      # Rename saved file to include quality, effort, and timing
      if [[ -n "$save_tmp" && -f "$save_tmp" ]]; then
        local final_name="${SAVE_DIR}/${id:0:12}_${fmt}_${FMT_TAG[$fmt]}_${time_ms}ms.${fmt}"
        mv "$save_tmp" "$final_name"
      fi

      local size_kb
      size_kb=$(python3 -c "print(f'{$size_bytes/1024:.0f}')")
      echo "    ${label}: ${bold}${time_ms}ms${plain}  ${dim}${size_kb}KB${plain}"

      T[$fmt]=$(( ${T[$fmt]} + time_ms ))
      S[$fmt]=$(( ${S[$fmt]} + size_bytes ))
      C[$fmt]=$(( ${C[$fmt]} + 1 ))
    done
  done

  # Summary
  [[ "${C[webp]}" -eq 0 ]] && return

  echo
  printf "  ${bold}%-6s  %8s  %8s  %10s  %10s${plain}\n" "Format" "Avg ms" "Avg KB" "vs WebP ms" "vs WebP KB"
  echo "  ──────  ────────  ────────  ──────────  ──────────"

  local webp_avg_ms=0
  for j in "${!FORMATS[@]}"; do
    local fmt="${FORMATS[$j]}" label="${FORMAT_LABELS[$j]}" cnt="${C[$fmt]}"
    [[ "$cnt" -eq 0 ]] && printf "  %-6s  %8s  %8s\n" "$label" "n/a" "n/a" && continue

    local avg_ms=$(( ${T[$fmt]} / cnt ))
    local avg_kb
    avg_kb=$(python3 -c "print(f'{${S[$fmt]}/$cnt/1024:.0f}')")

    if [[ "$fmt" == "webp" ]]; then
      webp_avg_ms=$avg_ms
      printf "  %-6s  ${bold}%6dms  %6sKB${plain}  %10s  %10s\n" "$label" "$avg_ms" "$avg_kb" "baseline" "baseline"
    elif [[ "$webp_avg_ms" -gt 0 ]]; then
      local delta_ms=$((avg_ms - webp_avg_ms))
      local delta_pct size_delta
      delta_pct=$(python3 -c "print(f'{($delta_ms/$webp_avg_ms)*100:+.0f}%')")
      size_delta=$(python3 -c "
w=${S[webp]}/${C[webp]}/1024; t=${S[$fmt]}/$cnt/1024
print(f'{((t-w)/w)*100:+.0f}%')
")
      printf "  %-6s  ${bold}%6dms  %6sKB${plain}  %9s  %9s\n" "$label" "$avg_ms" "$avg_kb" "$delta_pct" "$size_delta"
    fi
  done
}

# ── Main ─────────────────────────────────────────────────────────────
echo "${bold}═══════════════════════════════════════════════════════════════════${plain}"
echo "${bold}  Format Encoding Benchmark — imgproxy default qualities${plain}"
echo "${bold}  WebP q${IMGPROXY_CFG_WEBP_Q}/e${IMGPROXY_CFG_WEBP_EFFORT} · AVIF q${IMGPROXY_CFG_AVIF_Q}/s${IMGPROXY_CFG_AVIF_SPEED} · JXL q${IMGPROXY_CFG_JXL_Q}/e${IMGPROXY_CFG_JXL_EFFORT} · fit ${FIT_W}×${FIT_H}${plain}"
echo "${bold}  (JPEG excluded — no alpha channel support)${plain}"
echo "${bold}  Corpus pinned: until ${STABLE_UNTIL}${plain}"
echo "${bold}═══════════════════════════════════════════════════════════════════${plain}"
echo

echo "${bold}── Main test set (${#ALL_IDS[@]} images: tiny + normal + large + PNG) ──${plain}"
bench_set ALL_IDS ALL_WIDTHS ALL_HEIGHTS ALL_MIMES
echo

if [ ${#MONSTER_IDS[@]} -gt 0 ]; then
  echo "${bold}── Monster (> 100MP — reported separately, dominates averages) ──${plain}"
  echo "${dim}  S3 download + decode is the bottleneck for these, not encoding.${plain}"
  bench_set MONSTER_IDS MONSTER_WIDTHS MONSTER_HEIGHTS MONSTER_MIMES
  echo
fi

echo "${bold}═══════════════════════════════════════════════════════════════════${plain}"
echo "${dim}Quality: WebP ${IMGPROXY_CFG_WEBP_Q}, AVIF ${IMGPROXY_CFG_AVIF_Q}, JXL ${IMGPROXY_CFG_JXL_Q} (read from container, or imgproxy defaults)${plain}"
echo "${dim}Effort:  WebP effort ${IMGPROXY_CFG_WEBP_EFFORT}/6, AVIF speed ${IMGPROXY_CFG_AVIF_SPEED}/9, JXL effort ${IMGPROXY_CFG_JXL_EFFORT}/9${plain}"
echo "${dim}Resize:  fit ${FIT_W}×${FIT_H} (matches perf experiments fullscreen viewport, DPR 1.25 → no scaling)${plain}"
echo "${dim}Corpus:  pinned to ${STABLE_UNTIL} (same as perf experiments STABLE_UNTIL)${plain}"
echo "${dim}Images:  sorted by id (deterministic — same set every run)${plain}"
echo "${dim}Cache:   none (each request is full S3→decode→resize→encode pipeline)${plain}"
echo "${dim}JPEG:    excluded (no alpha channel → breaks PNGs/TIFFs with transparency)${plain}"

if [[ "$SAVE_IMAGES" == "true" && -n "$SAVE_DIR" ]]; then
  file_count=$(find "$SAVE_DIR" -type f | wc -l | tr -d ' ')
  echo
  echo "${green}  Saved ${file_count} images to: ${SAVE_DIR}${plain}"
  echo "${dim}  open ${SAVE_DIR}${plain}"
  open "$SAVE_DIR" 2>/dev/null || true
fi

















