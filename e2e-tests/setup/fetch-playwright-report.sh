#!/usr/bin/env bash
set -euo pipefail

REPO="guardian/grid"

# Use the run ID passed as the first arg, otherwise fall back to the latest playwright.yml run.
run="${1:-$(gh run list \
    --repo "$REPO" \
    --workflow playwright.yml \
    --limit 1 \
    --json databaseId -q '.[0].databaseId')}"
dir="playwright-report-remote/$run"

rm -rf "$dir"
gh run download "$run" --repo "$REPO" --name "playwright-report" --dir "$dir"
npx playwright show-report "$dir"
