#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
package=${1:-"$script_dir/dist/imgproxy.deb"}
package=$(realpath "$package")

docker run --rm --platform linux/arm64 \
  --volume "$package:/tmp/imgproxy.deb:ro" \
  --volume "$script_dir/test-runtime.sh:/tmp/test-runtime.sh:ro" \
  --entrypoint bash \
  public.ecr.aws/ubuntu/ubuntu:26.04 \
  /tmp/test-runtime.sh
