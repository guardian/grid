# syntax=docker/dockerfile:1

# Single-container image that builds and runs nine Grid Play services
# (auth, collections, cropper, image-loader, kahuna, leases, media-api,
# metadata-editor, thrall) together with Kahuna's frontend.
#
# This one Dockerfile produces two images, selected with `--target`:
#
#   * ci (grid-e2e-ci)  — CI/production style. Stages pre-compiled artefacts
#                           and runs them under a slim JRE.
#       docker build --target ci -f e2e-tests/images/Dockerfile -t grid-e2e-ci .
#
#   * dev (grid-e2e-dev)      — local development. Runs the services under
#                           `sbt <svc>/run` (Play dev mode) with the repo
#                           bind-mounted over /build so host edits recompile live.
#       docker build --target dev -f e2e-tests/images/Dockerfile -t grid-e2e-dev .
#
# `--target` is required: a plain `docker build` hits the `default` guard stage
# below and fails with a reminder. See images/README.md for details.
#
# Runtime configuration is not baked into the ci image. Mount per-environment
# config (and a stage marker) into /etc/grid at run time, e.g.:
#   docker run --rm -v "$PWD/my-config:/etc/grid" grid-e2e-ci

# Shared build args (single source of truth for both images).
ARG SBT_VERSION=1.10.3
ARG NODE_VERSION=22.12.0
# Native tools used by the image processing services (see repo Brewfile). Kept
# as one arg so the ci and dev stages install the same set.
ARG NATIVE_PKGS="graphicsmagick imagemagick pngquant libimage-exiftool-perl libgd3"

# Stage: build the Kahuna frontend (webpack production bundle). Uses the official
# Node image because this throwaway build stage only needs Node + npm.
FROM node:${NODE_VERSION}-bookworm AS frontend

WORKDIR /build/kahuna

# Install dependencies first for better layer caching.
COPY kahuna/package.json kahuna/package-lock.json ./
RUN npm ci

# Build the production bundle into kahuna/public/dist.
COPY kahuna/ ./
RUN npm run dist

# Stage: shared JDK + sbt toolchain used by both `backend` (prod) and `dev`.
FROM eclipse-temurin:11-jdk-jammy AS toolchain

ARG SBT_VERSION

# Install sbt from the official release tarball.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl ca-certificates; \
    curl -fLo /tmp/sbt.tgz "https://github.com/sbt/sbt/releases/download/v${SBT_VERSION}/sbt-${SBT_VERSION}.tgz"; \
    tar -xzf /tmp/sbt.tgz -C /opt; \
    ln -s /opt/sbt/bin/sbt /usr/local/bin/sbt; \
    rm -f /tmp/sbt.tgz; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Stage: compile and stage the Play services with sbt (prod path).
FROM toolchain AS backend

# Copy the full repository (build context is the repo root). A .dockerignore
# keeps target/, node_modules/ and logs/ out of the context.
COPY --exclude=e2e-tests/images . .

# Drop in the pre-built frontend so `kahuna/stage` packages the bundled assets.
COPY --from=frontend /build/kahuna/public/dist ./kahuna/public/dist

# Stage every requested service in a single sbt invocation to share compilation.
RUN sbt \
      "auth/stage" \
      "collections/stage" \
      "cropper/stage" \
      "image-loader/stage" \
      "kahuna/stage" \
      "leases/stage" \
      "media-api/stage" \
      "metadata-editor/stage" \
      "thrall/stage"

# Stage: slim ci image with native image tooling and all services (grid-e2e-ci).
FROM eclipse-temurin:11-jre-jammy AS ci

ARG NATIVE_PKGS

# Native tools used by the image processing services (see repo Brewfile).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ${NATIVE_PKGS}; \
    rm -rf /var/lib/apt/lists/*

# Staged apps expect their config at /usr/share/<service>/conf/application.conf
# and write gc logs to /var/log/<service>/ (see build.sbt javaOptions).
COPY --from=backend /build/auth/target/universal/stage            /usr/share/auth
COPY --from=backend /build/collections/target/universal/stage     /usr/share/collections
COPY --from=backend /build/cropper/target/universal/stage         /usr/share/cropper
COPY --from=backend /build/image-loader/target/universal/stage    /usr/share/image-loader
COPY --from=backend /build/kahuna/target/universal/stage          /usr/share/kahuna
COPY --from=backend /build/leases/target/universal/stage          /usr/share/leases
COPY --from=backend /build/media-api/target/universal/stage       /usr/share/media-api
COPY --from=backend /build/metadata-editor/target/universal/stage /usr/share/metadata-editor
COPY --from=backend /build/thrall/target/universal/stage          /usr/share/thrall

RUN set -eux; \
    for svc in auth collections cropper image-loader kahuna leases media-api metadata-editor thrall; do \
      mkdir -p "/var/log/$svc"; \
    done

COPY e2e-tests/images/entrypoint.common.sh /usr/local/bin/entrypoint.common.sh
COPY e2e-tests/images/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# The Java SDK CBOR protocol is disabled for Localstack/Kinesis compatibility.
ENV AWS_CBOR_DISABLE=true

# media-api, thrall, image-loader, kahuna, cropper, metadata-editor, collections, auth, leases
EXPOSE 9001 9002 9003 9005 9006 9007 9010 9011 9012

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Stage: development image (grid-e2e-dev). JDK + sbt + Node + native tooling in a
# single stage with warmed caches, running services under `sbt <svc>/run`.
FROM toolchain AS dev

ARG NODE_VERSION
ARG NATIVE_PKGS
# Provided automatically by BuildKit (e.g. amd64, arm64).
ARG TARGETARCH

# xz-utils is needed to unpack the Node tarball; the native tools mirror the
# ci stage.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends xz-utils ${NATIVE_PKGS}; \
    rm -rf /var/lib/apt/lists/*

# Install Node (pinned to match kahuna's required version) from the official
# tarball so `npm run watch` matches local development.
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) node_arch=x64 ;; \
      arm64) node_arch=arm64 ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fLo /tmp/node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"; \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --no-same-owner; \
    rm -f /tmp/node.tar.xz; \
    node --version; \
    npm --version

# Warm the sbt dependency cache (~/.ivy2, ~/.sbt, ~/.cache/coursier). These live
# under $HOME, so a runtime bind-mount over /build does not shadow them: the
# first runtime compile only needs to compile sources, not re-resolve deps.
# Copying just the build definition keeps this layer cached across source edits.
COPY build.sbt ./
COPY project/ ./project/
RUN sbt update

# Warm Kahuna's node_modules. The dockerignore keeps node_modules out of the
# build context, so this install is not clobbered by the COPY below.
COPY kahuna/package.json kahuna/package-lock.json ./kahuna/
RUN cd kahuna && npm ci

# Copy the rest of the source so the image is runnable standalone; a runtime
# bind-mount of the repo over /build overrides this for live editing.
COPY . .

COPY e2e-tests/images/entrypoint.dev.sh /usr/local/bin/entrypoint.dev.sh
RUN chmod +x /usr/local/bin/entrypoint.dev.sh

# The Java SDK CBOR protocol is disabled for Localstack/Kinesis compatibility.
ENV AWS_CBOR_DISABLE=true

# media-api, thrall, image-loader, kahuna, cropper, metadata-editor, collections, auth, leases
# plus the JDWP debug port used when GRID_DEBUG is set.
EXPOSE 9001 9002 9003 9005 9006 9007 9010 9011 9012 5005

ENTRYPOINT ["/usr/local/bin/entrypoint.dev.sh"]

# Stage: default guard. This is the last stage, so a plain `docker build` (no
# --target) builds it and fails, forcing an explicit `--target ci|dev`.
FROM eclipse-temurin:11-jre-jammy AS default
RUN echo 'ERROR: --target is required. Pass --target ci (grid-e2e-ci) or --target dev (grid-e2e-dev) when building the image' >&2; exit 1
