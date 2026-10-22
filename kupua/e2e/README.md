# Kupua E2E Tests

> Read this before changing browser tests.
> Keep execution reports, completed-work narratives and future-work queues out of this operating guide.

## Directory Structure

```text
kupua/
  e2e/
    local/                         Browser specs selected by playwright.config.ts
    shared/
      helpers.ts                   KupuaHelpers and fixture readiness
      browse-density.ts            Pending browsing/density scenarios
      density-selection.ts         Readiness-free density button lookup
    global-setup.ts                 Local ES startup and safety checks
    scrubber-debug.spec.ts          Headed diagnostic, separate configuration
    tsconfig.json                  E2E TypeScript surface
    README.md
  e2e-perf/                        Performance suites, configs and results
  playwright.config.ts             Local E2E projects and server ownership
  playwright.debug.config.ts       Diagnostic configuration
  playwright.experiments.config.ts Experiment configuration
```

## Test Modes

Run commands from the repository root. Use the npm scripts rather than bare
`npx playwright` or `npm exec`, which can put outputs outside `kupua/`.

| Mode | Command | Data and purpose |
| --- | --- | --- |
| Unit | `npm --prefix kupua test` | In-memory fixtures; required after any `src/` change |
| Local E2E | `npm --prefix kupua run test:e2e -- --retries=0` | Local Docker ES and isolated fixtures; browser regression gate |
| Local E2E with data setup | `npm --prefix kupua run test:e2e:full` | Runner-owned Docker and sample-data setup, then browser tests |
| Performance | `npm --prefix kupua run test:perf` | Operator-run measurement for a specific question, not routine validation |
| Experiment | `npm --prefix kupua run test:experiment` | Separately approved A/B investigation |
| Diagnostic | `npm --prefix kupua run test:diag` | Headed scrubber coordinate-space investigation, not a regression gate |

Keep output live and preserve the command's exit status:

```sh
set -o pipefail; npm --prefix kupua run test:e2e -- --retries=0 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

Use the same foreground/pipefail/tee pattern for other test and build commands.
Do not pipe the live stream through `head`, `tail` or `grep`, poll an active run,
or start another command in its terminal before completion.

### Local Projects and Ports

[playwright.config.ts](../playwright.config.ts) starts the required servers.
Coordinate with the operator before running: ports **3000, 3030 and 3040** must
be free. Do not stop or reconfigure a live app or tunnel yourself.

| Project | Port | Scope |
| --- | --- | --- |
| `chromium` | 3000 | Main local specs; the table-tail history cases also use the runner-owned 3030 origin |
| `forced-seek` | 3030 | Fixed-density seek tests with position maps disabled by the runner |
| `justified-preview` | 3040 | Resident Justified fixtures |
| `justified-indexed` | 3000 | Windowed Justified with normal coordinate thresholds |
| `justified-seek` | 3030 | Windowed Justified with forced-seek coordinates |

[global-setup.ts](global-setup.ts) checks local ES/sample data, starts local Docker
ES when needed and refuses a server connected to a real cluster. Never bypass
that gate or change thresholds to make a test pass. Freeze source/configuration
throughout a run: even comment edits can trigger a browser reload.

### Focused and Interactive Runs

| Need | Command |
| --- | --- |
| One spec | `npm --prefix kupua run test:e2e -- --project=chromium browser-history.spec.ts --retries=0` |
| Title filter | `npm --prefix kupua run test:e2e -- --grep "table tail" --retries=0` |
| Visible browser | `npm --prefix kupua run test:e2e:headed` |
| Step-through debugger | `npm --prefix kupua run test:e2e:debug` |
| Playwright UI | `npm --prefix kupua run test:e2e:ui` |
| Approved visual-baseline update | `npm --prefix kupua run test:e2e -- --project=chromium visual-baseline.spec.ts --update-snapshots` |

## Which Command Do I Run?

| Changed surface | Required verification |
| --- | --- |
| Anything in `src/` | Full unit suite |
| Components, hooks, stores, scroll/focus or layout behaviour | Full unit suite and local E2E; preserve applicable normal, forced-seek and Justified coverage |
| Browser tests or shared fixtures | Focused affected cases, then the relevant full surface; harness changes also need their owning harness checks |
| Documentation only | Documentation/link validation, not an application test campaign |
| Performance workloads or tuning | Follow the separately approved scope and [performance handbook](../e2e-perf/README.md); functional success is not a speed measurement |

Start with a failing or behaviour-scoped check, then run the required full gates
on the retained implementation. Do not weaken assertions, add retries or treat
skips as passes. The application build does not typecheck every E2E/performance
file; use the relevant compiler configuration when those surfaces change and
distinguish new diagnostics from inherited ones.

## Environment Variables

Use normal runner configuration for routine tests. These optional variables are
for an explicitly selected experiment or measurement, not a way around safeguards.

| Variable | Default | Purpose |
| --- | --- | --- |
| `CPU_THROTTLE` | `0` | CDP CPU slowdown through the shared fixture |
| `PERF_STABLE_UNTIL` | Unset | Date cap supplied by the performance runner to bound admission; does not freeze metadata/deletions |
| `EXP_OVERSCAN_TABLE` | `current` | Table overscan experiment |
| `EXP_OVERSCAN_GRID` | `current` | Grid overscan experiment |

App-level Vite configuration and backend selection are described in the
[application README](../README.md) and [infrastructure safeguards](../exploration/docs/infra-safeguards.md).
Performance CLI filters are metric IDs; habitual E2E `--grep` is a Playwright
title regex. See the [performance handbook](../e2e-perf/README.md) for its commands,
measurement boundaries and result formats.

## Shared Helpers

### Session-Aware Density Setup

Use `kupua.startSearch(extraParams, "grid" | "table")` for an independent case;
grid is the default. It initializes the per-tab density, navigates with any corpus
cap and asserts the rendered view. `initializeDensity` uses production preference
handling on an existing document or a removable, one-use CDP seed on a blank one.
This is Chromium setup, not a cross-browser storage guarantee.

`goto`, `gotoWithParams`, `gotoPerfStable`, SPA navigation and reload retain the
case's density. Do not reinitialize during history/persistence controls or clear
all session storage. Density is not a URL parameter; check the rendered region
with `assertDensity` or layout-specific `waitForResults`.

Readiness timeouts append sanitized store/lifecycle counts and region geometry without
changing the predicate, timeout or navigation. On a fresh document, `searchStarted: 0`
means the store has not recorded search admission; `null` means the lifecycle hook is
unavailable. `searchSettled` records idle completion, not successful publication: inspect
`hasError`, `resultsLength`, `total` and visible-item counts alongside it. A started,
loading search can still be awaiting PIT or ticker work after its page read completes.
These snapshots do not identify the pending request or establish a historical failure's cause.

### Density Selection Guard

[getDensityChangeButton](shared/density-selection.ts) returns the exact density
button or `null` when it is already pressed. It does not click, wait for rendering
or cache a locator. Pressed does not mean placed or decoded; the read and click
are not atomic. Callers own generation capture, action-specific readiness and
any performance measurement boundary. Preserve intentional active-toggle tests.

`waitForDensityRow(page, density, imageId)` is a separate captured-identity DOM barrier
for placement samples after generation completion. It waits for that density's row to have
nonzero geometry, without scrolling or waiting for desired coordinates. Callers must still
assert identity, viewport placement and their original tolerances afterward.

### Hit-Tested Input

`waitForHitTestedImagePoint({ view?, imageId?, topInset?, timeout? })` observes a
visible, hit-tested result-cell point below the table header. It returns an
identity/coordinate snapshot, not a click or a promise that layout will remain
unchanged. It does not scroll, wait for media or replace action-specific readiness.
Use exact-ID filtering when identity matters; do not carry an ordinal locator
across virtualization. Stable-nth identity, usable-placement and decoded-media
helpers answer different questions and are not interchangeable.

### Async Fixture Setup

For asynchronous controlled setup, return a retained job from synchronous
`page.evaluateHandle`, with `complete`, nullable `error` and its pending promise.
`waitForFixtureSetup(page, handle)` polls synchronously, throws setup failures and
disposes the handle in `finally`. The timeout bounds setup; it does not retry it.
Do not use an async `waitForFunction` predicate or swallow readiness failures.

## Writing Tests

### Continuity Slice Discipline

Inspect the owning suite and shared helpers before adding coverage. Name the
behaviour or timing distinction a new case proves. Replace redundant proof only
with an explicit mapping of retained assertions and intentionally dropped journeys.
Keep policy choices separate from publication/ownership invariants. Follow standing
validation rules and the review scope selected for the task, not an old campaign's
execution instructions. Test duration is not application-performance evidence.

### Asynchronous Observability

Capture the relevant generation/state before input, then wait for the operation's
promised outcome: destination key/query, expected identity, accepted publication or
rendered placement. `loading=false` and density acknowledgement are not universal
settlement signals. Keep setup and waits outside measured regions.

Use elapsed deadlines for readiness. Fixed observation windows are appropriate
when they are the oracle: painted-frame stability, debounce boundaries, long-press
thresholds or delayed-runaway detection. They must not substitute for readiness.

### History and Result Edges

Verify the departure's history key and captured snapshot before testing restoration.
Assert destination identity/rank and DOM placement separately from query completion.
For End, identify the actual global final row and require full visibility within
the usable viewport, excluding the sticky header and horizontal scrollbar. Preserve
focus/selection independently; reaching a DOM maximum alone proves neither contract.

Distinguish real result edges from temporary buffer limits, physical clamping from
anchor policy, and compensating scroll changes from visible displacement. Snapshot,
density and detail-return placement conventions need separate oracles.

### Detail Return Coverage

Keep original-image native return separate from traversed-image centring. Early-close
tests must close while list restoration is pending, not wait away the race. Check
returned identity, geometry and focus/ring policy. Reload/gesture tests must preserve
the session-entry identity and distinguish cancelled from completed dismissals.
Newer input should retire obsolete presentation without discarding useful data work.

### Justified Proof Contracts

Retain fixed-density controls and independent geometry oracles. For temporary-tail
append tests, start with genuinely unknown dimensions, hold the real append and
observe the elected viewport identity without focus. Require meaningful content
repacking, exact accepted IDs/offsets and preserved viewport position across frames.
Install holds before maintenance starts and account for density-disposal cooldown.
Do not derive expected geometry from the production helper under test.

### Controlled Work and Cleanup

Release held work and restore only owned descriptors/listeners/routes in `finally`.
Keep HTTP response holds distinct from completed-client-read holds. A hostile replay
must prove the obsolete callback actually ran before claiming its effect was rejected.
Local API DTO fixtures are not live-server cancellation or physical-device evidence.

For manual browser work, use the [browser playbook](../exploration/docs/embedded-browser-playbook.md),
including foreground/source verification, native zoom and sensitive-data handling.

## File Map

| Spec | Coverage |
| --- | --- |
| [scrubber](local/scrubber.spec.ts) | Seek, scrolling, density/sort placement, extension and coordinate regimes |
| [keyboard navigation](local/keyboard-nav.spec.ts) | Focused versus scroll-only keys, Home/End, selection and input handling |
| [browser history](local/browser-history.spec.ts) | Destination identity/placement, Back/Forward, reload, density persistence and Home ownership |
| [buffer integrity](local/buffer-corruption.spec.ts) | Search/reset publication, pending density changes, refresh and failure paths |
| [pending browsing](local/browse-density.spec.ts) | Queued/in-flight navigation across density and query changes |
| [forced seek](local/forced-seek.spec.ts) | Temporary/result edges, prepend compensation and pending seek presentation |
| [focus preservation](local/focus-preservation.spec.ts) | Surviving/missing targets, neighbour fallback, snap-back and AI exit |
| [UI features](local/ui-features.spec.ts) | Detail/gesture/preview return, panels, media fallback, input and URL controls |
| [resident Justified](local/justified-density.spec.ts) | Density/reflow, history, detail, spatial keys and responsive geometry |
| [windowed Justified](local/justified-windowed.spec.ts) | Indexed/seek packing, append, pending navigation, history and true edges |
| [density controls](local/density-controls.spec.ts) | Density control selection and readiness boundaries |
| [thumbnail lifetime](local/thumbnail-lifecycle.spec.ts) | Functional cancellation/reversal, shared/completed media, source replacement and density/reflow reveals; mock data/local images, no performance assertions |
| [selections](local/selections.spec.ts) | Membership, ranges, persistence, metadata panels and async fixture lifetimes |
| [mobile selections](local/selections-mobile.spec.ts) | Touch selection and mobile interactions |
| [phantom focus](local/phantom-focus.spec.ts) | Click-to-open and hidden-focus behaviour |
| [collections](local/collections.spec.ts) | Collection navigation and context |
| [CQL quoting](local/cql-search-quoting.spec.ts) | Query construction and quoting |
| [toast](local/toast.spec.ts) | Toast presentation and lifetime |
| [visual baselines](local/visual-baseline.spec.ts) | Screenshot comparisons |

## Where Results Live

| Artifact | Repository-relative location |
| --- | --- |
| Playwright HTML report | `kupua/playwright-report/` |
| Playwright failures and traces | `kupua/test-results/` |
| Visual baselines | `kupua/e2e/local/visual-baseline.spec.ts-snapshots/` |
| Scrubber diagnostic output | `kupua/test-results/scrubber-diag-all.json` |
| Performance results | `kupua/e2e-perf/results/` |
| Experiment results | `kupua/e2e-perf/results/experiments/` |

Playwright clears its test-results directory at run start. Keep immutable review
packets outside it, under ignored `kupua/.vite/`, and exclude them from commits.
Never retain live identities, raw payloads, credentials or signed URLs in artifacts.

## Position Diagnostics

Use [scrubber-debug.spec.ts](scrubber-debug.spec.ts) for a separately selected headed
coordinate investigation. The development-only `window.__kupua_store__` supports
focused assertions. Overscan cells can have valid identities while off-screen:
measure usable viewport rectangles or use the hit-tested point helper.

Deferred maintainability proposals and supporting coverage rationale belong in the
[test-maintenance assessment](../exploration/docs/test-maintenance-assessment.md),
not this operating guide. They are not a test mandate or a list of demonstrated bugs.

