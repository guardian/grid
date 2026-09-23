#!/usr/bin/env bash
#
# CI entrypoint for the Grid all-in-one image.
#
# Runs from the repository bind-mounted at /build. Builds Kahuna's production
# bundle once (npm ci + npm run dist), stages all Play services with
# `sbt e2eStage`, then launches the staged applications in production mode. Each
# staged app defaults to port 9000, so the correct port is passed per service via
# -Dhttp.port. Services run in the background; if any one exits the container
# stops, and SIGTERM/SIGINT are forwarded for a clean shutdown.

set -euo pipefail

# errtrace (-E) so the ERR trap also fires for failures inside the ( ... ) subshells below.
set -E

# Make build/staging failures loud and greppable. Without this, a failure while resolving
# dependencies (most often Maven Central returning HTTP 429 during `sbt e2eStage`, or the npm
# registry rate limiting `npm ci`) only surfaces to the test harness as "services never became
# healthy", masking the real cause. This banner puts the actual failure front and centre in the
# container logs, which the harness now prints on a failed boot.
on_error() {
  local exit_code=$?
  {
    echo "=================================================================="
    echo "ERROR: Grid CI entrypoint failed (exit ${exit_code}) at line ${BASH_LINENO[0]}."
    echo "Check the output above for the underlying cause. Common culprits:"
    echo "  * Maven Central rate limiting (HTTP 429 / 'Too Many Requests') during 'sbt e2eStage'"
    echo "  * npm registry rate limiting or network errors during 'npm ci'"
    echo "=================================================================="
  } >&2
}
trap on_error ERR

REPO=/build
cd "$REPO"

# Shared service list, port map, and shutdown helper.
source "$(dirname "$0")/entrypoint.common.sh"

# Default to the full production service list; GRID_SERVICES can narrow it.
SERVICES="${GRID_SERVICES:-$SERVICES}"

# --- Build the Kahuna frontend once (production bundle) so `sbt e2eStage`
# packages the bundled assets into kahuna's staged output.
if [[ " $SERVICES " == *" kahuna "* ]]; then
  echo "Installing Kahuna dependencies (npm ci)..."
  ( cd "$REPO/kahuna" && npm ci )
  echo "Building Kahuna production bundle (npm run dist)..."
  ( cd "$REPO/kahuna" && npm run dist )
fi

# --- Stage all services (production artefacts) with sbt.
echo "Staging services with sbt e2eStage..."
sbt e2eStage

# --- Launch the staged applications.
pids=()

trap 'shutdown_children "${pids[@]}"' TERM INT

for svc in $SERVICES; do
  port="${PORTS[$svc]:-}"
  if [[ -z "$port" ]]; then
    echo "Unknown service '$svc' (no port mapping); skipping." >&2
    continue
  fi

  bin="$REPO/$svc/target/universal/stage/bin/$svc"
  if [[ ! -x "$bin" ]]; then
    echo "Executable for service '$svc' not found at $bin; skipping." >&2
    continue
  fi

  # The staged apps bake in production paths (see Universal / javaOptions in
  # build.sbt): config/logback under /usr/share/<svc>/conf and GC logs under
  # /var/log/<svc>. Those are provisioned by the Debian package in production;
  # recreate them here so the JVM starts and loads its bundled config.
  mkdir -p "/var/log/$svc"
  mkdir -p "$(dirname "/usr/share/$svc")"
  ln -sfn "$REPO/$svc/target/universal/stage" "/usr/share/$svc"

  echo "Starting $svc on port $port"
  "$bin" -Dhttp.port="$port" &
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


