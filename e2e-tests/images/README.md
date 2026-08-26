c# Grid E2E test images

A single `Dockerfile` produces two single-container images that run nine
Grid Play services plus Kahuna's frontend. You can select between CI and local-dev images using the `--target` parameter:
- **CI image** (`--target ci`, tagged `grid-e2e-ci`): stages pre-compiled artefacts and runs them in a production-style JRE. Used by the e2e-tests testcontainers harness.
- **Local-dev image** (`--target dev`, tagged `grid-e2e-dev`): runs the services under `sbt <svc>/run` (Play dev mode) with the repo bind-mounted, so source changes recompile live. See [Development image (live reload)](#development-image-live-reload) below.

`--target` is required — a plain `docker build` fails with a reminder.

## Build

Build from the **repository root** (the build context must be the repo root):

```bash
DOCKER_BUILDKIT=1 docker build --target <ci|dev> -f e2e-tests/images/Dockerfile -t grid-e2e-<ci|dev> .
```

## Runtime configuration

Configuration is not baked into the image. At runtime each service loads
`/etc/grid/common.conf` and `/etc/grid/<service>.conf` (and reads the stage
from `/etc/grid/stage`; defaults to `DEV`). Mount your environment's config with:

```bash
docker run --rm \
  -v "$PWD/my-config:/etc/grid:ro" \
  -p 9001:9001 -p 9002:9002 -p 9003:9003 -p 9005:9005 -p 9006:9006 \
  -p 9007:9007 -p 9010:9010 -p 9011:9011 -p 9012:9012 \
  grid-e2e-[ci|dev]
```

## Development image (live reload)

The `--target dev` build is for local development. Instead of staging compiled
artefacts it runs the services under `sbt <svc>/run` (Play dev mode), so changed Scala sources are recompiled on the next request. When `kahuna` is selected its webpack bundle is rebuilt continuously via `npm run watch`.

Build from the repository root:

```bash
DOCKER_BUILDKIT=1 docker build --target dev -f e2e-tests/images/Dockerfile -t grid-e2e-dev .
```

Run with the repo bind-mounted over `/build` so host edits are picked up live,
and your DEV config mounted at `/root/.grid`:

```bash
docker run --rm \
  -v "$PWD:/build" \
  -v "$HOME/.grid:/root/.grid:ro" \
  -p 9001:9001 -p 9005:9005 -p 9011:9011 \
  grid-e2e-dev
```

### Options

All configurable via environment variables:

| Variable                | Default              | Purpose                                                        |
| ----------------------- | -------------------- | -------------------------------------------------------------- |
| `GRID_DEBUG`            | _(unset)_            | If set, opens a debug server on port `5005` (also `EXPOSE`d). |

```bash
docker run --rm -v "$PWD:/build" -v "$HOME/.grid:/root/.grid:ro" \
  -e GRID_DEBUG=1 \
  -p 9001:9001 -p 9005:9005 -p 5005:5005 \
  grid-e2e-dev
```

The services still need their backing infrastructure reachable (see the root
`docker-compose.yml`). The image also works against the e2e-tests testcontainers harness: mount the generated config the same way the CI image does (to`/root/.grid` and/or `/etc/grid`) and join the same network.
