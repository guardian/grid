#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
package=${1:-"$script_dir/dist/imgproxy.deb"}
expected_version=${2:-}

test "$(dpkg-deb --field "$package" Package)" = imgproxy
test "$(dpkg-deb --field "$package" Architecture)" = arm64
test -n "$(dpkg-deb --field "$package" Depends)"

package_version=$(dpkg-deb --field "$package" Version)
if [[ -n "$expected_version" && "$package_version" != "$expected_version" ]]; then
  echo "Unexpected package version: $package_version (expected $expected_version)" >&2
  exit 1
fi

inspection=$(mktemp -d)
trap 'rm -rf "$inspection"' EXIT
mkdir -p "$inspection/control" "$inspection/root"
dpkg-deb --control "$package" "$inspection/control"
dpkg-deb --extract "$package" "$inspection/root"

test -x "$inspection/control/postinst"
cmp "$script_dir/imgproxy.service" "$inspection/root/lib/systemd/system/imgproxy.service"
python3 "$script_dir/verify-sbom.py" "$inspection/root/opt/imgproxy/share/sbom"
test -s "$inspection/root/opt/imgproxy/share/doc/NOTICE"

echo "verified $package ($package_version, arm64)"
