#!/usr/bin/env bash
#
# Shared definitions for the Grid container entrypoints (ci and dev).
#
# Sourced by entrypoint.sh and entrypoint.dev.sh to provide a single source of
# truth for the service list, their http ports, and the graceful-shutdown trap.

# service -> http port
declare -A PORTS=(
  [media-api]=9001
  [thrall]=9002
  [image-loader]=9003
  [kahuna]=9005
  [cropper]=9006
  [metadata-editor]=9007
  [collections]=9010
  [auth]=9011
  [leases]=9012
)

export SERVICES="auth collections cropper image-loader kahuna leases media-api metadata-editor thrall"

# Install a TERM/INT trap that kills the given child pids, waits for them, and
# exits cleanly. Pass the pids to tear down as arguments, e.g.
#   trap 'shutdown_children "${pids[@]}"' TERM INT
shutdown_children() {
  echo "Shutting down Grid services..."
  local pid
  for pid in "$@"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  exit 0
}
