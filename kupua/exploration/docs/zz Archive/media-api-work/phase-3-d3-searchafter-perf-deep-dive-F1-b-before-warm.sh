#!/usr/bin/env zsh
# B-before-warm — TEST load generator, BEFORE the gzip patch, pre-warmed.
#
# Run this after re-deploying main (without the patch) to TEST.
# Wait ~5 minutes after deploy for JVM to initialise, then run.
# Pre-warm handles any remaining JVM coldness.
#
# Identical structure to b-after-warm.sh — apples-to-apples comparison.
# UNTIL is pinned to the same value used in all other B runs.
#
# Prereq:  - main (no patch) deployed to TEST.
#          - GRID_COOKIE_TEST set (may need refreshing after redeploy).
#          - Kahuna browser tabs closed.
# Run:     zsh kupua/exploration/docs/03\ Ce\ n\'est\ pas\ une\ pipe\ dream/media-api-work/phase-3-d3-searchafter-perf-deep-dive-F1-b-before-warm.sh

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
echo "║  B-before-warm — pre-warmed, 100 reps (NO patch)    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo "  UNTIL=$UNTIL_RAW  WARM_REPS=$WARM_REPS  REPS=$REPS"
echo ""

HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  -H "Cookie: $GRID_COOKIE_TEST" \
  "${MEDIA_API}/images?q=&length=1&orderBy=-uploadTime&free=true&countAll=true")
if [[ "$HTTP" != "200" ]]; then
  echo "ERROR: HTTP $HTTP — cookie expired after redeploy? Re-copy from DevTools."
  exit 1
fi
echo "  Cookie OK (HTTP 200)."
echo ""

typeset -A BATCH_START BATCH_END

printf '%-6s  %-26s  %-26s  %-16s\n' "len" "batch_start (UTC)" "batch_end (UTC)" "tTotal_s(med)"
printf '%-6s  %-26s  %-26s  %-16s\n' "------" "--------------------------" "--------------------------" "----------------"

for LEN in 1 50 200; do
  URL="${MEDIA_API}/images?q=&offset=0&length=${LEN}&orderBy=-uploadTime&until=${UNTIL_ENC}&free=true&countAll=false"

  echo "  [len=$LEN] warming up ($WARM_REPS requests, not counted)..."
  for i in $(seq $WARM_REPS); do
    curl -s -o /dev/null --max-time 30 \
      -H "Cookie: $GRID_COOKIE_TEST" "$URL"
  done

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
echo "  Done. Record as B-before-warm."
echo "  Then re-deploy the patch to TEST and run b-after-warm.sh again."
