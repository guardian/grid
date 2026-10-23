#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--patched|--unpatched] [output-directory]" >&2
}

patched=true
if [[ "${1:-}" == "--patched" ]]; then
  patched=true
  shift
elif [[ "${1:-}" == "--unpatched" ]]; then
  patched=false
  shift
fi

if [[ $# -gt 1 ]]; then
  usage
  exit 2
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
output_dir=${1:-"$script_dir/dist"}
mkdir -p "$output_dir"
output_dir=$(cd -- "$output_dir" && pwd)

mapfile -t pins < <(sed -nE 's/^FROM (ghcr\.io\/imgproxy\/imgproxy:v[0-9]+\.[0-9]+\.[0-9]+)$/\1/p' "$script_dir/Dockerfile")
if [[ ${#pins[@]} -ne 1 ]]; then
  echo "Dockerfile must contain exactly one literal imgproxy version pin" >&2
  exit 1
fi

image=${pins[0]#FROM }
version=${image##*:}
version=${version#v}
source_tag="v$version"

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

echo "Verifying pinned image $image"
docker build --platform linux/arm64 --tag grid-imgproxy-pinned "$script_dir"
image_version=$(docker run --rm --platform linux/arm64 --entrypoint imgproxy grid-imgproxy-pinned version)
if ! grep -Fq "$version" <<<"$image_version"; then
  echo "Pinned image reports unexpected version: $image_version" >&2
  exit 1
fi

echo "Fetching upstream source tag $source_tag"
git clone --quiet --depth 1 --branch "$source_tag" https://github.com/imgproxy/imgproxy.git "$work_dir/source"
actual_tag=$(git -C "$work_dir/source" describe --tags --exact-match HEAD)
if [[ "$actual_tag" != "$source_tag" ]]; then
  echo "Pinned image version $version does not match source tag $actual_tag" >&2
  exit 1
fi

if [[ "$patched" == true ]]; then
  patch_file="$script_dir/patches/tony-vips-intent.patch"
  git -C "$work_dir/source" apply --check "$patch_file"
  git -C "$work_dir/source" apply "$patch_file"
fi

build_image=grid-imgproxy-package-builder
echo "Building upstream runtime image for arm64"
docker build \
  --platform linux/arm64 \
  --tag "$build_image" \
  --file "$work_dir/source/docker/Dockerfile" \
  "$work_dir/source"

mkdir -p "$work_dir/export"
docker run --rm \
  --platform linux/arm64 \
  --user 0 \
  --volume "$work_dir/export:/output" \
  "$build_image" \
  /usr/local/bin/imgproxy-build-package deb /output

mapfile -t upstream_packages < <(find "$work_dir/export" -maxdepth 1 -type f -name 'imgproxy-*.deb' -print)
if [[ ${#upstream_packages[@]} -ne 1 ]]; then
  echo "Expected one upstream Debian package, found ${#upstream_packages[@]}" >&2
  exit 1
fi

package_root="$work_dir/package"
mkdir -p "$package_root"
dpkg-deb --extract "${upstream_packages[0]}" "$package_root"
mkdir -p "$package_root/DEBIAN"
dpkg-deb --control "${upstream_packages[0]}" "$package_root/DEBIAN"

revision=1
if [[ "$patched" == true ]]; then
  revision='1+grid1'
fi
sed -i -E "s/^Version:.*/Version: $version-$revision/" "$package_root/DEBIAN/control"

mkdir -p "$package_root/lib/systemd/system"
install -m 0644 "$script_dir/imgproxy.service" "$package_root/lib/systemd/system/imgproxy.service"
install -m 0755 "$script_dir/postinst" "$package_root/DEBIAN/postinst"

sed -i 's/^Depends: \(.*\)$/Depends: \1, passwd, systemd/' "$package_root/DEBIAN/control"
dpkg-deb --build --root-owner-group "$package_root" "$output_dir/imgproxy.deb" >/dev/null

architecture=$(dpkg-deb --field "$output_dir/imgproxy.deb" Architecture)
package_version=$(dpkg-deb --field "$output_dir/imgproxy.deb" Version)
expected_version="$version-$revision"
if [[ "$architecture" != arm64 || "$package_version" != "$expected_version" ]]; then
  echo "Unexpected package metadata: Architecture=$architecture Version=$package_version" >&2
  exit 1
fi

bash "$script_dir/verify-package.sh" "$output_dir/imgproxy.deb" "$expected_version"
