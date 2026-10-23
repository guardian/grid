#!/usr/bin/env bash
set -euo pipefail

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends /tmp/imgproxy.deb curl

mkdir -p /etc/grid
touch /etc/grid/imgproxy.env

server_pid=
cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

su -s /bin/bash imgproxy -c "VIPS_VECTOR=167772160 /usr/bin/imgproxy" >/tmp/imgproxy.log 2>&1 &
server_pid=$!

for attempt in $(seq 1 30); do
  if curl --silent --fail http://127.0.0.1:8080/health >/dev/null; then
    curl --silent --show-error --fail http://127.0.0.1:8080/health
    exit 0
  fi
  sleep 1
done

cat /tmp/imgproxy.log >&2
echo "imgproxy did not become healthy" >&2
exit 1
