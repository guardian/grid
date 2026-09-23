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

# The JDK, Node, and sbt versions are the single source of truth in the repo's
# root .tool-versions and are installed with mise (below). Java stays pinned to
# the Corretto build identified there. Native tools used by the image-processing
# services (see repo Brewfile).
ARG NATIVE_PKGS="graphicsmagick imagemagick pngquant libimage-exiftool-perl libgd3"

# Stage: shared toolchain — JDK, sbt, Node (via mise), and the native
# image-processing tools. Both the ci and dev images are built from this. Neither
# copies nor compiles application source: the repository is bind-mounted at run
# time.
FROM ubuntu:22.04 AS toolchain

ARG NATIVE_PKGS

# mise data/config live at a fixed, predictable location so its shims (and the
# tools they resolve) are on PATH for any shell, including the entrypoints.
# MISE_TRUSTED_CONFIG_PATHS pre-trusts /build so mise never prompts for the
# .tool-versions baked in at build time or the one bind-mounted at run time.
ENV MISE_DATA_DIR=/mise \
    MISE_CONFIG_DIR=/mise \
    MISE_CACHE_DIR=/mise/cache \
    MISE_TRUSTED_CONFIG_PATHS=/build \
    PATH=/mise/shims:/usr/local/bin:$PATH

# The Java SDK CBOR protocol is disabled for Localstack/Kinesis compatibility.
ENV AWS_CBOR_DISABLE=true

# Install mise plus the utilities it uses to fetch and unpack tools
# (curl/ca-certificates/git/xz-utils/unzip), and the native image-processing
# tools (mirrors the repo Brewfile).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
    curl ca-certificates git xz-utils unzip ${NATIVE_PKGS}; \
    curl -fsSL https://mise.run | MISE_INSTALL_PATH=/usr/local/bin/mise sh; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Install the toolchain (JDK, Node, sbt) with mise from the single source of
# truth in .tool-versions. This layer is cached and only re-runs when
# .tool-versions changes, so the tools are effectively baked into the image: a
# later `mise install` (build- or run-time) against the same versions is a no-op
# because they already live under MISE_DATA_DIR. Java stays pinned to the
# Corretto build named in .tool-versions.
COPY .tool-versions ./.tool-versions
RUN set -eux; \
    mise install java nodejs sbt; \
    mise reshim; \
    ln -sfn "$(mise where java)" /opt/java; \
    java -version; \
    node --version; \
    npm --version; \
    command -v sbt

# Give tooling that reads JAVA_HOME (rather than PATH) a stable location.
ENV JAVA_HOME=/opt/java

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
FROM ubuntu:22.04 AS default
RUN echo 'ERROR: --target is required. Pass --target ci (grid-e2e-ci) or --target dev (grid-e2e-dev) when building the image' >&2; exit 1
