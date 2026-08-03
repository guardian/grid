# Grid e2e container

A single `Dockerfile` produces two single-container images that run eight
Grid Play services plus Kahuna's frontend, selected with `--target`:

- **CI image** (`--target ci`, tagged `grid-e2e-ci`): stages pre-compiled artefacts and runs them in a production-style JRE. Used by the e2e-tests testcontainers harness.
- ** Dev image** (`--target dev`, tagged `grid-e2e-dev`): runs the services under `sbt <svc>/run` (Play dev mode) with the repo bind-mounted, so source changes recompile live. See [Development image (live reload)](#development-image-live-reload) below.

`--target` is required — a plain `docker build` fails with a reminder.

## Build for CI

Build from the **repository root** (the build context must be the repo root):

```bash
DOCKER_BUILDKIT=1 docker build --target ci -f images/Dockerfile -t grid-e2e-ci .
```

The `grid-e2e-ci` build uses these stages:

1. **frontend** — the official `node:22.12.0` image builds the Kahuna webpack
   bundle (`npm ci && npm run dist`).
2. **toolchain** — `eclipse-temurin:11-jdk` installs sbt (shared with the dev
   image).
3. **backend** — from `toolchain`, stages all eight services
   (`sbt <service>/stage`), packaging the frontend assets into Kahuna.
4. **ci** — `eclipse-temurin:11-jre` with the native image tools
   (`graphicsmagick`, `imagemagick`, `pngquant`, `exiftool`, `libgd3`) and the
   staged apps under `/usr/share/<service>`.

### Configuration

Configuration is **not** baked into the image. At runtime each service loads
`/etc/grid/common.conf` and `/etc/grid/<service>.conf` (and reads the stage
from `/etc/grid/stage`; defaults to `DEV`). Mount your environment's config in:

```bash
docker run --rm \
  -v "$PWD/my-config:/etc/grid:ro" \
  -p 9001:9001 -p 9002:9002 -p 9005:9005 -p 9006:9006 \
  -p 9007:9007 -p 9010:9010 -p 9011:9011 -p 9012:9012 \
  grid-e2e-ci
```

## Build for development (live reload)

The `--target dev` build is for local development: instead of staging compiled
artefacts it runs the services under `sbt <svc>/run` (Play dev mode), so changed
Scala sources are recompiled on the next request. When `kahuna` is selected its
webpack bundle is rebuilt continuously via `npm run watch`.

Build from the **repository root**:

```bash
DOCKER_BUILDKIT=1 docker build --target dev -f e2e-tests/images/Dockerfile -t grid-e2e-dev .
```

The `dev` stage shares the `toolchain` (JDK + sbt) base with the CI build and
adds Node (installed from the official tarball to match kahuna's pinned
version) plus the native image tools. It warms the sbt dependency cache
(`sbt update`) and Kahuna's `node_modules` (`npm ci`) so the first run only has
to compile sources.

Run with the repo bind-mounted over `/build` so host edits are picked up live,
and your DEV config mounted at `/root/.grid`:

```bash
docker run --rm \
  -v "$PWD:/build" \
  -v "$HOME/.grid:/root/.grid:ro" \
  -p 9001:9001 -p 9005:9005 -p 9011:9011 \
  grid-e2e-dev
```

Because the services run in Play **dev mode**, no `play.http.secret.key` is
required (it is auto-generated), unlike the CI image's production-style run.
Edit a `.scala` file on the host and hit an endpoint to trigger a recompile;
edit a Kahuna asset and the webpack watcher rebuilds `public/dist`.

### Options

All configurable via environment variables:

| Variable                | Default              | Purpose                                                        |
| ----------------------- | -------------------- | -------------------------------------------------------------- |
| `GRID_DEBUG`            | _(unset)_            | If set, opens a JDWP debug server on port `5005` (also `EXPOSE`d). |

```bash
docker run --rm -v "$PWD:/build" -v "$HOME/.grid:/root/.grid:ro" \
  -e GRID_DEBUG=1 \
  -p 9001:9001 -p 9005:9005 -p 5005:5005 \
  grid-e2e-dev
```

The services still need their backing infrastructure reachable (see the root
`docker-compose.yml`). The image also works against the e2e-tests testcontainers
harness: mount the generated config the same way the CI image does (to
`/root/.grid` and/or `/etc/grid`) and join the same network.
