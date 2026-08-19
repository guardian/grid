# Grid E2E test images

A single `Dockerfile` builds a single-container image (`grid-e2e-ci`) that runs
eight Grid Play services plus Kahuna's frontend. It stages pre-compiled
artefacts and runs them in a production-style JRE.

## Build

Build from the **repository root** (the build context must be the repo root):

```bash
DOCKER_BUILDKIT=1 docker build -f e2e-tests/images/Dockerfile -t grid-e2e-ci .
```

## Runtime configuration

Configuration is not baked into the image. At runtime each service loads
`/etc/grid/common.conf` and `/etc/grid/<service>.conf` (and reads the stage
from `/etc/grid/stage`; defaults to `DEV`). Mount your environment's config with:

```bash
docker run --rm \
  -v "$PWD/my-config:/etc/grid:ro" \
  -p 9001:9001 -p 9002:9002 -p 9005:9005 -p 9006:9006 \
  -p 9007:9007 -p 9010:9010 -p 9011:9011 -p 9012:9012 \
  grid-e2e-ci
```
