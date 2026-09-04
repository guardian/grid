# End-to-end tests

Playwright + [`playwright-bdd`](https://vitalets.github.io/playwright-bdd/) e2e tests that
run against a full Grid stack. Scenarios live in [`features/`](features) (Gherkin) with the
step definitions in [`steps/`](steps).

## Running the tests

### 1. CI (production mode)

This is what [`.github/workflows/playwright.yml`](../.github/workflows/playwright.yml) does,
and how you reproduce a CI failure locally:

```bash
# From the repo root: build the production image the harness runs.
DOCKER_BUILDKIT=1 docker build --target ci -f e2e-tests/images/Dockerfile -t grid-e2e-ci .

cd e2e-tests
npm ci
npx playwright install --with-deps chromium
npm test
```

`grid-e2e-ci` ([`images/Dockerfile`](images/Dockerfile)) stages the services with `sbt stage`
and runs them under a production JRE, so it exercises the same code paths as a deployed
Grid. There is no dev-nginx in CI, so when `CI=true` `global-setup` also starts a bundled
Caddy reverse proxy on `:443` that replays dev-nginx's subdomain routing for the
`https://*.media.<domain>` browser origins.

### 2. Dev (live recompilation)

For iterating on failing tests you can run the services from source with live reload using
the dev image, which runs
`sbt <svc>/run` (recompiling on change) and rebuilds Kahuna's webpack bundle via
`npm run watch`. See [`images/README.md`](images/README.md) for how to build and run it.

Useful commands:

```bash
npm run test:headed     # run with a visible browser
npm run test:report     # open the last HTML report
npm run test:ui         # open browser and test suite, run tests at your leisure
```

Traces are captured `on-first-retry` (see [`playwright.config.ts`](playwright.config.ts)),
so a failed test on CI leaves a trace you can open with `npx playwright show-trace`.

## Running the stack without the tests

`npm run dev:e2e` boots exactly the same stack the tests use, prints the service URLs and
holds it open until you press Ctrl-C, which tears it all down.

```bash
npm run dev:e2e                  # uses your local dev-nginx for the https://*.media.<domain> domains
GRID_PROXY=true npm run dev:e2e  # no dev-nginx? start the bundled Caddy proxy on :443 instead
```

The stack binds fixed host ports (9001-9012, 4566, 9008, 9200), so two stacks cannot run
at once. Starting a second one fails immediately rather than timing out.

### Running the tests against a stack you already started

The test commands reuse a running stack instead of booting their own, which turns a
multi-minute boot into a couple of seconds. Leave `npm run dev:e2e` running in one
terminal, then use `npm test`, `npm run test:ui` or any of the others as normal — they
attach automatically and leave the stack running when they finish.

If only some services are up (usually because the stack is still booting), the run stops
straight away and names the ports it is waiting on.

| Variable | Effect |
| --- | --- |
| `GRID_RESEED=true` | Reload the Elasticsearch fixtures into the reused stack. |

**Watch out for stale provisioning.** A reused stack picks up Scala changes (the repo is
bind-mounted and services run under `sbt run`), but *not* changes to anything applied at
boot: generated service config, the CloudFormation template, bucket contents, permissions
or the Elasticsearch fixtures. After changing any of those, restart `dev:e2e`.

Reuse also means state carries over between runs. The current suite is read-only, so this
is harmless today, but a test that uploads or edits an image will want a fresh stack.
