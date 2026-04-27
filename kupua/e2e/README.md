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
    cited-scenario.spec.ts        ← drift+flash probes on real data
    phantom-drift-diag.spec.ts    ← back/forward drift diagnostics
    focus-preservation-smoke.spec.ts
    history-diag.spec.ts
    home-logo-diag.spec.ts
    smoke-report.ts
  shared/                         ← imported by local, smoke, perf, and diag
    helpers.ts
    drift-flash-probes.ts         ← drift & flash measurement probes
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
| `local/drift-flash-matrix.spec.ts` | 4 | Cross-tier drift + flash probes on local Docker ES. Same probe infrastructure as smoke `cited-scenario`. |
| `local/focus-preservation.spec.ts` | ~30 | Focus preservation across sort/filter/scrubber/density in explicit and phantom mode |

### Smoke (`npm run test:smoke` — `playwright.smoke.config.ts` → `e2e/smoke/`)

| File | Tests | What it covers |
|------|-------|----------------|
| `smoke/manual-smoke-test.spec.ts` | S1–S11 | Date/keyword/null-zone seek accuracy, End key, Home key, sort-around-focus, density switch at scale |
| `smoke/smoke-scroll-stability.spec.ts` | S12–S27 | Seek accuracy sweep, flash prevention, swimming detection, settle-window rAF trace + CLS, headroom-zone stability, cold-start seek, sustained scroll-up swimming, FOCC DOM-level detection |
| `smoke/cited-scenario.spec.ts` | 4 | Drift + flash probes during sort change, direction toggle, no-focus phantom mode, and two-tier (Dublin). Uses rAF sampling, position flash analysis, content flash analysis. |
| `smoke/phantom-drift-diag.spec.ts` | D1–D3 | Phantom and explicit anchor back/forward drift over multiple cycles. Full coordinate-system capture. |
| `smoke/focus-preservation-smoke.spec.ts` | T1–T5 | Focus preservation across sort/filter at real scale |
| `smoke/history-diag.spec.ts` | — | Browser-history snapshot diagnostic |
| `smoke/home-logo-diag.spec.ts` | — | Logo-click reset-to-home diagnostic |

### Shared (`e2e/shared/` — imported by all modes)

| File | What it provides |
|------|------------------|
| `shared/helpers.ts` | `KupuaHelpers` fixture class, `sampleScrollTopAtFrameRate()` |
| `shared/drift-flash-probes.ts` | Position probes, visible-cell snapshots, rAF transition sampling, drift/flash/position-flash analysis and logging |

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

---

## Drift & Flash — Concepts, Probes, and Tests

This section explains what "drift" and "flash" mean in kupua, what the probes
measure, which tests use them, and how to interact with focused images in tests
without introducing Playwright artifacts.

### What is drift?

**Drift** = a tracked image ends up at a different viewport position after an
operation than it was before. You trigger a sort change, and the image that was
at screen-centre is now 200px higher. That's drift.

Measured as the change in **viewport ratio** (0.0 = top of scrollable container,
1.0 = bottom) between a settled pre-state and a settled post-state. Drift of
0.0000 is perfect. Drift > 0.01 is visible to the eye.

The probe captures both **DOM coordinates** (`getBoundingClientRect`) and
**geometry coordinates** (row × ROW_HEIGHT). DOM coordinates are preferred
because they account for virtualizer positioning (paddingTop, transforms).
Geometry is the fallback when the DOM element isn't rendered.

### What is flash?

Flash is an umbrella for "wrong stuff on screen during a transition." There are
three distinct types:

**Content flash** — the visible thumbnails briefly change to completely different
images, then snap to the correct ones. Root cause: the store delivers an
intermediate buffer (first page, offset=0) before the sort-around-focus seek
arrives with the correct buffer. For ~100–700ms every thumbnail on screen is from
the wrong part of the dataset.

Measured by `analyzeFlash()`: counts frames where `firstVisibleGlobalIdx` is
>30% of total away from both the pre and post expected regions.

**Scroll flash** — `scrollTop` drops to near-zero while content is still from a
deep region. The viewport jumps to the top of the grid then back. Root cause:
Effect #7 eagerly resets `scrollTop = 0` before the new search results arrive.

Measured by `analyzeFlash()`: counts frames where `scrollTop < 10% of pre-action
scrollTop` while first-visible content is still from the pre-action region.

**Position flash** — a tracked image visits >2 distinct (column, row) grid
positions during a single transition. Position A (initial) → B (unwanted
intermediate) → C (final). Even if B is brief, it looks like the image jumped.

Measured by `analyzePositionFlash()`: builds a trajectory of (col, row) positions
from rAF samples. >2 distinct positions = flash detected.

All three probes are in `e2e/shared/drift-flash-probes.ts`.

### The probe module: `drift-flash-probes.ts`

Exports:

| Function | Purpose |
|----------|--------|
| `captureProbe(page, label, testStartMs, trackId)` | Settled-state snapshot: store state, scroll position, tracked image coordinates (DOM + geometry), viewport anchor, grid geometry |
| `captureVisibleCells(page)` | All visible `[data-image-id]` elements with their globalIdx, (col, row), and DOM-vs-geometry delta |
| `waitForSettle(page, timeout?)` | Wait for `!loading && !sortAroundFocusStatus && results.length > 0` + 2s extra |
| `startTransitionSampling(page, trackId)` | Inject an rAF loop that captures one `TransitionSample` per animation frame |
| `stopTransitionSampling(page)` | Stop the rAF loop and return all samples |
| `measureDrift(pre, post)` | Compare two `PositionProbe` snapshots → drift ratio, drift px |
| `analyzeFlash(samples, preScrollTop, preFirstIdx, postFirstIdx, total)` | Detect content flash and scroll flash from transition samples |
| `analyzePositionFlash(samples)` | Detect position flash from (col, row) trajectory |
| `logProbe()`, `logDrift()`, `logFlash()`, `logPositionFlash()` | Pretty-print results to console |

The **rAF sampling loop** (`startTransitionSampling`) runs inside the browser
page. It reads store state and DOM every animation frame (~60fps), recording:
- `scrollTop`, `loading`, `bufferOffset`, `resultsLength`, `sortAroundFocusStatus`
- First and last visible image IDs and global indices
- Tracked image: whether it's in the DOM, its viewport ratio, its (col, row)

This is how we see *intermediate* frames — not just before/after.

### How to interact with images in tests

**Never click images with Playwright in headed mode.** Playwright's click
mechanism causes visible zoom-in/zoom-out artifacts (actionability checks trigger
scrollIntoView and layout shifts). These are Playwright artifacts, not app bugs,
but they corrupt probe measurements.

**Never use `deviceScaleFactor` in smoke tests.** Explicit DPR values (1.25, 2)
cause the headed browser to visibly resize/zoom. The smoke config omits it
entirely so the browser uses its native DPR.

**Never use `page.screenshot()` in headed smoke tests.** Screenshots trigger
a brief viewport zoom artifact that corrupts visual measurements.

Instead:

```typescript
// Find a visible image by checking which cells are actually in the viewport
const visibleImageId = await page.evaluate(() => {
  const grid = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
  if (!grid) return null;
  const gridRect = grid.getBoundingClientRect();
  const cells = grid.querySelectorAll('[data-image-id]');
  const visible: string[] = [];
  for (let i = 0; i < cells.length; i++) {
    const r = cells[i].getBoundingClientRect();
    const centerY = r.top + r.height / 2;
    // Margin of 100px avoids overscan cells outside the visible area
    if (centerY > gridRect.top + 100 && centerY < gridRect.bottom - 100) {
      const id = cells[i].getAttribute('data-image-id');
      if (id) visible.push(id);
    }
  }
  if (visible.length === 0) return null;
  return visible[Math.floor(visible.length / 2)]; // middle of visible set
});

// Focus via store — no viewport side-effects
await page.evaluate((id) => {
  const store = (window as any).__kupua_store__;
  store?.getState().setFocusedImageId(id);
}, visibleImageId);
```

The `__kupua_store__` is exposed on `window` in dev mode. It provides:
- `getState().setFocusedImageId(id)` — set explicit focus
- `getState()._phantomFocusImageId` — read the phantom focus (one-shot, may be null)
- `getState().focusedImageId` — current explicit focus
- All store state for inspection

### Overscan trap

The virtualizer renders extra rows above and below the viewport (overscan).
These cells exist in the DOM with valid `data-image-id` attributes but are
**not visible on screen**. If you pick the Nth `[data-image-id]` element
blindly, you may select an overscan cell. Playwright's click will then
trigger `scrollIntoView`, causing a large scroll jump that looks like drift.

The `getBoundingClientRect` margin check in the pattern above avoids this.
The 100px margin is conservative — overscan rows are typically 1–3 rows
(200–600px) above/below the viewport.

### Where tests live

| Test file | Data source | What it measures |
|-----------|-------------|------------------|
| `smoke/cited-scenario.spec.ts` | Real TEST (1.3M images), city:Dublin (14k) | Drift + content flash + position flash during sort change, direction toggle, no-focus mode. 4 tests covering seek and two-tier modes. |
| `smoke/phantom-drift-diag.spec.ts` | Real TEST (1.3M images) | Back/forward cycle drift (phantom and explicit anchor). D1–D3 covering 4-cycle phantom, 3-cycle explicit, DOM-vs-geometry coordinate delta at multiple seek positions. |
| `local/drift-flash-matrix.spec.ts` | Local Docker ES (10k) | Same probe infrastructure as cited-scenario, but on local data. Cross-tier via `playwright.tiers.config.ts`. |
| `local/focus-preservation.spec.ts` | Local Docker ES (10k) | Focus preservation (focusedImageId survives sort/filter/scrubber/density). Not probe-based but covers the same domain. |

### Running the tests

**Smoke tests (real data, headed):**

Requires `start.sh --use-TEST` running on :3000. Stop any other server first.

```bash
# All cited-scenario tests (4 tests, ~50s)
npm --prefix kupua run test:smoke -- cited-scenario

# Phantom drift diagnostics (D1–D3, ~40s)
npm --prefix kupua run test:smoke -- phantom-drift-diag

# Direct Playwright invocation (same thing)
cd /path/to/grid/kupua && npx playwright test \
  --config playwright.smoke.config.ts \
  e2e/smoke/cited-scenario.spec.ts 2>&1 | tee /tmp/kupua-test-output.txt
```

**Local tests (Docker ES):**

```bash
# All local E2E including drift-flash-matrix
npm --prefix kupua run test:e2e

# Just drift-flash-matrix on all tiers
npm --prefix kupua run test:e2e:tiers
```

### Reading the output

Each test prints a results block:

```
  ════════════════════════════════════════════
  RESULTS — Last Modified → Uploaded
  ════════════════════════════════════════════
  Drift: 0.0000 (0.0px)
  Column shift: 2 → 0 (-2)
  Position flash: no (2 positions)
  Focus preserved: true
  Content flash: true (35 frames)
  Total frames sampled: 333 (5420ms)
  ════════════════════════════════════════════
```

- **Drift 0.0px**: image didn't move vertically. Good.
- **Column shift -2**: image moved from column 2 to column 0. Expected — re-sort
  changes the image's global index, so `globalIdx % columns` changes. Not a bug.
- **Position flash: no (2 positions)**: the tracked image visited 2 grid positions
  (initial and final). 2 is the expected minimum after a sort that changes the
  column. 1 = no movement at all. 3+ = something intermediate appeared. Bad.
- **Content flash: true (35 frames)**: for 35 animation frames (~580ms), the
  viewport showed images from a completely different part of the dataset. This IS
  the bug — the intermediate first-page buffer rendered before the correct seek
  buffer arrived.
- **Total frames sampled**: how many rAF frames the sampling loop captured.

### The flash inventory

A comprehensive audit of all 17 sites where flash can occur lives in
`exploration/docs/position-preservation-audit-findings.md` § Section 7.
The three reproducible flash sites are:

| # | Trigger | Severity | Family |
|---|---------|----------|--------|
| 1 | Sort change, no focus, deep scroll | 3 (high) | F1 — eager scroll reset before data |
| 8 | Density toggle at deep scroll | 2 (medium) | F3 — rAF chain timing |
| 9 | Popstate without snapshot | 2 (medium) | F1 — same as #1 but via back button |

The remaining 14 sites are theoretical or already guarded against.

### Stable test corpora

Smoke tests pin their corpus with `STABLE_UNTIL = "2026-03-04T00:00:00"` to
prevent total-count drift from new images. Three queries exercise all three
scroll modes:

| Mode | Total | Query |
|------|-------|-------|
| Buffer (<1k) | 958 | `nonFree=true&query=keyword:"mid length half celebration"` |
| Two-tier (1k–65k) | 14,399 | `nonFree=true&query=city:Dublin` |
| Seek (>65k) | 1,304,298 | `nonFree=true` (unfiltered) |

These require the TEST cluster via SSH tunnel. Results are frozen by the `until`
param — they won't change unless images are deleted from the index.

