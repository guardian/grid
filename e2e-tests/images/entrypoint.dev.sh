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
#   GRID_SERVICES         space-separated services to run (default below)
#   GRID_JAVA_OPTS        extra JVM options, forwarded to the run JVM
#   GRID_EXTRA_CONFIG_DIR dir of <service>.conf overrides (sets -DextraConfigDir)
#   GRID_DEBUG            if non-empty, opens a JDWP debug server on port 5005

set -euo pipefail

REPO=/build
cd "$REPO"

DEFAULT_SERVICES="auth media-api kahuna"
SERVICES="${GRID_SERVICES:-$DEFAULT_SERVICES}"

# service -> http port. Informational only: `sbt <svc>/run` binds the port from
# playDefaultPort in build.sbt, so these must stay in sync with it.
declare -A PORTS=(
  [media-api]=9001
  [thrall]=9002
  [kahuna]=9005
  [cropper]=9006
  [metadata-editor]=9007
  [collections]=9010
  [auth]=9011
  [leases]=9012
)

# --- Kahuna frontend watcher ------------------------------------------------
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

# --- Assemble the sbt run command -------------------------------------------
run_tasks=""
for svc in $SERVICES; do
  if [[ -z "${PORTS[$svc]:-}" ]]; then
    echo "Unknown service '$svc' (no port mapping); skipping." >&2
    continue
  fi
  echo "Will run $svc on port ${PORTS[$svc]}"
  run_tasks="$run_tasks ${svc}/run"
done

if [[ -z "$run_tasks" ]]; then
  echo "No valid services selected in GRID_SERVICES='$SERVICES'." >&2
  exit 1
fi

# `all` runs the per-service `run` tasks in parallel from a single sbt session.
SBT_COMMAND="all${run_tasks}"

# --- sbt / JVM options ------------------------------------------------------
SBT_OPTS="${SBT_OPTS:-}"
if [[ -n "${GRID_EXTRA_CONFIG_DIR:-}" ]]; then
  SBT_OPTS="$SBT_OPTS -J-DextraConfigDir=${GRID_EXTRA_CONFIG_DIR}"
fi
if [[ -n "${GRID_DEBUG:-}" ]]; then
  SBT_OPTS="$SBT_OPTS -jvm-debug 5005"
fi
if [[ -n "${GRID_JAVA_OPTS:-}" ]]; then
  for opt in $GRID_JAVA_OPTS; do
    SBT_OPTS="$SBT_OPTS -J${opt}"
  done
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
