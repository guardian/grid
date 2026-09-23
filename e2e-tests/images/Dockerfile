# syntax=docker/dockerfile:1

# Single development toolchain environment that builds and runs all Grid Play
# services under test (auth, collections, cropper, image-loader, kahuna, leases,
# media-api, metadata-editor, thrall) together with Kahuna's frontend.
#
# This one Dockerfile produces two images, selected with `--target`. Both share
# the same toolchain environment and bind-mount the repository over /build at run
# time; they differ only in their entrypoint:
#
#   * ci (grid-e2e-ci)   — CI. Builds the Kahuna frontend once (npm ci + npm run
#                          dist), stages the services with `sbt e2eStage`, then
#                          runs the staged applications in production mode.
#       docker build --target ci -f e2e-tests/images/Dockerfile -t grid-e2e-ci .
#
#   * dev (grid-e2e-dev) — local development. Runs the webpack watcher and the
#                          Scala services from the mounted source with sbt (Play
#                          dev mode) so host edits recompile live.
#       docker build --target dev -f e2e-tests/images/Dockerfile -t grid-e2e-dev .
#
# `--target` is required: a plain `docker build` hits the `default` guard stage
# below and fails with a reminder. See images/README.md for details.
#
# No application source or Kahuna output is baked into either image. The
# repository is bind-mounted over /build at run time, and per-environment config
# is mounted into /root/.grid (and /etc/grid), e.g.:
#   docker run --rm -v "$PWD:/build" -v "$HOME/.grid:/root/.grid:ro" grid-e2e-dev

# Shared build args (single source of truth for both images).
ARG SBT_VERSION=1.10.3
ARG NODE_VERSION=22.12.0
# Native tools used by the image processing services (see repo Brewfile).
ARG NATIVE_PKGS="graphicsmagick imagemagick pngquant libimage-exiftool-perl libgd3"

# Stage: shared toolchain — JDK, sbt, Node, and the native image-processing
# tools. Both the ci and dev images are built from this. Neither copies nor
# compiles application source: the repository is bind-mounted at run time.
FROM eclipse-temurin:11-jdk-jammy AS toolchain

ARG SBT_VERSION
ARG NODE_VERSION
ARG NATIVE_PKGS
# Provided automatically by BuildKit (e.g. amd64, arm64).
ARG TARGETARCH

# Install sbt, Node, and the native tools in one layer. curl/ca-certificates
# fetch the tarballs; xz-utils unpacks the Node tarball; the native tools mirror
# the repo Brewfile. Node is pinned to match kahuna's required version.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl ca-certificates xz-utils ${NATIVE_PKGS}; \
    curl -fLo /tmp/sbt.tgz "https://github.com/sbt/sbt/releases/download/v${SBT_VERSION}/sbt-${SBT_VERSION}.tgz"; \
    tar -xzf /tmp/sbt.tgz -C /opt; \
    ln -s /opt/sbt/bin/sbt /usr/local/bin/sbt; \
    rm -f /tmp/sbt.tgz; \
    case "${TARGETARCH:-amd64}" in \
    amd64) node_arch=x64 ;; \
    arm64) node_arch=arm64 ;; \
    *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fLo /tmp/node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"; \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --no-same-owner; \
    rm -f /tmp/node.tar.xz; \
    node --version; \
    npm --version; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build

# The Java SDK CBOR protocol is disabled for Localstack/Kinesis compatibility.
ENV AWS_CBOR_DISABLE=true

# Shared entrypoint helpers (service list, ports, graceful-shutdown trap).
COPY e2e-tests/images/entrypoint.common.sh /usr/local/bin/entrypoint.common.sh

# Stage: CI image (grid-e2e-ci). Builds Kahuna once, stages the services with
# `sbt e2eStage`, and runs the staged applications in production mode.
FROM toolchain AS ci

COPY e2e-tests/images/entrypoint.ci.sh /usr/local/bin/entrypoint.ci.sh
RUN chmod +x /usr/local/bin/entrypoint.ci.sh

# media-api, thrall, image-loader, kahuna, cropper, metadata-editor, collections, auth, leases
EXPOSE 9001 9002 9003 9005 9006 9007 9010 9011 9012

ENTRYPOINT ["/usr/local/bin/entrypoint.ci.sh"]

# Stage: development image (grid-e2e-dev). Runs the webpack watcher and the Scala
# services from the mounted source with sbt (Play dev mode) for live reload.
FROM toolchain AS dev

COPY e2e-tests/images/entrypoint.dev.sh /usr/local/bin/entrypoint.dev.sh
RUN chmod +x /usr/local/bin/entrypoint.dev.sh

# media-api, thrall, image-loader, kahuna, cropper, metadata-editor, collections, auth, leases
# plus the JDWP debug port used when GRID_DEBUG is set.
EXPOSE 9001 9002 9003 9005 9006 9007 9010 9011 9012 5005

ENTRYPOINT ["/usr/local/bin/entrypoint.dev.sh"]

# Stage: default guard. This is the last stage, so a plain `docker build` (no
# --target) builds it and fails, forcing an explicit `--target ci|dev`.
FROM eclipse-temurin:11-jre-jammy AS default
RUN echo 'ERROR: --target is required. Pass --target ci (grid-e2e-ci) or --target dev (grid-e2e-dev) when building the image' >&2; exit 1
