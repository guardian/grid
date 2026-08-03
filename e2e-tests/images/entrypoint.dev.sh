#!/usr/bin/env bash
#
# Development entrypoint for the Grid all-in-one image.
#
# Runs the selected Play services under `sbt <svc>/run` (Play dev mode), which
# recompiles changed Scala sources on the next request. When kahuna is selected,
# its webpack bundle is rebuilt continuously via `npm run watch`.
#
# The repository is expected to be bind-mounted at /build so host edits are
# picked up live, e.g.:
#   docker run --rm -v "$PWD:/build" -v "$HOME/.grid:/root/.grid:ro" grid-dev
#
# Environment:
#   GRID_DEBUG            if non-empty, opens a JDWP debug server on port 5005

set -euo pipefail

REPO=/build
cd "$REPO"

SERVICES="auth media-api kahuna"

# --- Kahuna frontend watcher
watch_pid=""
if [[ " $SERVICES " == *" kahuna "* ]]; then
  echo "Starting Kahuna webpack watcher..."
  (
    cd "$REPO/kahuna"
    # node_modules may be shadowed by the host bind-mount; install if absent.
    if [[ ! -d node_modules ]]; then
      npm install
    fi
    npm run watch
  ) &
  watch_pid=$!
fi

# --- Assemble the sbt run command
run_tasks=""
for svc in $SERVICES; do
  echo "Running $svc"
  run_tasks="$run_tasks ${svc}/run"
done

if [[ -z "$run_tasks" ]]; then
  echo "No valid services selected in '$SERVICES'." >&2
  exit 1
fi

# `all` runs the per-service `run` tasks in parallel from a single sbt session.
SBT_COMMAND="all${run_tasks}"

# --- sbt / JVM options
SBT_OPTS="${SBT_OPTS:-}"
if [[ -n "${GRID_DEBUG:-}" ]]; then
  SBT_OPTS="$SBT_OPTS -jvm-debug 5005"
fi

shutdown() {
  echo "Shutting down dev services..."
  [[ -n "$watch_pid" ]] && kill -TERM "$watch_pid" 2>/dev/null || true
  [[ -n "${sbt_pid:-}" ]] && kill -TERM "$sbt_pid" 2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

echo "Running: sbt $SBT_OPTS \"$SBT_COMMAND\""

# Play's dev-mode `run` blocks reading stdin and stops on EOF/Enter. Keep stdin
# open (via a never-ending source) so the services stay up in a non-interactive
# container; shutdown is driven by the SIGTERM/SIGINT trap above.
tail -f /dev/null | sbt $SBT_OPTS "$SBT_COMMAND" &
sbt_pid=$!
wait "$sbt_pid"
