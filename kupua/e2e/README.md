# Kupua Test Suite — Quick Reference

> Agent: read this before touching any test file.

## Session-Aware Density Setup

Density is per-tab UI state, not a URL parameter. Use
`kupua.startSearch(extraParams, "grid" | "table")` for an independent case (grid
default); it initializes density, delegates to the corpus-pinned navigation helper
and asserts the rendered view. `initializeDensity` writes through production
preference handling on an existing document without a throwaway mount/toggle/read.
For a blank document it owns one removable CDP seed, consumed once per origin;
the next initialization retires the prior registration. This is Chromium setup,
not a cross-browser storage guarantee. No global session-storage clear is used.

`goto`, `gotoWithParams`, `gotoPerfStable`, SPA navigation and reload retain the
case's choice. Do not reinitialize within persistence/history controls. An obsolete
`density=table` URL does not select table, and URL absence does not prove grid:
use `assertDensity` or layout-specific `waitForResults` readiness. Maintained
local, forced-seek and diagnostic setups follow this distinction.

Density-history controls prove no entry/key/query-generation change or Forward
loss, immediate reload/first-mounted view, fresh/reused initialization and current
layout destination restoration. Both-logo Home races and held-data frame controls
retain pending-content, focus, geometry and request assertions. KUP-018 proves
queued return cancellation and rejects a deliberately delivered obsolete callback.
The complete local gate passes 423 retry-free habitual cases, including 11 forced-seek
cases; local fixtures do not authorize or certify live/perf execution.

## Async Fixture Setup

Controlled Home-density, selection-panel and L39 AI setup returns a job object
from a synchronous `page.evaluateHandle` callback, not an async evaluation promise.
The handle retains the job and its pending promise while imports/setup run. The
job exposes `complete` and nullable `error`; success sets completion and rejection
stores the error. `waitForFixtureSetup(page, handle)` polls these fields with a
synchronous predicate, throws setup failures and disposes the handle in `finally`.
The runner's wait timeout bounds unfinished setup; it never retries the setup or
relaxes workflow assertions. Do not use an async `waitForFunction` predicate.

Two selection-spec controls hold a module response while forcing browser GC and
check rejection plus handle disposal. They establish this retained-job contract,
not the original intermittent GC trigger or every async evaluation in the suite.
Home intent reads reuse the imported preference store rather than repeating imports.
The four touched E2E files have no added TypeScript diagnostics against HEAD;
their 16 inherited diagnostics remain. The app build does not cover E2E/perf.

## Detail Return Coverage

B9 controls close as soon as detail identity is ready while existing list
restoration is held, rather than replacing early close with a readiness wait.
Early/settled original return preserves native geometry; genuine traversal centres
the returned image with the correct focus/ring or phantom policy. Grid/table
keyboard and background-clear controls defeat obsolete return presentation while
retaining restoration request budgets and session-persisted density/selection.
B12 drives the actual touch listeners after A -> B -> reload B -> A: cancelled
and completed dismiss leave original placement alone, matching Backspace;
traversed return still centres. Existing KUP-018 queued-frame controls remain.
The composed unit surface covers all three coordinate regimes, late restoration
outcomes, history/AI owner adoption and policy substitution. Browser/API response
fixtures are local evidence, not live-service or physical-device certification.

## Directory Structure

```
e2e/
  local/                          ← npx playwright test (habitual)
    scrubber.spec.ts
    keyboard-nav.spec.ts
    buffer-corruption.spec.ts
    ui-features.spec.ts
    forced-seek.spec.ts           ← habitual, isolated port-3030 project
    visual-baseline.spec.ts
    visual-baseline.spec.ts-snapshots/
  shared/                         ← imported by local, tier, perf, and diag
    helpers.ts
  scrubber-debug.spec.ts          ← diagnostic (own config)
  global-setup.ts                 ← local E2E infra (Docker ES health check)
  tsconfig.json                   ← covers all subdirectories
  README.md

e2e-perf/                         ← separate (own configs, own results)
  perf.spec.ts
  experiments.spec.ts
```

## Test Modes

| Mode | Command | Data | When to use |
|------|---------|------|-------------|
| **Unit/Integration** | `npm test` | In-memory mock | After any `src/` change. ~5s. Non-negotiable. |
| **Local E2E** | `npm run test:e2e` | Docker ES, 10k docs | After changing components, hooks, store, scroll effects. ~5min. |
| **Local E2E (full)** | `npm run test:e2e:full` | Docker ES, 10k docs | Same as above but orchestrates Docker + data loading first. |
| **Perf** | `npm run test:perf` | Real ES, 1.3M docs | Manual, purpose-driven. Never habitual. |
| **Experiment** | `npm run test:experiment` | Local or real ES | Agent-driven A/B tuning. Requires user consent for TEST. |
| **Diagnostic** | `npm run test:diag` | Local or real ES | Scrubber coordinate-space investigation. Headed only. |

## Environment Variables

All env vars are optional. Pass them as prefixes to any command, e.g.
`CPU_THROTTLE=4 npm run test:e2e`.

### Test runner env vars (affect Playwright test execution)

| Variable | Type | Default | Used by | Purpose |
|----------|------|---------|---------|---------|
| `CPU_THROTTLE` | number | 0 (off) | All modes via shared fixture | CDP `Emulation.setCPUThrottlingRate`. Rate=4 simulates 4× slower CPU. Used for slow-hardware experiments. |
| `PERF_STABLE_UNTIL` | ISO date string | — | Perf, experiments | Pins the result corpus at a fixed date (`&until=` URL param) to prevent metric drift from new images. Auto-set by `run-audit.mjs`. |
| `EXP_OVERSCAN_TABLE` | number or `"current"` | `"current"` | Experiments (E1) | Override TanStack Virtual overscan for table scroll experiments. |
| `EXP_OVERSCAN_GRID` | number or `"current"` | `"current"` | Experiments (E2) | Override TanStack Virtual overscan for grid scroll experiments. |

### App-level env vars (affect kupua's runtime behaviour via Vite)

These are set in `.env` / `.env.development` for local mode, and overridden
by `start.sh --use-TEST` for real clusters. They're **not** test runner flags,
but they determine how the app behaves during tests.

| Variable | Default | Local dev | `--use-TEST` | Purpose |
|----------|---------|-----------|--------------|---------|
| `VITE_MAX_RESULT_WINDOW` | 100,000 | 500 | 100,000 | Must match ES index `max_result_window` |
| `VITE_DEEP_SEEK_THRESHOLD` | 10,000 | 200 | 10,000 | Offset above which seek uses the deep path |
| `VITE_SCROLL_MODE_THRESHOLD` | 1,000 | 1,000 | 1,000 | Max total for scroll mode (vs seek mode) |
| `VITE_ES_BASE` | `/es` | — | — | ES proxy base URL |
| `VITE_ES_INDEX` | `images` | — | Auto-discovered | ES index name |
| `VITE_ES_IS_LOCAL` | `true` | `true` | `false` | Write-protection flag |
| `VITE_S3_PROXY_ENABLED` | `false` | — | `true` | Enable S3 thumbnail proxy |
| `VITE_IMGPROXY_ENABLED` | `false` | — | `true` | Enable imgproxy for full images |
| `VITE_IMAGE_BUCKET` | — | — | Auto-discovered | S3 bucket for full images |
| `VITE_KEYWORD_SEEK_BUCKET_SIZE` | 10,000 | — | — | Composite agg page size for keyword seek |

### Perf audit CLI flags (`run-audit.mjs`)

| Flag | Example | Purpose |
|------|---------|---------|
| `--label "..."` | `--label "Phase 1: baseline"` | Human-readable label for the audit log entry |
| `--runs N` | `--runs 3` | Repeat the test suite N times; metrics are median-aggregated |
| Positional | `P8`, `PP1`, `JB3`, or comma-separated IDs | Run only matching jank or perceived metric IDs; completeness is checked against the selected subset |

Perceived filters match complete metric IDs, so `PP1` selects PP1 without also
selecting PP10. The runner translates IDs to Playwright title prefixes; callers
do not need to construct title regexes. Examples from the repository root:

```bash
node kupua/e2e-perf/run-audit.mjs --short-perceived-only --dry-run PP1
node kupua/e2e-perf/run-audit.mjs --long-perceived-only --dry-run --runs 2 JB3,JB4
```

PP10 is a background position-map diagnostic, not a user-action latency row.
It runs through the same short-perceived command and history, but CLI/Markdown
report it separately and the dashboard hides it by default with no target:

```bash
node kupua/e2e-perf/run-audit.mjs --short-perceived-only --dry-run PP10
```

### Playwright built-in flags (useful combinations)

| Flag | Example | Purpose |
|------|---------|---------|
| `--headed` | `npm run test:e2e:headed` | Visible browser |
| `--debug` | `npm run test:e2e:debug` | Step-through debugger |
| `--ui` | `npm run test:e2e:ui` | Playwright UI mode |
| `--grep "pattern"` | `npm --prefix kupua run test:e2e -- --grep "scroll up"` | Run habitual tests matching a Playwright title regex |
| `--update-snapshots` | `npx playwright test --update-snapshots` | Update visual baselines |

## Which Command Do I Run?

Not every suite needs to run every time. The suites are designed at different
cadences — running the wrong one wastes minutes (or requires a live cluster).

| Changed… | Run | Why | Skip |
|----------|-----|-----|------|
| Anything in `src/` | `npm test` (~36s) | Unit/integration. **Always.** Non-negotiable. | Never skip. |
| Components, hooks, store, scroll effects | + `npm run test:e2e` (~5min) | Tests real browser behaviour: scroll races, focus drift, buffer corruption. | Skip for doc-only, pure-util, or test-only changes. |
| Scroll thresholds, seek logic, Home/End handlers, scrubber | + `npm run test:e2e` | Natural buffer/indexed owners plus the isolated forced-seek case run habitually. | — |
| Tuning overscan, buffer capacity, etc. | `npm run test:perf` or `test:experiment` | Measures actual metrics. Never habitual — purpose-driven only. | Don't run "just in case". |
| Scrubber coordinate-space investigation | `npm run test:diag` | Headed diagnostic scan. Not pass/fail. | Only when debugging scrubber mapping. |

**Rule of thumb:** `npm test` is always the first thing you run. `npx playwright test`
is the second (for rendering-related changes). Everything else is purpose-driven —
you should have a specific reason to run it.

P14 traversal rows are isolated jank scenarios rather than one shared journey.
Each fresh context validates an exact in-memory sequence from a fixed pinned
rank, measures landing from final identity commit, and emits only sanitized CLS
roles/geometry. Run one cadence with a positional metric ID such as `P14b`;
image identities must never be written to reports or artifacts.

## Common Mistakes

- **Port 3000 conflict:** Local E2E starts its own Vite. Stop any running `npm run dev` or `start.sh` first.
- **Running E2E when TEST is connected:** The safety gate (global-setup + per-test check) will refuse. Stop `--use-TEST` first.
- **Piping test output through tail/head:** Don't. The list reporter streams results live.
- **Confusing runner filters:** `run-audit.mjs` positional values are metric IDs;
  habitual E2E uses Playwright's title-based `--grep` after the npm `--` separator.

## Asynchronous Observability

Tests should wait for the state an operation promises, not an estimated elapsed
time. Capture the relevant value before the action, then wait for a changed
generation, expected store/URL value, cleared in-flight status, or rendered DOM
identity. Completion and rendering are separate when layout matters.

Fixed-duration waits are reserved for behavior where elapsed time is itself the
oracle: settle-window sampling, delayed-runaway detection, debounce boundaries,
CSS transitions, and long-press thresholds. Required readiness timeouts must not
be swallowed. Prefer existing state before adding observability; when no reliable
signal exists, add a narrow development-only started/completed generation rather
than a production event bus.

## Where Results Live

| Artefact | Location |
|----------|----------|
| Experiment results | `e2e-perf/results/experiments/` |
| Perf audit results | `e2e-perf/results/` |
| Playwright HTML report | `playwright-report/` |
| Visual baseline snapshots | `e2e/local/visual-baseline.spec.ts-snapshots/` |
| Scrubber diagnostic JSON | `test-results/scrubber-diag-all.json` |

## File Map

### Local E2E (`npm run test:e2e` — `playwright.config.ts` → `e2e/local/`)

| File | Tests | What it covers |
|------|-------|----------------|
| `local/scrubber.spec.ts` | 89 | Seek accuracy, scroll preservation, settle-window stability, density switch, sort change, buffer extension, scroll-up after seek, scroll mode, two-tier, and retained bug regressions |
| `local/keyboard-nav.spec.ts` | 15 | Two-mode keyboard nav (no-focus scroll vs focused movement), Home/End, search box key trapping, row-aligned snapping |
| `local/browser-history.spec.ts` | 108 | Entry/query identity, destination focus/NONE and geometry, marked detail native transitions, session density/reload/Forward and Home/input ownership |
| `local/buffer-corruption.spec.ts` | 23 | Logo / metadata / query changes after deep seek, pending sort/density ownership and held-data Home layout frames |
| `local/browse-density.spec.ts` | 32 | Pending/pre-debounce indexed browsing and Scrubber wheel across density in direct/API-adapter fixtures; rendered narrowing-query and finite-AI ownership in local memory fixtures; both click modes/views |
| `local/ui-features.spec.ts` | 74 | Detail, B9 pending return and B12 reload gesture identity, queued return/traversal and preview ownership, media fallback, panel/selection geometry, sort, cursor and URL controls |
| `local/visual-baseline.spec.ts` | 4 | Screenshot comparison: grid, table, detail, search-with-query |
| `local/forced-seek.spec.ts` | 11 | Core midpoint/End/Home journey, eight pending-browse density cases with frame-level departure/thumb assertions, and two no-density controls; runs habitually against port 3030 |
| `local/focus-preservation.spec.ts` | 13 | Focus/viewport continuity, neighbour fallback, snap-back and four adapter-backed L39 AI-exit cases |
| `local/selections.spec.ts` | 30 | Selection membership/ranges/persistence, panel coherence and two retained async-fixture GC/rejection/disposal controls |

### Shared (`e2e/shared/` — imported by maintained test modes)

| File | What it provides |
|------|------------------|
| `shared/helpers.ts` | `KupuaHelpers` fixture class, `sampleScrollTopAtFrameRate()`, `waitForFixtureSetup()` (synchronous readiness/error check and handle disposal) |
| `shared/browse-density.ts` | Real-control pending destination/density checks, including wheel before dispatch; local-ES safety gate, pass-through response hold and API response-shape fixture. Seek-tier cases start deep and sample pending departure identity and thumb position across rendered frames. Clicks result cells, including No thumbnail placeholders. |

### Infrastructure (`e2e/` root)

| File | What it does |
|------|--------------|
| `global-setup.ts` | Docker ES auto-start + safety gate (used by `playwright.config.ts` only) |
| `scrubber-debug.spec.ts` | NOT pass/fail. Diagnostic scan of scrubber coordinate spaces. Own config (`playwright.debug.config.ts`). |

### Perf / Experiments (separate `e2e-perf/` directory)

| File | Config | What it covers |
|------|--------|----------------|
| `e2e-perf/perf.spec.ts` | `e2e-perf/playwright.perf.config.ts` | 16 perf scenarios (P1–P16): CLS, jank, DOM churn, LoAF |
| `e2e-perf/experiments.spec.ts` | `playwright.experiments.config.ts` | A/B tuning experiments (E1–E6): overscan, buffer capacity, etc. |

## Position Diagnostics

Habitual position, focus and transition coverage lives in `e2e/local/`, with
the compact forced-seek owner isolated on port 3030 by `playwright.config.ts`.
Use `e2e/scrubber-debug.spec.ts` only for headed coordinate-space diagnosis and
the `e2e-perf/` suites only for a named performance question.

When selecting a rendered image, remember that virtualizer overscan cells have
valid `data-image-id` attributes but may be outside the viewport. Check the cell
and scroll-container rectangles before interacting, or use the shared helper
that owns the intended operation. Tests should wait on store/DOM completion
signals described above rather than fixed delays.

The development-only `window.__kupua_store__` remains available for focused
diagnostics and assertions. Keep any new browser coverage on maintained local,
diagnostic or perf roots; do not recreate the retired smoke, tier-matrix or
drift/flash-probe harnesses.

