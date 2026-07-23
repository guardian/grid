#!/usr/bin/env bash
#
# Supervises the Grid Play services inside a single container.
#
# Each staged application defaults to port 9000 in production, so the correct
# port is passed explicitly per service via -Dhttp.port. Services run in the
# background; if any one exits the container stops, and SIGTERM/SIGINT are
# forwarded for a clean shutdown.
#
# Set GRID_SERVICES to a space-separated subset to run fewer services, e.g.
#   docker run -e GRID_SERVICES="media-api kahuna" grid-all
# Extra JVM options can be appended via GRID_JAVA_OPTS.

set -euo pipefail

# service -> http port
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

DEFAULT_SERVICES="auth collections cropper kahuna leases media-api metadata-editor thrall"
SERVICES="${GRID_SERVICES:-$DEFAULT_SERVICES}"
EXTRA_JAVA_OPTS="${GRID_JAVA_OPTS:-}"

pids=()

shutdown() {
  echo "Shutting down Grid services..."
  for pid in "${pids[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait
  exit 0
}

trap shutdown TERM INT

for svc in $SERVICES; do
  port="${PORTS[$svc]:-}"
  if [[ -z "$port" ]]; then
    echo "Unknown service '$svc' (no port mapping); skipping." >&2
    continue
  fi

  bin="/usr/share/$svc/bin/$svc"
  if [[ ! -x "$bin" ]]; then
    echo "Executable for service '$svc' not found at $bin; skipping." >&2
    continue
  fi

  echo "Starting $svc on port $port"
  # shellcheck disable=SC2086
  "$bin" -Dhttp.port="$port" $EXTRA_JAVA_OPTS &
  pids+=("$!")
done

# Block until the first service exits. During a healthy run the services stay up,
# so this only returns if one crashed; when that happens, tear the rest down and
# exit non-zero so the failure surfaces instead of leaving a half-running stack
# that still looks alive.
wait -n || true
echo "A Grid service exited unexpectedly; shutting down the rest." >&2
for pid in "${pids[@]}"; do
  kill -TERM "$pid" 2>/dev/null || true
done
wait 2>/dev/null || true
exit 1
