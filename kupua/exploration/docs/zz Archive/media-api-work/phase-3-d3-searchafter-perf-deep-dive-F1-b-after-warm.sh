#!/usr/bin/env zsh
# B-after-warm — TEST, WITH gzip patch, pre-warmed (eliminates cold-JVM confound).
#
# Runs 20 throwaway warm-up requests per length (not counted), then 100 timed reps.
# START timestamp recorded AFTER warm-up so Kibana time range only covers timed portion.
#
# Run this IMMEDIATELY after B-after while the JVM is still warm from that run.
# OR after re-deploying the patch (allow 5 mins for JVM to settle, but pre-warm handles it).
#
# Prereq:  GRID_COOKIE_TEST set. Kahuna browser tabs closed.
# Run:     zsh kupua/exploration/docs/03\ Ce\ n\'est\ pas\ une\ pipe\ dream/media-api-work/phase-3-d3-searchafter-perf-deep-dive-F1-b-after-warm.sh

set -euo pipefail

if [[ -z "${GRID_COOKIE_TEST:-}" ]]; then
  echo "ERROR: GRID_COOKIE_TEST not set."
  exit 1
fi

MEDIA_API="https://api.media.test.dev-gutools.co.uk"
UNTIL_RAW="2026-06-27T16:41:07.000Z"
UNTIL_ENC="2026-06-27T16%3A41%3A07.000Z"
WARM_REPS=20
REPS=100
PAUSE=15

echo "╔══════════════════════════════════════════════════════╗"
echo "║  B-after-warm — pre-warmed, 100 reps                ║"
echo "╚══════════════════════════════════════════════════════╝"
echo "  UNTIL=$UNTIL_RAW  WARM_REPS=$WARM_REPS  REPS=$REPS"
echo ""

HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  -H "Cookie: $GRID_COOKIE_TEST" \
  "${MEDIA_API}/images?q=&length=1&orderBy=-uploadTime&free=true&countAll=true")
[[ "$HTTP" == "200" ]] || { echo "ERROR: HTTP $HTTP — cookie expired?"; exit 1; }
echo "  Cookie OK."
echo ""

typeset -A BATCH_START BATCH_END

printf '%-6s  %-26s  %-26s  %-16s\n' "len" "batch_start (UTC)" "batch_end (UTC)" "tTotal_s(med)"
printf '%-6s  %-26s  %-26s  %-16s\n' "------" "--------------------------" "--------------------------" "----------------"

for LEN in 1 50 200; do
  URL="${MEDIA_API}/images?q=&offset=0&length=${LEN}&orderBy=-uploadTime&until=${UNTIL_ENC}&free=true&countAll=false"

  # Pre-warm: discard these, don't record timestamps yet
  echo "  [len=$LEN] warming up ($WARM_REPS requests, not counted)..."
  for i in $(seq $WARM_REPS); do
    curl -s -o /dev/null --max-time 30 \
      -H "Cookie: $GRID_COOKIE_TEST" "$URL"
  done

  # Timed batch starts here
  START_TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  BATCH_START[$LEN]=$START_TS

  T_MED=$(for i in $(seq $REPS); do
    curl -s -o /dev/null -w '%{time_total}\n' \
      --max-time 30 \
      -H "Cookie: $GRID_COOKIE_TEST" "$URL"
  done | sort -n | awk '{a[NR]=$1} END{print a[int(NR/2)]}')

  END_TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  BATCH_END[$LEN]=$END_TS

  printf '%-6s  %-26s  %-26s  %-16s\n' "$LEN" "$START_TS" "$END_TS" "$T_MED"

  if [[ "$LEN" != "200" ]]; then
    echo "  (pausing ${PAUSE}s...)"
    sleep $PAUSE
  fi
done

echo ""
echo "══════════════════════════════════════════════════════"
echo "  KIBANA — use these windows (pre-warm excluded):"
echo '  KQL: stage:TEST AND stack:media-service AND message:"image search - query returned successfully"'
echo ""
for LEN in 1 50 200; do
  echo "  len=$LEN  →  $BATCH_START[$LEN]  to  $BATCH_END[$LEN]"
done
echo "══════════════════════════════════════════════════════"
