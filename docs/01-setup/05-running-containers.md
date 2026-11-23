# Running Grid as containers

Each Grid app (`auth`, `collections`, `cropper`, `image-loader`, `kahuna`, `leases`, `media-api`,
`metadata-editor`, `thrall`, `usage`) can be built as a container image with sbt-native-packager.
On `main`, [`cd.yml`](../../.github/workflows/cd.yml) builds each image and publishes it to ECR
(`guardian/grid/<app>`) using `guardian/actions-ecr/push`.

## Build locally

```shell script
sbt "auth/Docker/publishLocal"   # or any other app; images are named after the app, tagged $BUILD_NUMBER or DEV
```

`kahuna` needs its client-side assets first: `cd kahuna && npm install-clean && npm run dist`.

Notes on the image:
- Base image is `amazoncorretto:25-alpine`; `image-loader`, `cropper` and `media-api` also include GraphicsMagick, ExifTool and libvips.
- The app listens on port `9000`, and is laid out as in the `.deb` (`/usr/share/<app>`), so the same `-Dconfig.file`/`-Dlogger.file` options apply.
- Outside `DEV` the AWS SDK default credentials provider chain is used (e.g. the ECS task role); the `media-service` profile is only used in `DEV`.
- In ECS the task id (from the task metadata endpoint) is used as the instance id in logs.
- `docker compose` does not rebuild the image on redeploy, a manual `sbt Docker/publishLocal` needs to be ran after code changes.

## Test with docker compose

The `containers` profile in [`docker-compose.yml`](../../docker-compose.yml) runs the locally built images against the
usual compose services. It needs `./dev/script/setup.sh --no-auth` to have been run first (it populates localstack
and generates `~/.grid`, which is mounted read-only into each container).

```shell script
docker compose --profile containers up -d --wait   # waits for every app's /management/healthcheck
docker compose --profile containers down
```

Apps are exposed on the same host ports as when run with sbt (e.g. media-api on `9001`), so dev-nginx routes to them; stop any sbt-run apps first. Set `GRID_IMAGE_VERSION` to test a tag other than `DEV`.

### Restarting localstack

Localstack does not persist its state, so recreating or restarting it (including via `up --force-recreate`, which recreates the services the apps depend on) removes the buckets and queues the apps need, and they will fail with errors such as `NoSuchBucketException` or `QueueDoesNotExistException`.

If that happens, repopulate localstack and then recreate only the app containers:

```shell script
./dev/script/setup.sh --no-auth
docker compose --profile containers up -d --force-recreate --no-deps <app>...
```
