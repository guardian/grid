# End-to-end tests

Playwright + [`playwright-bdd`](https://vitalets.github.io/playwright-bdd/) e2e tests that
run against a full Grid stack. Scenarios live in [`features/`](features) (Gherkin) with the
step definitions in [`steps/`](steps).

## Running the tests

### 1. CI (production mode)

This is what [`.github/workflows/playwright.yml`](../.github/workflows/playwright.yml) does,
and how you reproduce a CI failure locally:

```bash
# From the repo root: build the CI image the harness runs.
DOCKER_BUILDKIT=1 docker build --target ci -f e2e-tests/images/Dockerfile -t grid-e2e-ci .

cd e2e-tests
npm ci
npx playwright install --with-deps chromium
npm test
```

`grid-e2e-ci` ([`images/Dockerfile`](images/Dockerfile)) bind-mounts the repo over
`/build`, builds Kahuna's production bundle once (`npm ci` + `npm run dist`), stages
the services with `sbt e2eStage` and runs the staged applications in production mode,
so it exercises the same code paths as a deployed Grid. No source or compiled artefacts
are baked into the image, so the build is quick and staging happens on first run.
There is no dev-nginx in CI, so when `CI=true` `global-setup` also starts a bundled
Caddy reverse proxy on `:443` that replays dev-nginx's subdomain routing for the
`https://*.media.<domain>` browser origins.

The harness applies both development CloudFormation templates to LocalStack, seeds Panda
settings and permissions from [`fixtures/`](fixtures), and builds the local provider from
[`dev/oidc-provider`](../dev/oidc-provider). Browser scenarios sign in through Panda and
OIDC as `grid-e2e-account@guardian.co.uk`; authentication is not bypassed.

### 2. Dev (live recompilation)

For iterating on failing tests you can run the services from source with live reload using
the dev image, which runs
`sbt <svc>/run` (recompiling on change) and rebuilds Kahuna's webpack bundle via
`npm run watch`. See [`images/README.md`](images/README.md) for how to build and run it.

Useful commands:

```bash
npm run test:headed     # run with a visible browser
npm run test:video      # run and keep videos for all tests, including passing tests
npm run test:report     # open the last HTML report
npm run test:ui         # open browser and test suite, run tests at your leisure
```

Videos are saved under `test-results/` and attached to the HTML report. Playwright
clears previous test results on the next run, so move recordings elsewhere to archive them.

### Feature library

Browse the Gherkin specifications alongside their recorded scenarios:

```bash
npm run features:serve
```

Open the printed URL (normally `http://localhost:4173`) in a browser. The library
uses the existing `features/` files and `playwright-report/`; it does not boot the
Grid stack or run tests. Use `npm run test:video` first to capture fresh recordings,
then restart the viewer to rebuild its snapshot. No recordings are required to
browse the specifications, including scenarios marked `@todo`.

Search scenario names and steps, filter by feature or outcome, and use the link
button to share a scenario within a hosted snapshot. Each scenario includes its
background, steps, tables and examples, plus available recordings across browser
projects and retries. Videos have native playback, seeking and fullscreen controls,
a speed selector, and a download button. Use a regular browser for WebM playback;
some embedded editor browsers do not support its video codecs.

```bash
npm run features:serve -- --port 4180
npm run features:serve -- --report /path/to/archived/playwright-report
npm run features:build       # export a static snapshot, including its videos
npm run features:test        # parser, report matching and HTTP tests; no Grid stack
npm run features:typecheck   # strict TypeScript check for the viewer and tooling
npm run features:test:browser # React viewer workflows and video playback in Chromium
```

The viewer uses plain React and TypeScript, with `lucide-react` icons and an esbuild
browser bundle. Its importer, static exporter, local server and tests are also
TypeScript, executed with `tsx`. Both build and serve commands run the strict
typecheck first. No React routing or server-side rendering framework is required.
The browser test uses temporary fixtures, needs Playwright Chromium installed
(`npx playwright install chromium`), and does not start the Grid stack.

The export is written to `dist/feature-library/`. Serve or archive the whole directory
to keep its recordings independently of later test runs. It has no CDN or network
dependencies, but needs an HTTP static host rather than opening `index.html` directly.
Builds replace the snapshot and remove videos no longer referenced by it.

Results are matched by feature path, rule and scenario name using the embedded
Playwright HTML report data. Ambiguous names are left unmatched instead of guessing.
Definitions come from the current working tree, so use the matching feature revision
when viewing an older report. The run date identifies the report snapshot; it does
not imply that the current specification has been rerun. Renamed or unrun scenarios
remain visible without results. The importer supports the current Playwright report
format and fails explicitly if a future format cannot be read.

Exports include feature text and captured browser contents. Review recordings for
sensitive data and use an appropriately restricted host before sharing them.

Traces are captured `on-first-retry` (see [`playwright.config.ts`](playwright.config.ts)),
so a failed test on CI leaves a trace you can open with `npx playwright show-trace`.

## Running the stack without the tests

`npm run dev:e2e` boots exactly the same stack the tests use, prints the service URLs and
holds it open until you press Ctrl-C, which tears it all down.

```bash
npm run dev:e2e                  # uses your local dev-nginx for the https://*.media.<domain> domains
GRID_PROXY=true npm run dev:e2e  # no dev-nginx? start the bundled Caddy proxy on :443 instead
```

The stack binds fixed host ports, so two stacks cannot run
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
| `GRID_RESEED=true` | Reload the Elasticsearch fixtures and seeded collections into the reused stack. |

**Watch out for stale provisioning.** A reused stack picks up Scala changes (the repo is
bind-mounted and services run under `sbt run`), but *not* changes to anything applied at
boot: generated service config, CloudFormation templates, bucket contents, OIDC users,
permissions, Elasticsearch fixtures or seeded collections. After changing any of those, restart `dev:e2e`.

Reuse also means state carries over between runs. The current suite is read-only, so this
is harmless today, but a test that uploads or edits an image will want a fresh stack.
