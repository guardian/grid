# Kupua Test Suite — Quick Reference

> Agent: read this before touching any test file.

## Directory Structure

```
e2e/
  local/                          ← npx playwright test (habitual)
    scrubber.spec.ts
    keyboard-nav.spec.ts
    buffer-corruption.spec.ts
    ui-features.spec.ts
    tier-matrix.spec.ts           ← cross-tier only (own config)
    visual-baseline.spec.ts
    visual-baseline.spec.ts-snapshots/
  smoke/                          ← node scripts/run-smoke.mjs (TEST)
    manual-smoke-test.spec.ts
    smoke-scroll-stability.spec.ts
    smoke-report.ts
  shared/                         ← imported by local, smoke, perf, and diag
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
| **Local E2E** | `npm run test:e2e` | Docker ES, 10k docs | After changing components, hooks, store, scroll effects. ~6min. |
| **Local E2E (full)** | `npm run test:e2e:full` | Docker ES, 10k docs | Same as above but orchestrates Docker + data loading first. |
| **Cross-tier matrix** | `npm run test:e2e:tiers` | Docker ES, 10k docs | 18 tests × 3 tiers (buffer/two-tier/seek). Starts 3 Vite servers on ports 3010/3020/3030. ~4min. Manual, not habitual. |
| **Smoke (TEST)** | `npm run test:smoke` | Real ES, 1.3M docs | After behavioural changes. Requires `start.sh --use-TEST`. |
| **Perf** | `npm run test:perf` | Real ES, 1.3M docs | Manual, purpose-driven. Never habitual. |
| **Experiment** | `npm run test:experiment` | Local or real ES | Agent-driven A/B tuning. Requires user consent for TEST. |
| **Diagnostic** | `npm run test:diag` | Local or real ES | Scrubber coordinate-space investigation. Headed only. |

## Environment Variables

All env vars are optional. Pass them as prefixes to any command, e.g.
`CPU_THROTTLE=4 npm run test:e2e` or `CPU_THROTTLE=4 npm run test:smoke`.

### Test runner env vars (affect Playwright test execution)

| Variable | Type | Default | Used by | Purpose |
|----------|------|---------|---------|---------|
| `CPU_THROTTLE` | number | 0 (off) | All modes via shared fixture | CDP `Emulation.setCPUThrottlingRate`. Rate=4 simulates 4× slower CPU. Used for slow-hardware experiments. |
| `PERF_STABLE_UNTIL` | ISO date string | — | Smoke, perf, experiments | Pins the result corpus at a fixed date (`&until=` URL param) to prevent metric drift from new images. Auto-set by `run-smoke.mjs` and `run-audit.mjs`. |
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
| Positional | `P8` or `P3,P8,P9` | Grep filter — run only specific perf scenarios |

### Smoke runner CLI args (`run-smoke.mjs`)

| Arg | Example | Purpose |
|-----|---------|---------|
| Number(s) | `2` or `2,3,5` | Run specific test(s) by menu number |
| `all` | `all` | Run all smoke tests |
| (none) | — | Interactive picker |

### Playwright built-in flags (useful combinations)

| Flag | Example | Purpose |
|------|---------|---------|
| `--headed` | `npm run test:e2e:headed` | Visible browser |
| `--debug` | `npm run test:e2e:debug` | Step-through debugger |
| `--ui` | `npm run test:e2e:ui` | Playwright UI mode |
| `-g "pattern"` | `npx playwright test -g "scroll up"` | Run tests matching grep pattern |
| `--update-snapshots` | `npx playwright test --update-snapshots` | Update visual baselines |

## Which Command Do I Run?

Not every suite needs to run every time. The suites are designed at different
cadences — running the wrong one wastes minutes (or requires a live cluster).

| Changed… | Run | Why | Skip |
|----------|-----|-----|------|
| Anything in `src/` | `npm test` (~36s) | Unit/integration. **Always.** Non-negotiable. | Never skip. |
| Components, hooks, store, scroll effects | + `npx playwright test` (~6min) | Tests real browser behaviour: scroll races, focus drift, buffer corruption. | Skip for doc-only, pure-util, or test-only changes. |
| Scroll thresholds, seek logic, density-switch, Home/End handlers, scrubber | + `npm run test:e2e:tiers` (~4min) | Same 18 operations at all three tier boundaries (buffer/two-tier/seek). This is where bugs hide. | Skip if you only changed a panel, table column, or UI feature. |
| Need to validate at real scale (1M+ docs) | `npm run test:smoke` | Catches data-shape bugs (null sort values, missing fields) that 10k sample data can't reproduce. | Requires `start.sh --use-TEST` + explicit user permission. |
| Tuning overscan, buffer capacity, etc. | `npm run test:perf` or `test:experiment` | Measures actual metrics. Never habitual — purpose-driven only. | Don't run "just in case". |
| Scrubber coordinate-space investigation | `npm run test:diag` | Headed diagnostic scan. Not pass/fail. | Only when debugging scrubber mapping. |

**Rule of thumb:** `npm test` is always the first thing you run. `npx playwright test`
is the second (for rendering-related changes). Everything else is purpose-driven —
you should have a specific reason to run it.

## Common Mistakes

- **Port 3000 conflict:** Local E2E starts its own Vite. Stop any running `npm run dev` or `start.sh` first.
- **Running E2E when TEST is connected:** The safety gate (global-setup + per-test check) will refuse. Stop `--use-TEST` first.
- **Running smoke when local ES is connected:** Tests auto-skip (total < 100k). No harm, just wasted time.
- **Piping test output through tail/head:** Don't. The list reporter streams results live.

## Where Results Live

| Artefact | Location |
|----------|----------|
| Smoke JSON report | `test-results/smoke-report.json` |
| Experiment results | `e2e-perf/results/experiments/` |
| Perf audit results | `e2e-perf/results/` |
| Playwright HTML report | `playwright-report/` |
| Visual baseline snapshots | `e2e/local/visual-baseline.spec.ts-snapshots/` |
| Scrubber diagnostic JSON | `test-results/scrubber-diag-all.json` |

## File Map

### Local E2E (`npm run test:e2e` — `playwright.config.ts` → `e2e/local/`)

| File | Tests | What it covers |
|------|-------|----------------|
| `local/scrubber.spec.ts` | ~82 | Seek accuracy, scroll preservation, flash prevention, settle-window stability, density switch, sort change, keyboard nav, buffer extension, scroll-up after seek, scroll mode, two-tier (T1–T4, T9, T12), bug regressions (#1–#18) |
| `local/keyboard-nav.spec.ts` | 15 | Two-mode keyboard nav (no-focus scroll vs focused movement), Home/End, search box key trapping, row-aligned snapping |
| `local/buffer-corruption.spec.ts` | 12 | Logo click / metadata click / query change after deep seek — stale prepend regression |
| `local/ui-features.spec.ts` | 15 | Feature specs: image detail (open, close, navigate, position counter), Enter key, result count, panel toggles, keyboard shortcuts, sort dropdown, column header sort, URL state |
| `local/visual-baseline.spec.ts` | 4 | Screenshot comparison: grid, table, detail, search-with-query |
| `local/tier-matrix.spec.ts` | 18 | Cross-tier tests (seek, Home/End, density switch, sort-around-focus) — runs via `playwright.tiers.config.ts` only |

### Smoke (`npm run test:smoke` — `playwright.smoke.config.ts` → `e2e/smoke/`)

| File | Tests | What it covers |
|------|-------|----------------|
| `smoke/manual-smoke-test.spec.ts` | S1–S11 | Date/keyword/null-zone seek accuracy, End key, Home key, sort-around-focus, density switch at scale |
| `smoke/smoke-scroll-stability.spec.ts` | S12–S27 | Seek accuracy sweep, flash prevention, swimming detection, settle-window rAF trace + CLS, headroom-zone stability, cold-start seek, sustained scroll-up swimming, FOCC DOM-level detection |

### Shared (`e2e/shared/` — imported by all modes)

| File | What it provides |
|------|------------------|
| `shared/helpers.ts` | `KupuaHelpers` fixture class, `sampleScrollTopAtFrameRate()` |

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

## Smoke → Local Feedback Loop

> This procedure applies after every smoke test session against TEST.

The primary purpose of manual smoke tests is NOT just to validate fixes on real
data — it is to **improve local test coverage** so the same class of bug is caught
without manual testing in the future. After every smoke test session, the agent must
try hard to backport learnings into the local test suite:

1. **Amend existing local tests** — add stronger assertions, capture telemetry
   (console logs, timing, page counts), tighten tolerances, assert on code paths
   taken (not just outcomes).
2. **Improve helpers and env config** — add new helper methods to `KupuaHelpers`,
   adjust env variables (`.env`, `.env.development`), tune Docker ES settings
   (`load-sample-data.sh`), or add synthetic edge-case data (e.g. docs with missing
   fields) so local ES better approximates real-world data shapes.
3. **Add new local tests** if the existing ones can't be modified to cover the gap.

**Goal:** every smoke test failure should produce at least one local test improvement
that would have caught (or would in the future catch) the same bug class locally. If
a particular failure truly cannot be reproduced locally (e.g. requires 1M+ docs),
document why in the test comments and ensure the smoke test itself covers it permanently.

