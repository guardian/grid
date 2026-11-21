#!/usr/bin/env zsh
# A1 — Direct-ES bytes + transport timing (no cookie, no patch, no recompile)
#
# Purpose: measure raw vs gzip bytes and wall-clock transport over the SSH tunnel
#          at four page sizes. Establishes the compression ratio and bandwidth model
#          that grounds the F1 analysis.
#
# Prereq:  dev/script/start.sh --use-TEST running (tunnel on localhost:9200).
# Run:     zsh kupua/exploration/docs/03\ Ce\ n\'est\ pas\ une\ pipe\ dream/media-api-work/phase-3-d3-searchafter-perf-deep-dive-F1-a1-direct-es.sh
# Output:  copy/paste the printed table into the measurements section of the companion doc.
# Safety:  read-only GET to localhost:9200 only. No cookies. No response bodies written to disk.

set -euo pipefail

TUNNEL_URL="http://localhost:9200"
INDEX="Images_Current"
REPS=7   # per timing variant; median used — odd number so median is a real sample

echo "Checking tunnel..."
if ! curl -s --max-time 3 "$TUNNEL_URL/_cat/aliases" | grep -q "Images_Current"; then
  echo "ERROR: cannot reach $TUNNEL_URL or Images_Current alias not found."
  echo "Make sure dev/script/start.sh --use-TEST is running."
  exit 1
fi
echo "Tunnel OK. Index: $INDEX"
echo ""
echo "Running A1 measurements ($REPS reps per timing variant, median reported)..."
echo ""
printf '%-6s  %-10s  %-10s  %-7s  %-12s  %-14s  %-14s\n' \
  "len" "rawKB" "gzKB" "ratio" "took_ms(med)" "tRaw_s(med)" "tGz_s(med)"
printf '%-6s  %-10s  %-10s  %-7s  %-12s  %-14s  %-14s\n' \
  "------" "----------" "----------" "-------" "------------" "--------------" "--------------"

for LEN in 1 50 200 500; do
  # Construct body without ! to avoid zsh history expansion issues
  BODY="{\"size\":${LEN},\"track_total_hits\":true,\"query\":{\"match_all\":{}}}"

  # --- bytes (single measurement — deterministic for a given index state) ---
  RAW_B=$(curl -s \
    -H 'Content-Type: application/json' \
    -d "$BODY" \
    "$TUNNEL_URL/$INDEX/_search" | wc -c | tr -d ' ')

  GZ_B=$(curl -s --compressed \
    -H 'Content-Type: application/json' \
    -d "$BODY" \
    -o /dev/null -w '%{size_download}' \
    "$TUNNEL_URL/$INDEX/_search")

  RATIO=$(python3 -c "print(round(${RAW_B}/max(${GZ_B},1),1))")

  # --- ES took: REPS reps, median (server-side only; gzip-independent) ---
  TOOK=$(for i in $(seq $REPS); do
    curl -s \
      -H 'Content-Type: application/json' \
      -d "$BODY" \
      "$TUNNEL_URL/$INDEX/_search" | \
      python3 -c 'import sys,json;print(json.load(sys.stdin)["took"])'
  done | sort -n | awk '{a[NR]=$1} END{print a[int(NR/2)]}')

  # --- wall-clock uncompressed: REPS reps, median ---
  T_RAW=$(for i in $(seq $REPS); do
    curl -s \
      -H 'Content-Type: application/json' \
      -d "$BODY" \
      -o /dev/null -w '%{time_total}\n' \
      "$TUNNEL_URL/$INDEX/_search"
  done | sort -n | awk '{a[NR]=$1} END{print a[int(NR/2)]}')

  # --- wall-clock gzip: REPS reps, median ---
  T_GZ=$(for i in $(seq $REPS); do
    curl -s --compressed \
      -H 'Content-Type: application/json' \
      -d "$BODY" \
      -o /dev/null -w '%{time_total}\n' \
      "$TUNNEL_URL/$INDEX/_search"
  done | sort -n | awk '{a[NR]=$1} END{print a[int(NR/2)]}')

  RAW_KB=$(python3 -c "print(round(${RAW_B}/1024,1))")
  GZ_KB=$(python3 -c "print(round(${GZ_B}/1024,1))")

  printf '%-6s  %-10s  %-10s  %-7s  %-12s  %-14s  %-14s\n' \
    "$LEN" "${RAW_KB}" "${GZ_KB}" "${RATIO}x" "$TOOK" "$T_RAW" "$T_GZ"
done

echo ""
echo "Done. Paste the table above into the measurements section of:"
echo "  phase-3-d3-searchafter-perf-deep-dive-F1-measurements.md"
