# syntax=docker/dockerfile:1

# Single-container image that builds and runs eight Grid Play services
# (auth, collections, cropper, kahuna, leases, media-api, metadata-editor,
# thrall) together with Kahuna's frontend.
#
# The image (grid-e2e-ci) stages pre-compiled artefacts and runs them:
#       docker build -f e2e-tests/images/Dockerfile -t grid-e2e-ci .
#
# See images/README.md for details.
#
# Runtime configuration is not baked into the image. Mount per-environment
# config (and a stage marker) into /etc/grid at run time, e.g.:
#   docker run --rm -v "$PWD/my-config:/etc/grid" grid-e2e-ci

# Shared build args (single source of truth for both images).
ARG SBT_VERSION=1.10.3
ARG NODE_VERSION=22.12.0
# Native tools used by the image processing services (see repo Brewfile).
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

# Stage: JDK + sbt toolchain used by the `backend` stage.
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
COPY --from=backend /build/kahuna/target/universal/stage          /usr/share/kahuna
COPY --from=backend /build/leases/target/universal/stage          /usr/share/leases
COPY --from=backend /build/media-api/target/universal/stage       /usr/share/media-api
COPY --from=backend /build/metadata-editor/target/universal/stage /usr/share/metadata-editor
COPY --from=backend /build/thrall/target/universal/stage          /usr/share/thrall

RUN set -eux; \
    for svc in auth collections cropper kahuna leases media-api metadata-editor thrall; do \
      mkdir -p "/var/log/$svc"; \
    done

COPY e2e-tests/images/entrypoint.common.sh /usr/local/bin/entrypoint.common.sh
COPY e2e-tests/images/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# The Java SDK CBOR protocol is disabled for Localstack/Kinesis compatibility.
ENV AWS_CBOR_DISABLE=true

# media-api, thrall, kahuna, cropper, metadata-editor, collections, auth, leases
EXPOSE 9001 9002 9005 9006 9007 9010 9011 9012

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
