# Running Grid as containers

Each Grid app (`auth`, `collections`, `cropper`, `image-loader`, `kahuna`, `leases`, `media-api`,
`metadata-editor`, `thrall`, `usage`) can be built as a container image.
On `main`, [`cd.yml`](../../.github/workflows/cd.yml) builds each image and publishes it to ECR
(`guardian/grid/<app>`) using `guardian/actions-ecr/push`.

## Build locally

> [!IMPORTANT]
> `kahuna` needs its client-side assets first: `cd kahuna && npm install-clean && npm run dist`.

Build all of the container images with the following command:

```shell script
sbt Docker/publishLocal
```
Notes on the image:
- Base image is `amazoncorretto:25-alpine`. Some services such as `image-loader`, `cropper` and `media-api` also include GraphicsMagick, ExifTool and libvips.
- In ECS the task id (from the task metadata endpoint) is used as the instance id in logs.
- `docker compose` does not rebuild the image on redeploy, a manual `sbt Docker/publishLocal` needs to be ran after code changes.

## Test with docker compose

The `containers` profile in [`docker-compose.yml`](../../docker-compose.yml) runs the locally built images against the
usual compose services. It needs `./dev/script/setup.sh --no-auth` to have been run first (it populates localstack
and generates `~/.grid`, which is mounted read-only into each container).

```shell script
docker compose --profile containers up -d --wait
docker compose --profile containers down
```

Apps are exposed on the same host ports as when run with sbt (e.g. media-api on `9001`), so dev-nginx routes to them; stop any sbt-run apps first. Set `GRID_IMAGE_VERSION` to test a tag other than `DEV`.

### Localstack seeding

Localstack does not persist its state. Instead, the scripts in [`dev/localstack/ready.d`](../../dev/localstack/ready.d) run each time localstack starts: they create the `grid-dev-core` CloudFormation stack (which has fixed resource names) and upload the config files and API key. `up` and `down` therefore always reseed it, and `~/.grid` stays valid. App containers wait for localstack to be healthy, which happens once seeding completes.

If you have localstack data from before this change, re-run `./dev/script/setup.sh --no-auth --clean`. The `--with-local-auth` stack is still created by `setup.sh` and is not reseeded automatically.
