#!/usr/bin/env bash
#
# Shared definitions for the Grid container entrypoints (ci and dev).
#
# Sourced by entrypoint.ci.sh and entrypoint.dev.sh to provide a single source of
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

# Trust the e2e CA (mounted via the config dir at /etc/grid/ca.crt) so service-to-service
# HTTPS calls through the Caddy proxy succeed — e.g. the cropper fetching the source image
# from api.media.<domain> (Play WS) and downloading a presigned S3 URL from
# localstack.media.<domain> (java.net.URL). Both use the JVM default trust store, so the CA
# must be imported into cacerts; the OS store is updated too for native tooling.
trust_e2e_ca() {
  local ca="${GRID_CA_CERT:-/etc/grid/ca.crt}"
  [[ -f "$ca" ]] || return 0

  echo "Trusting Grid e2e CA from $ca"
  "$JAVA_HOME/bin/keytool" -importcert -noprompt -trustcacerts \
    -alias grid-e2e-ca -file "$ca" \
    -keystore "$JAVA_HOME/lib/security/cacerts" -storepass changeit >/dev/null 2>&1 || true

  if command -v update-ca-certificates >/dev/null 2>&1; then
    cp "$ca" /usr/local/share/ca-certificates/grid-e2e-ca.crt 2>/dev/null || true
    update-ca-certificates >/dev/null 2>&1 || true
  fi
}

trust_e2e_ca
