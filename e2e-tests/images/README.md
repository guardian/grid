# Grid all-in-one container

`images/Dockerfile` builds a single container that runs eight Grid Play
services plus Kahuna's compiled frontend:

| Service           | Port |
| ----------------- | ---- |
| `media-api`       | 9001 |
| `thrall`          | 9002 |
| `kahuna` (+ UI)   | 9005 |
| `cropper`         | 9006 |
| `metadata-editor` | 9007 |
| `collections`     | 9010 |
| `auth`            | 9011 |
| `leases`          | 9012 |

## Build

Build from the **repository root** (the build context must be the repo root):

```bash
DOCKER_BUILDKIT=1 docker build -f images/Dockerfile -t grid-all .
```

The build has three stages:

1. **frontend** — `node:22.12.0` builds the Kahuna webpack bundle
   (`npm ci && npm run dist`).
2. **backend** — `eclipse-temurin:11-jdk` installs sbt and stages all eight
   services (`sbt <service>/stage`), packaging the frontend assets into Kahuna.
3. **runtime** — `eclipse-temurin:11-jre` with the native image tools
   (`graphicsmagick`, `imagemagick`, `pngquant`, `exiftool`, `libgd3`) and the
   staged apps under `/usr/share/<service>`.

## Runtime configuration

Configuration is **not** baked into the image. At runtime each service loads
`/etc/grid/common.conf` and `/etc/grid/<service>.conf` (and reads the stage
from `/etc/grid/stage`; defaults to `DEV`). Mount your environment's config in:

```bash
docker run --rm \
  -v "$PWD/my-config:/etc/grid:ro" \
  -p 9001:9001 -p 9002:9002 -p 9005:9005 -p 9006:9006 \
  -p 9007:9007 -p 9010:9010 -p 9011:9011 -p 9012:9012 \
  grid-all
```

The services still need their backing infrastructure (Elasticsearch, S3/
DynamoDB/Kinesis/SNS/SQS, the image resizer, auth provider) to be reachable —
see the root `docker-compose.yml` for the local dev topology.

## Selecting services

Run a subset via `GRID_SERVICES` (space-separated), and append JVM options with
`GRID_JAVA_OPTS`:

```bash
docker run --rm -e GRID_SERVICES="media-api kahuna auth" grid-all
```

If any running service exits, the container stops.
