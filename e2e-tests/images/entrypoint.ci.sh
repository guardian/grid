#!/usr/bin/env bash
#
# CI entrypoint for the Grid all-in-one image.
#
# Runs from the repository bind-mounted at /build. Has two modes so compilation
# can run as a separate, visible CI step ahead of the tests rather than being
# hidden inside stack startup:
#
#   GRID_STAGE_ONLY=1  Build Kahuna's production bundle (npm ci + npm run dist)
#                      and stage all Play services with `sbt e2eStage`, then
#                      exit. Used by the CI "precompile" step to produce
#                      target/universal/stage into the mounted repo (and warm the
#                      incremental-compile cache) before the stack is started.
#
#   default            Launch the staged applications in production mode. If the
#                      services are already staged (e.g. by the precompile step),
#                      staging is skipped for a fast start; otherwise they are
#                      staged first. Set GRID_FORCE_STAGE=1 to always re-stage.
#
# Each staged app defaults to port 9000, so the correct port is passed per
# service via -Dhttp.port. Services run in the background; if any one exits the
# container stops, and SIGTERM/SIGINT are forwarded for a clean shutdown.

set -euo pipefail

REPO=/build
cd "$REPO"

# The repo is bind-mounted from the host, so /build is owned by the host user while this
# container runs as root. Git refuses to operate on a repo it sees as owned by someone else
# ("detected dubious ownership"), which breaks the git calls sbt makes for versioning during
# `sbt e2eStage`. Mark /build as trusted so those calls succeed.
git config --global --add safe.directory "$REPO"

# Shared service list, port map, and shutdown helper.
source "$(dirname "$0")/entrypoint.common.sh"

# Default to the full production service list; GRID_SERVICES can narrow it.
SERVICES="${GRID_SERVICES:-$SERVICES}"

# Build the Kahuna production bundle (so `sbt e2eStage` packages its assets) then
# stage all services as production artefacts.
build_and_stage() {
  if [[ " $SERVICES " == *" kahuna "* ]]; then
    echo "Installing Kahuna dependencies (npm ci)..."
    ( cd "$REPO/kahuna" && npm ci )
    echo "Building Kahuna production bundle (npm run dist)..."
    ( cd "$REPO/kahuna" && npm run dist )
  fi

  echo "Staging services with sbt e2eStage..."
  sbt e2eStage
}

# True only when every selected service already has a staged launcher script.
all_services_staged() {
  local svc
  for svc in $SERVICES; do
    [[ -n "${PORTS[$svc]:-}" ]] || continue
    [[ -x "$REPO/$svc/target/universal/stage/bin/$svc" ]] || return 1
  done
  return 0
}

# --- Precompile mode: build + stage, then exit for the next CI step to run.
if [[ -n "${GRID_STAGE_ONLY:-}" ]]; then
  build_and_stage
  echo "Staging complete (GRID_STAGE_ONLY); exiting."
  exit 0
fi

# --- Run mode: stage only if the precompile step has not already done so.
if [[ -n "${GRID_FORCE_STAGE:-}" ]] || ! all_services_staged; then
  build_and_stage
else
  echo "Services already staged; skipping build (set GRID_FORCE_STAGE=1 to re-stage)."
fi

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


