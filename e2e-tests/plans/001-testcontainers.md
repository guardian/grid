# Testcontainers setup for e2e-tests

Add a Testcontainers-driven setup to the Playwright `e2e-tests/` project that boots the
pre-built **grid-all** image (from `e2e-tests/images/Dockerfile`) alongside
**Elasticsearch** and **LocalStack**, fully provisions the backing AWS resources in
LocalStack, generates real service config by **reusing the existing
`service-config.js`**, and runs all 8 Grid services — wired through Playwright's
`globalSetup`/`globalTeardown`.

## Decisions
- **Scope:** grid-all container + Elasticsearch + LocalStack. Skip imgops & oidc for now.
- **Image source:** assume the `grid-all` image is already built; do not build in tests.
- **Config:** full provisioning — apply the CloudFormation core stack, seed buckets, and
  generate per-service config from stack outputs; mount at `/etc/grid`.
- **Config generation:** reuse `dev/script/generate-config/service-config.js`
  (`getCoreConfigs`) rather than reimplementing.
- **Services:** start all 8 services (the `entrypoint.sh` default `GRID_SERVICES`).
- **Lifecycle:** Playwright `globalSetup` / `globalTeardown`; expose `baseURL` via env.

## Key facts
- grid-all runs 8 Play services. Ports: media-api 9001, thrall 9002, kahuna 9005,
  cropper 9006, metadata-editor 9007, collections 9010, auth 9011, leases 9012.
  Kahuna (9005) is the UI entrypoint -> `baseURL` target.
- Config not baked in: each service loads `/etc/grid/common.conf` +
  `/etc/grid/<svc>.conf`, stage from `/etc/grid/stage` (default DEV). `entrypoint.sh`
  respects `GRID_SERVICES`/`GRID_JAVA_OPTS`. `ENV AWS_CBOR_DISABLE=true` is set.
- Backing infra (docker-compose.yml): elasticsearch 8.18.3 (9200); localstack 4.5.0
  (4566; `SERVICES=cloudformation,cloudwatch,dynamodb,kinesis,s3,sns,sqs,iam`, eu-west-1).

## Provisioning details (from setup.sh / generate-config)
- CFN core stack `dev/cloudformation/grid-dev-core.yml` creates: Kinesis streams
  (`media-service-DEV-thrall`, low-priority), SQS `IngestSqsQueue`, S3 buckets
  (Ingest/Fail, Image, Thumb, Reaper, Quarantine, Key, ImageOrigin, Config, Collections,
  UsageMail), DynamoDB tables (Syndication, Edits, SoftDeletedMetadata, etc).
- Seed: upload API key (`"DEV Key"`) to KeyBucket; `dev/config/photographers.json`,
  `rcs-quota.json`, `usage_rights.json` to ConfigBucket; `usages.eml` to UsageMailBucket.
- `generate-config.js` reads CFN stack resources via the AWS SDK and feeds
  `service-config.js` (`getCoreConfigs`) to write per-service `.conf` + `common.conf`.
  Defaults come from `config.json5` (es cluster `media-service`, shards 1, replicas 0).
- **Reuse strategy:** `require` `service-config.js` from `e2e-tests`. Do NOT run
  `generate-config.js` directly (it writes to `~/.grid` and assumes AWS SDK v2 + `.env`).
  Instead build the config object ourselves from live CFN stack resources
  (LogicalResourceId -> PhysicalResourceId map) + `config.json5` defaults + `DOMAIN`,
  call `ServiceConfig.getCoreConfigs`, then post-process.
- **Critical adaptation:** on a Testcontainers network the grid-all container must reach
  ES/LocalStack via network **aliases** (`http://elasticsearch:9200`,
  `http://localstack:4566`), not `localhost` — post-process `es6.url` /
  `aws.local.endpoint` accordingly. Run in **NO_AUTH** mode
  (`LocalAuthenticationProvider`/`LocalAuthorisationProvider`) to skip pan-domain/oidc.

## Steps

### Phase 1 — Dependencies
1. Add dev deps to `e2e-tests/package.json`: `testcontainers`,
   `@testcontainers/localstack`, `@aws-sdk/client-cloudformation`, `@aws-sdk/client-s3`,
   plus `json5` (to load `config.json5`). ES via `GenericContainer` or
   `@testcontainers/elasticsearch`. Add a `test` script.

### Phase 2 — Infra containers (`global-setup.ts`)
2. Create a shared Testcontainers `Network`.
3. Start Elasticsearch (`docker.elastic.co/.../elasticsearch:8.18.3`, single-node,
   security disabled) with alias `elasticsearch`.
4. Start LocalStack (`localstack:4.5.0`, the required `SERVICES`, region `eu-west-1`)
   with alias `localstack`.

### Phase 3 — Provisioning (`global-setup.ts`)
5. Apply `grid-dev-core.yml` via the CloudFormation client against LocalStack; wait for
   `CREATE_COMPLETE`; read stack resources into a logical->physical name map.
6. Seed buckets: API key -> KeyBucket; config JSON -> ConfigBucket; `usages.eml` ->
   UsageMailBucket (reuse files in `dev/config/`).
7. Generate service config by **reusing `service-config.js`**: `require` `ServiceConfig`,
   build a config object from the live CFN stack resources + `config.json5` defaults +
   `DOMAIN`, call `getCoreConfigs`, then post-process `es6.url` / `aws.local.endpoint`
   to the network aliases. Write results to `e2e-tests/.tmp-config`. Set `NO_AUTH=true`
   so `common.conf` uses the Local auth/authorisation providers.

### Phase 4 — App container (`global-setup.ts`)
8. Start grid-all (pre-built tag) on the network with default `GRID_SERVICES` (all 8),
   AWS creds/endpoint env + `AWS_CBOR_DISABLE`, bind-mount `.tmp-config` -> `/etc/grid`,
   expose 9001/9002/9005/9006/9007/9010/9011/9012.
9. Wait strategies: ES healthy, then kahuna HTTP 200 on 9005 (generous timeout). Export
   `baseURL` (fixed 9005 host port) via `process.env` + a temp file for teardown.

### Phase 5 — Teardown & Playwright wiring
10. `global-teardown.ts`: stop grid-all/ES/LocalStack, remove the network, clean `.tmp-config`.
11. `playwright.config.ts`: set `globalSetup`/`globalTeardown`, `use.baseURL` from env,
    keep browser projects, bump the global/test timeout for slow boot.
12. Author the smoke scenarios as Gherkin `.feature` files with `playwright-bdd` steps
    that hit the local `baseURL` (kahuna) instead of `playwright.dev`.
13. Update `.github/workflows/playwright.yml`: ensure Docker is available and the
    `grid-all` image is built before tests; run via `npm test` so `bddgen` generates the
    test files first. Under `CI=true` a bundled Caddy proxy stands in for dev-nginx.

## Relevant files
- `e2e-tests/global-setup.ts` (new) — network, infra, provisioning, config gen, app container
- `e2e-tests/global-teardown.ts` (new) — teardown
- `e2e-tests/.tmp-config/` (generated) — mounted at `/etc/grid`
- `e2e-tests/playwright.config.ts` — `globalSetup`/`globalTeardown`, `baseURL`, timeout
- `e2e-tests/package.json` — deps + scripts
- `e2e-tests/images/entrypoint.sh` — reference for `GRID_SERVICES`/ports
- `dev/cloudformation/grid-dev-core.yml` — resources to provision
- `dev/script/setup.sh` — reference for provisioning + seeding flow
- `dev/script/generate-config/service-config.js` — **reused** for config generation
- `dev/script/generate-config/config.json5` — default config values consumed by reuse
- `dev/config/*` — seed data (photographers, quotas, usage rights, usages.eml)

## Verification
1. `cd e2e-tests && npm install` succeeds with new deps.
2. `npm test` starts ES + LocalStack, provisions the CFN
   stack, seeds buckets, generates config via `service-config.js`, boots grid-all, kahuna
   responds on 9005, and the smoke test passes.
3. Teardown removes all containers/network and `.tmp-config` (verify with `docker ps`).
4. Re-run to confirm no leaked containers/networks between runs.

## Notes
- Reusing `service-config.js` keeps parity with dev. Watch for: it's CommonJS, relies on
  `config.json5` (needs `json5`) and `DOMAIN`/env inputs; the `aws.local.endpoint` and
  `es6.url` values are Guardian-domain/localhost-oriented and must be post-processed to
  the Testcontainers network aliases.
