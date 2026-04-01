#!/usr/bin/env zsh
#
# Run E1 (table scroll) at three overscan values: 3, 5, 8.
# Modifies ImageTable.tsx, waits for HMR, runs, reverts.
#
# Prerequisites:
#   - Vite dev server running (./scripts/start.sh or start.sh --use-TEST)
#   - This script does NOT start the server
#
# Usage:
#   ./scripts/run-overscan-experiment.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KUPUA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TABLE_FILE="$KUPUA_DIR/src/components/ImageTable.tsx"

# Verify file exists
if [[ ! -f "$TABLE_FILE" ]]; then
  echo "❌ Cannot find $TABLE_FILE"
  exit 1
fi

# Verify current overscan is 5 (sanity check)
if ! grep -q 'overscan: 5,' "$TABLE_FILE"; then
  echo "❌ ImageTable.tsx doesn't have 'overscan: 5,' — has it been modified?"
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Overscan experiment: E1 table scroll at overscan 3/5/8 ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

for OVERSCAN in 3 5 8; do
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Setting overscan = $OVERSCAN"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Replace overscan value
  sed -i '' "s/overscan: [0-9]*,/overscan: $OVERSCAN,/" "$TABLE_FILE"

  # Verify the change took
  if ! grep -q "overscan: $OVERSCAN," "$TABLE_FILE"; then
    echo "❌ sed failed to set overscan to $OVERSCAN"
    # Revert
    sed -i '' "s/overscan: [0-9]*,/overscan: 5,/" "$TABLE_FILE"
    exit 1
  fi

  echo "  ✓ ImageTable.tsx updated (overscan: $OVERSCAN)"
  echo "  Waiting 3s for Vite HMR..."
  sleep 3

  # Run E1 only, passing the overscan value as env var for tagging
  echo "  Running E1..."
  EXP_OVERSCAN_TABLE="$OVERSCAN" npx playwright test \
    --config "$KUPUA_DIR/playwright.experiments.config.ts" \
    -g "E1" || true

  echo "  ✓ E1 complete at overscan=$OVERSCAN"
done

# Always revert to 5
echo ""
echo "Reverting to overscan: 5..."
sed -i '' "s/overscan: [0-9]*,/overscan: 5,/" "$TABLE_FILE"

if grep -q 'overscan: 5,' "$TABLE_FILE"; then
  echo "✓ Reverted successfully"
else
  echo "⚠️  Revert may have failed — check ImageTable.tsx!"
fi

echo ""
echo "Done. 9 result JSONs in e2e-perf/results/experiments/"
echo "Compare with: jq '{experiment, config, jank: .snapshot.jank, flashes: .snapshot.flashes, dom: .snapshot.dom}' e2e-perf/results/experiments/exp-*.json"

