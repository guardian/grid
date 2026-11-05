#!/usr/bin/env zsh
# A2-before — through local media-api, BEFORE the gzip patch.
#
# Purpose: measure end-to-end curl time_total AND media-api log `duration`
#          (the ES round-trip leg: send + took + body read + parse).
#          This is the baseline. Run A2-after identically once the patch is applied.
#
# Prereq:  - dev/script/start.sh --use-TEST running (media-api on local.dev-gutools.co.uk)
#          - GRID_COOKIE env var set (session only, never in a file):
#              export GRID_COOKIE='gutoolsAuth-assym=PASTE_VALUE_HERE'
#          - Run from repo root.
#
# Run:     zsh kupua/exploration/docs/03\ Ce\ n\'est\ pas\ une\ pipe\ dream/media-api-work/phase-3-d3-searchafter-perf-deep-dive-F1-a2-before.sh
# Output:  paste the printed table into the measurements section of the companion doc.
# Safety:  read-only GET. Response bodies go to /dev/null (contain signed URLs).

set -euo pipefail

if [[ -z "${GRID_COOKIE:-}" ]]; then
  echo "ERROR: GRID_COOKIE env var not set."
  echo "  export GRID_COOKIE='gutoolsAuth-assym=PASTE_VALUE_HERE'"
  exit 1
fi

MEDIA_API="https://api.media.local.dev-gutools.co.uk"
# Pinned corpus timestamp — must be the SAME value for before AND after runs.
UNTIL_RAW="2026-06-27T15:58:42.572Z"
UNTIL_ENC="2026-06-27T15%3A58%3A42.572Z"
LOG_FILE="media-api/logs/application.log"
REPS=7

if [[ ! -f "$LOG_FILE" ]]; then
  echo "ERROR: media-api log not found at $LOG_FILE"
  echo "  Make sure dev/script/start.sh --use-TEST is running from repo root."
  exit 1
fi

# Confirm cookie is valid before burning reps
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
echo "A2-before (no gzip patch)"
echo "  UNTIL=$UNTIL_RAW  REPS=$REPS  LOG=$LOG_FILE"
echo ""
printf '%-6s  %-16s  %-18s  %-10s\n' "len" "tTotal_s(med)" "duration_ms(med)" "log_hits"
printf '%-6s  %-16s  %-18s  %-10s\n' "------" "----------------" "------------------" "----------"

for LEN in 1 50 200; do
  URL="${MEDIA_API}/images?q=&offset=0&length=${LEN}&orderBy=-uploadTime&until=${UNTIL_ENC}&free=true&countAll=false"

  # Snapshot log line count before batch
  LOG_BEFORE=$(wc -l < "$LOG_FILE" | tr -d ' ')

  # curl loop — bodies to /dev/null (signed URLs must not be written to disk)
  T_MED=$(for i in $(seq $REPS); do
    curl -s -o /dev/null -w '%{time_total}\n' \
      --max-time 30 \
      -H "Cookie: $GRID_COOKIE" \
      "$URL"
  done | sort -n | awk '{a[NR]=$1} END{print a[int(NR/2)]}')

  # Read duration values from log lines added during this batch
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
echo "Done. Paste the table above into the measurements section as A2-before."
echo "Next: apply the patch, wait for sbt recompile, then run A2-after."
