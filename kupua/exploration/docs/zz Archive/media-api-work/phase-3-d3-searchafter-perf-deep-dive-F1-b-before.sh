#!/usr/bin/env zsh
# B-before — TEST load generator, BEFORE the gzip patch.
#
# Generates clean, attributable load against TEST media-api and prints exact
# timestamps + lookup instructions for Kibana and CloudWatch.
#
# Prereq:  GRID_COOKIE_TEST env var set (session only):
#            export GRID_COOKIE_TEST='gutoolsAuth-assym=PASTE_TEST_VALUE_HERE'
#          Run from repo root.
#
# Run:     zsh kupua/exploration/docs/03\ Ce\ n\'est\ pas\ une\ pipe\ dream/media-api-work/phase-3-d3-searchafter-perf-deep-dive-F1-b-before.sh
# Safety:  read-only GET against TEST only. Bodies to /dev/null (signed URLs).

set -euo pipefail

if [[ -z "${GRID_COOKIE_TEST:-}" ]]; then
  echo "ERROR: GRID_COOKIE_TEST env var not set."
  echo "  export GRID_COOKIE_TEST='gutoolsAuth-assym=PASTE_TEST_VALUE_HERE'"
  exit 1
fi

MEDIA_API="https://api.media.test.dev-gutools.co.uk"

# Freeze the corpus at script-start time — RECORD THIS, reuse for B-after.
UNTIL=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
UNTIL_ENC=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$UNTIL', safe=''))")

REPS=50
PAUSE=15   # seconds between batches — ensures CloudWatch 1-minute buckets separate cleanly

echo "╔══════════════════════════════════════════════════════╗"
echo "║  B-before — TEST load (no gzip patch)               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  UNTIL (pinned corpus) = $UNTIL"
echo "  *** RECORD THIS VALUE — reuse it verbatim in B-after ***"
echo ""
echo "  REPS=$REPS per length  PAUSE=${PAUSE}s between batches"
echo ""

# Confirm cookie
HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  -H "Cookie: $GRID_COOKIE_TEST" \
  "${MEDIA_API}/images?q=&length=1&orderBy=-uploadTime&free=true&countAll=true")
if [[ "$HTTP" != "200" ]]; then
  echo "ERROR: got HTTP $HTTP — cookie may have expired."
  exit 1
fi
echo "  Cookie OK."
echo ""

# Associative arrays to store timestamps for the lookup block
typeset -A BATCH_START BATCH_END

printf '%-6s  %-26s  %-26s  %-16s\n' "len" "batch_start (UTC)" "batch_end (UTC)" "tTotal_s(med)"
printf '%-6s  %-26s  %-26s  %-16s\n' "------" "--------------------------" "--------------------------" "----------------"

for LEN in 1 50 200; do
  URL="${MEDIA_API}/images?q=&offset=0&length=${LEN}&orderBy=-uploadTime&until=${UNTIL_ENC}&free=true&countAll=false"

  START_TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  BATCH_START[$LEN]=$START_TS

  T_MED=$(for i in $(seq $REPS); do
    curl -s -o /dev/null -w '%{time_total}\n' \
      --max-time 30 \
      -H "Cookie: $GRID_COOKIE_TEST" \
      "$URL"
  done | sort -n | awk '{a[NR]=$1} END{print a[int(NR/2)]}')

  END_TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  BATCH_END[$LEN]=$END_TS

  printf '%-6s  %-26s  %-26s  %-16s\n' "$LEN" "$START_TS" "$END_TS" "$T_MED"

  if [[ "$LEN" != "200" ]]; then
    echo "  (pausing ${PAUSE}s so CloudWatch buckets separate...)"
    sleep $PAUSE
  fi
done

echo ""
echo "══════════════════════════════════════════════════════"
echo "  KIBANA LOOKUP — for each batch below:"
echo ""
echo "  KQL (paste into search bar):"
echo '    message: "image search - query returned successfully"'
echo ""
echo "  Then set time range to the batch window and read the"
echo "  numeric '\''duration'\'' field (ms) — p50/p95/p99."
echo "  (If '\''duration'\'' is not a numeric column, look for"
echo "  a field containing the value from '\''in N ms'\'' in the message.)"
echo ""
for LEN in 1 50 200; do
  echo "  len=$LEN  →  $BATCH_START[$LEN]  to  $BATCH_END[$LEN]"
done
echo ""
echo "══════════════════════════════════════════════════════"
echo "  CLOUDWATCH LOOKUP"
echo ""
echo "  Namespace : TEST/MediaApi"
echo "  Metrics   : ElasticSearch (dim SearchType=results) → ES took — expect FLAT"
echo "              RequestDuration                        → full HTTP — expect FLAT"
echo "  Stats     : p50 / p95 / p99"
echo "  Time range: cover all batches:"
echo "  From $BATCH_START[1]  to  $BATCH_END[200]"
echo ""
echo "══════════════════════════════════════════════════════"
echo "  Done. Record the Kibana + CloudWatch values as B-before."
echo "  Then deploy the gzip patch to TEST and run B-after"
echo "  with UNTIL=$UNTIL"
