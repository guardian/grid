#!/usr/bin/env zsh
# A2-after — through local media-api, AFTER the gzip patch.
#
# Identical to A2-before except the label. Run this once sbt has recompiled
# with the patch in ElasticSearchClient.scala.
#
# Prereq:  - Patch applied; sbt recompile confirmed (fresh "Connecting to Elastic 8:" in log).
#          - GRID_COOKIE env var still set in this terminal session.
#          - Run from repo root.
#
# Run:     zsh kupua/exploration/docs/03\ Ce\ n\'est\ pas\ une\ pipe\ dream/media-api-work/phase-3-d3-searchafter-perf-deep-dive-F1-a2-after.sh
# After:   revert the patch:  git checkout common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchClient.scala

set -euo pipefail

if [[ -z "${GRID_COOKIE:-}" ]]; then
  echo "ERROR: GRID_COOKIE env var not set."
  echo "  export GRID_COOKIE='gutoolsAuth-assym=PASTE_VALUE_HERE'"
  exit 1
fi

MEDIA_API="https://api.media.local.dev-gutools.co.uk"
UNTIL_RAW="2026-06-27T15:58:42.572Z"
UNTIL_ENC="2026-06-27T15%3A58%3A42.572Z"
LOG_FILE="media-api/logs/application.log"
REPS=7

if [[ ! -f "$LOG_FILE" ]]; then
  echo "ERROR: media-api log not found at $LOG_FILE"
  exit 1
fi

# Confirm recompile happened: check log has a recent "Connecting to Elastic 8:" line
if ! tail -50 "$LOG_FILE" | grep -q "Connecting to Elastic 8:"; then
  echo "WARNING: no recent 'Connecting to Elastic 8:' in last 50 log lines."
  echo "  Make sure sbt has recompiled and media-api restarted with the patch."
  echo "  Press Enter to continue anyway, or Ctrl-C to abort."
  read -r
fi

echo "Checking cookie..."
HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  -H "Cookie: $GRID_COOKIE" \
  "${MEDIA_API}/images?q=&length=1&orderBy=-uploadTime&free=true&countAll=true")
if [[ "$HTTP" != "200" ]]; then
  echo "ERROR: got HTTP $HTTP — cookie may have expired. Re-copy from DevTools."
  exit 1
fi
echo "Cookie OK (HTTP 200)."
echo ""
echo "A2-after (WITH gzip patch)"
echo "  UNTIL=$UNTIL_RAW  REPS=$REPS  LOG=$LOG_FILE"
echo ""
printf '%-6s  %-16s  %-18s  %-10s\n' "len" "tTotal_s(med)" "duration_ms(med)" "log_hits"
printf '%-6s  %-16s  %-18s  %-10s\n' "------" "----------------" "------------------" "----------"

for LEN in 1 50 200; do
  URL="${MEDIA_API}/images?q=&offset=0&length=${LEN}&orderBy=-uploadTime&until=${UNTIL_ENC}&free=true&countAll=false"

  LOG_BEFORE=$(wc -l < "$LOG_FILE" | tr -d ' ')

  T_MED=$(for i in $(seq $REPS); do
    curl -s -o /dev/null -w '%{time_total}\n' \
      --max-time 30 \
      -H "Cookie: $GRID_COOKIE" \
      "$URL"
  done | sort -n | awk '{a[NR]=$1} END{print a[int(NR/2)]}')

  LOG_AFTER=$(wc -l < "$LOG_FILE" | tr -d ' ')
  N_NEW=$(( LOG_AFTER - LOG_BEFORE ))

  DUR_MED=$(tail -n +$(( LOG_BEFORE + 1 )) "$LOG_FILE" \
    | grep "image search - query returned successfully" \
    | grep -o 'in [0-9]* ms' \
    | awk '{print $2}' \
    | sort -n \
    | awk '{a[NR]=$1} END{if(NR>0) print a[int(NR/2)]; else print "n/a"}' || true)

  printf '%-6s  %-16s  %-18s  %-10s\n' \
    "$LEN" "$T_MED" "${DUR_MED:-n/a}" "$N_NEW"
done

echo ""
echo "Done. Paste the table above into the measurements section as A2-after."
echo "IMPORTANT: revert the patch now:"
echo "  git checkout common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchClient.scala"
