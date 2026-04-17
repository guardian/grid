# Phase 0: Measurement Infrastructure — Plan

> **30 March 2026.** Pre-work that makes all subsequent coupling-fix phases
> measurable and regression-safe. One batch of work, no app behaviour changes.
>
> **Audience:** This is an execution spec for the agent (Sonnet preferred for
> execution; Opus for review/judgement). Read top-to-bottom, execute in order.
> Every task has a clear input → output → done condition.
>
> **Before starting:** Read `AGENTS.md`, `fix-ui-coupling.md`,
> `fix-ui-coupling-plan.md`, and `rendering-perf-plan.md` for full context.
> The frontend source files are: `src/stores/search-store.ts` (~1622 lines),
> `src/components/ImageTable.tsx` (~1491), `ImageGrid.tsx` (~652),
> `Scrubber.tsx` (~1008), `src/hooks/useDataWindow.ts`, `useListNavigation.ts`,
> `src/lib/density-focus.ts`, `src/dal/es-adapter.ts` (~1136).

---

## Goals

1. **Perf tests emit structured JSON** — parseable by the audit harness
2. **Audit harness** — `e2e-perf/run-audit.mjs` records results with git ref
3. **Perf test audit** — keep/modify/merge/drop/add every test
4. **New tests** — image traversal, fullscreen, enter/escape, keyword-sort seek
5. **Shared constants** — Phase 1 from coupling plan (pure refactor)
6. **Baseline entry** — first harness run produces the "before" snapshot

---

## Directory Structure (target state)

```
kupua/
  e2e/                             # Functional E2E tests (64 tests, local ES)
    global-setup.ts
    helpers.ts                     # KupuaHelpers — shared by both e2e/ and e2e-perf/
    scrubber.spec.ts
    manual-smoke-test.spec.ts      # Stays here (not perf-focused)
    tsconfig.json
  e2e-perf/                        # NEW: perf smoke tests + harness + results
    perf.spec.ts                   # Moved + modified from e2e/rendering-perf-smoke.spec.ts
    run-audit.mjs                  # The harness script (human invokes manually)
    playwright.perf.config.ts      # Moved + renamed from playwright.smoke.config.ts
    tsconfig.json                  # TypeScript config for e2e-perf (extends e2e/tsconfig)
    results/                       # Git-tracked audit log
      audit-log.json               # Machine-readable: every run's metrics
      audit-log.md                 # Human-readable: diff tables per run
      .gitkeep
  src/
    constants/
      layout.ts                    # Phase 1: shared pixel constants
  scripts/
    run-perf-smoke.mjs             # Updated to delegate to e2e-perf/run-audit.mjs
    run-smoke.mjs                  # Unchanged: only runs manual-smoke-test.spec.ts
```

### What moves, what stays

| File | From | To | Notes |
|---|---|---|---|
| `rendering-perf-smoke.spec.ts` | `e2e/` | `e2e-perf/perf.spec.ts` | Renamed + modified |
| `playwright.smoke.config.ts` | root | `e2e-perf/playwright.perf.config.ts` | Narrowed to perf only |
| `run-perf-smoke.mjs` | `scripts/` | `e2e-perf/run-audit.mjs` | Rewritten with harness |
| `scripts/run-perf-smoke.mjs` | — | stays | Thin wrapper → `e2e-perf/run-audit.mjs` |
| `helpers.ts` | `e2e/` | stays | Imported by both `e2e/` and `e2e-perf/` via `../e2e/helpers` |
| `manual-smoke-test.spec.ts` | `e2e/` | stays | Not perf — functional smoke |
| `playwright.smoke.config.ts` | root | **kept for manual smoke** | Narrowed to `manual-smoke-test.spec.ts` only |

### Config split

Currently `playwright.smoke.config.ts` runs both `manual-smoke-test.spec.ts` AND
`rendering-perf-smoke.spec.ts`. After the split:

- **`playwright.smoke.config.ts`** → `testMatch: ["**/manual-smoke-test.spec.ts"]` only
- **`e2e-perf/playwright.perf.config.ts`** → `testDir: "."`, `testMatch: ["**/perf.spec.ts"]`
  Same viewport/DPR/timeout config. Adds a JSON reporter alongside list.

`run-smoke.mjs` continues to work unchanged (only targets manual smoke).

---

## Result Set Stability

The TEST/CODE ES cluster receives new images continuously (~60/day peak).
If we don't pin the result set, total counts drift between runs, seek
positions shift, and metric fluctuations are caused by data changes rather
than code changes.

**Fix:** All perf tests navigate to `/search?nonFree=true&until=<STABLE_DATE>`
where `STABLE_DATE` is hard-coded `2026-02-15T00:00:00Z`.

- **Harness** (`run-audit.mjs`): hard-codes `STABLE_UNTIL` = `2026-02-15T00:00:00Z`
  sets `process.env.PERF_STABLE_UNTIL` before spawning Playwright.
- **Perf spec** (`perf.spec.ts`): `const STABLE_UNTIL = process.env.PERF_STABLE_UNTIL`
  and all `goto()` / `page.goto()` calls append `&until=${STABLE_UNTIL}`.
- **Helper** (`KupuaHelpers`): add a `gotoPerfStable()` method that includes
  the `until` param. Perf tests use this instead of bare `goto()`.

This freezes the result set to "everything uploaded before yesterday" — a
large (~1.3M), stable corpus. New images from today don't affect it.

---

## Part A: Perf Test Audit

### Current test inventory (P1–P12)

| Test | What it measures | User scenario | Verdict | Rationale |
|---|---|---|---|---|
| **P1** | Initial load CLS + jank | Page opens | **KEEP** | Baseline — catches regressions in first render |
| **P2** | Grid scroll jank + CLS | Fast mousewheel in grid | **KEEP** | Core UX — most users scroll in grid |
| **P3** | Seek buffer replacement (date sort) | Scrubber click to 50% | **KEEP** | Validates deep seek rendering path under date sort (percentile estimation) |
| **P4** | Density switch grid↔table | Toggle density | **KEEP, SPLIT** | Split into P4a (grid→table) / P4b (table→grid) for per-direction metrics |
| **P5** | Panel toggle reflow | Open/close left+right | **KEEP** | Three sub-phases (a/b/c) in one test is fine — emits 3 metric entries |
| **P6** | Sort-around-focus | Toggle sort direction | **KEEP** | "Never Lost" path — high-value, complex code path |
| **P7** | Scrubber drag framerate | Drag thumb top→bottom | **KEEP** | Direct DOM write path — must stay 60fps |
| **P8** | Table scroll with extend/evict | Fast mousewheel in table | **KEEP** | Known worst case (69 severe at 4K). Primary regression target |
| **P9** | Sort field change | Change sort from date→credit | **KEEP** | Full buffer replacement path |
| **P10** | Composite workflow | Load→scroll→seek→switch→sort | **KEEP, NO REPORT** | Keep for stress test value. Mark `report: false` — harness records but excludes from diff table (duplicates P1–P9 with accumulated noise) |
| **P11** | Thumbnail CLS after seek | 5 seeks, measure CLS per seek | **SIMPLIFY** | Reduce to 3 seeks (0.2, 0.6, 0.85). Credit sort variant → separate optional P11b |
| **P12** | Density drift + buffer boundary | 8 density switches after deep scroll | **KEEP** | Unique — only test that catches accumulating drift |

### Missing tests — ADD

| ID | What it measures | User scenario | Why it matters |
|---|---|---|---|
| **P3b** | Seek under keyword sort | Switch to Credit sort → seek to 50% | Exercises the completely different composite-agg + binary-search seek path. P3 only tests date sort (percentile). This is the other major code branch |
| **P13** | Image detail enter/exit | Double-click row → overlay appears → backspace → list returns | Tests the opacity-0 overlay pattern. No existing perf coverage. Measures: transition jank, scroll position restoration accuracy, CLS on return |
| **P14** | Image traversal (prev/next) | Enter detail → arrow-right 20× → arrow-left 10× | Tests fullscreen-survives-between-images, prefetch effectiveness, frame rate during rapid navigation. Zero existing coverage |
| **P15** | Image detail fullscreen | Enter detail → f → next → next → f → exit | Tests fullscreen persistence across image changes. Measures: jank during fullscreen toggle, CLS during image swap in fullscreen |
| **P16** | Table column resize | Drag-resize a column, double-click to fit | Tests CSS-variable width path + canvas measurement. Frame rate during drag should show near-zero React re-renders |

### Sort coverage rationale

Different sort types exercise different seek code paths:

| Sort type | Example fields | Seek strategy | Covered by |
|---|---|---|---|
| **Date** | uploadTime, dateTaken | Percentile estimation → search_after | P3, P6, P7 (all default sort) |
| **Keyword** | credit, source, category | Composite agg walk → binary search refinement | **P3b (NEW)**, P9 (sort change only, no seek) |
| **Numeric** | width, height | Same percentile path as date | Not separately tested — same code path as date |

P3b fills the gap: keyword sort seeking is the most complex seek path (composite
aggregation, bucket accumulation, hex binary search on id tiebreaker) and has
zero perf coverage today.

---

## Part B: Structured Metrics Output

Each test calls `emitMetric()` after `logPerfReport()`. This writes a JSON line
to a temp file that the harness reads after Playwright exits.

```ts
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

const METRICS_FILE = resolve(__dirname, "results/.metrics-tmp.jsonl");

function emitMetric(id: string, snap: PerfSnapshot, extra?: Record<string, unknown>) {
  const line = JSON.stringify({
    id,
    timestamp: new Date().toISOString(),
    cls: Number(snap.cls.total.toFixed(4)),
    clsMax: Number(snap.cls.maxSingle.toFixed(4)),
    maxFrame: Math.round(snap.jank.maxFrameMs),
    severe: snap.jank.jankyFrames50ms,
    p95Frame: Math.round(snap.jank.p95FrameMs),
    domChurn: snap.dom.totalChurn,
    loafBlocking: Math.round(snap.loaf.totalBlockingMs),
    frameCount: snap.jank.frameCount,
    ...extra,
  }) + "\n";
  appendFileSync(METRICS_FILE, line);
}
```

The harness clears the file before spawning Playwright, then reads it after.
Works even if some tests fail (partial results are still recorded).

---

## Part C: Audit Harness (`e2e-perf/run-audit.mjs`)

### Interface

```
node e2e-perf/run-audit.mjs --label "Phase 1: shared constants"
node e2e-perf/run-audit.mjs --label "Baseline" --runs 3
node e2e-perf/run-audit.mjs P8             # run just P8, no label (quick check)
```

### Algorithm

1. Parse CLI args: `--label`, `--runs` (default 1), optional grep pattern
2. Get git SHA via `git rev-parse --short HEAD`, dirty via `git diff --quiet`
3. Compute `STABLE_UNTIL` = yesterday 00:00:00.000Z, set as env var
4. Clear `results/.metrics-tmp.jsonl`
5. For each run (1 to N):
   a. Spawn Playwright: `npx playwright test --config=e2e-perf/playwright.perf.config.ts --reporter=list [--grep=pattern]`
      with `PERF_STABLE_UNTIL` in env
   b. Stream stdout/stderr to terminal (real-time, same as current runner)
   c. Wait for exit
   d. Read `.metrics-tmp.jsonl`, parse into `Map<testId, metrics[]>`
   e. Clear `.metrics-tmp.jsonl` for next run
6. If `--runs > 1`: compute median of each metric across runs
7. Read `results/audit-log.json` (or create empty `{ entries: [] }`)
8. Append entry: `{ label, gitSha, gitDirty, timestamp, runs, metrics: {...} }`
9. Write `results/audit-log.json`
10. Read `results/audit-log.md` (or create with heading)
11. If previous entry exists: append a diff table (this vs previous)
12. If no previous: append a baseline table
13. Write `results/audit-log.md`
14. Print summary to terminal

### JSON schema

```ts
interface AuditEntry {
  label: string;
  gitSha: string;
  gitDirty: boolean;
  timestamp: string;
  stableUntil: string;       // the until= value used for result set pinning
  runs: number;
  metrics: Record<string, TestMetrics>;  // keyed by test ID (P1, P2, ...)
}

interface TestMetrics {
  cls: number;
  clsMax: number;
  maxFrame: number;  // ms
  severe: number;    // count of >50ms frames
  p95Frame: number;  // ms
  domChurn: number;
  loafBlocking: number;  // ms
  frameCount: number;
}
```

### Markdown output format

```markdown
## Baseline (abc1234, 2026-03-30)

Stable until: 2026-03-29T00:00:00.000Z | Runs: 1

| Test | CLS | Max frame | Severe | P95 | DOM churn | LoAF blocking |
|------|-----|-----------|--------|-----|-----------|---------------|
| P1   | 0.0000 | 184ms | 2 | 34ms | 199 | 84ms |
| P2   | 0.0000 | 184ms | 4 | 42ms | 580 | 120ms |
...

---

## Phase 1: shared constants (def5678, 2026-03-31)

Stable until: 2026-03-30T00:00:00.000Z | Runs: 1

| Test | CLS | Max frame (Δ) | Severe (Δ) | P95 (Δ) | DOM churn (Δ) | LoAF (Δ) |
|------|-----|---------------|------------|---------|---------------|----------|
| P1   | 0.0000 | 186ms (+2) | 2 (0) | 35ms (+1) | 201 (+2) | 85ms (+1) |
...

Verdict: No regression detected.
```

---

## Part D: Shared Constants (Phase 1 from coupling plan)

Since we're already touching E2E test files (moving perf spec, fixing
constant injection), we do Phase 1 simultaneously.

### Task D.1: Create `src/constants/layout.ts`

```ts
/** Table row height (px). Matches the Tailwind h-8 class on table rows. */
export const TABLE_ROW_HEIGHT = 32;

/** Table sticky header height including 1px border-b. Matches h-11 + border. */
export const TABLE_HEADER_HEIGHT = 45;

/** Grid row height (px). Thumbnail (190) + metadata (~105) + cell gap (8). */
export const GRID_ROW_HEIGHT = 303;

/** Grid minimum cell width (px). Columns = floor(containerWidth / MIN_CELL_WIDTH). */
export const GRID_MIN_CELL_WIDTH = 280;

/** Grid cell gap (px). */
export const GRID_CELL_GAP = 8;
```

### Task D.2: Update app code imports

- `ImageTable.tsx`: `ROW_HEIGHT` → `TABLE_ROW_HEIGHT`, `HEADER_HEIGHT` → `TABLE_HEADER_HEIGHT`
- `ImageGrid.tsx`: `ROW_HEIGHT` → `GRID_ROW_HEIGHT`, `MIN_CELL_WIDTH` → `GRID_MIN_CELL_WIDTH`, `CELL_GAP` → `GRID_CELL_GAP`

### Task D.3: Update store tests

- `search-store.test.ts`: import `TABLE_ROW_HEIGHT` instead of local `const ROW_HEIGHT = 32`
- `search-store-extended.test.ts`: same

### Task D.4: Update E2E tests (all specs)

For every `page.evaluate()` closure that uses raw pixel literals (instances
across scrubber.spec.ts, manual-smoke-test.spec.ts, perf.spec.ts — see
coupling report C2/C3/C4 for exact locations), pass constants as arguments:

```ts
// Before:
await page.evaluate(() => {
  const cols = Math.max(1, Math.floor(el.clientWidth / 280));
  const rowTop = rowIdx * 303;
});

// After:
import { GRID_ROW_HEIGHT, GRID_MIN_CELL_WIDTH } from "../src/constants/layout";

await page.evaluate(({ ROW_HEIGHT, MIN_CELL_WIDTH }) => {
  const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
  const rowTop = rowIdx * ROW_HEIGHT;
}, { ROW_HEIGHT: GRID_ROW_HEIGHT, MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH });
```

Note: E2E imports from `src/` may require `paths` config in `e2e/tsconfig.json`
and `e2e-perf/tsconfig.json`. If that doesn't resolve cleanly, create a
re-export at `e2e/constants.ts` that both directories import from.

---

## Execution Order

| Step | What | Files created/modified | Done when |
|---|---|---|---|
| 1 | Create `src/constants/layout.ts` | 1 new | File exists with all 5 constants |
| 2 | Update app imports (ImageTable, ImageGrid) | 2 modified | Local constants deleted, imports working, `npm run dev` compiles |
| 3 | Update store test imports | 2 modified | `npx vitest run` passes |
| 4 | Create `e2e-perf/` directory structure | `results/.gitkeep`, `results/.gitignore` (ignores `.metrics-tmp.jsonl`), `tsconfig.json` | Directory exists |
| 5 | Move + rename perf spec | 1 moved, 1 modified (old location deleted) | File at `e2e-perf/perf.spec.ts`, imports `../e2e/helpers` |
| 6 | Split P4 into P4a/P4b | perf.spec.ts modified | Two separate `test()` blocks |
| 7 | Add P3b (keyword sort seek) | perf.spec.ts modified | New test block exists |
| 8 | Add `emitMetric()` helper + calls in every test | perf.spec.ts modified | Every test body calls `emitMetric()` after `logPerfReport()` |
| 9 | Add stable-until support | perf.spec.ts modified, helpers updated | Tests read `PERF_STABLE_UNTIL` env and append to URL |
| 10 | Add P13 (image detail enter/exit) | perf.spec.ts modified | New test block exists |
| 11 | Add P14 (image traversal) | perf.spec.ts modified | New test block exists |
| 12 | Add P15 (fullscreen persistence) | perf.spec.ts modified | New test block exists |
| 13 | Add P16 (column resize) | perf.spec.ts modified | New test block exists |
| 14 | Simplify P11 (3 seeks, split keyword variant) | perf.spec.ts modified | Test is shorter, P11b exists |
| 15 | Create `e2e-perf/playwright.perf.config.ts` | 1 new | Points to `e2e-perf/`, correct viewport, list reporter |
| 16 | Narrow `playwright.smoke.config.ts` | 1 modified | `testMatch` only has `manual-smoke-test.spec.ts` |
| 17 | Create `e2e-perf/run-audit.mjs` (the harness) | 1 new | Script runs, computes stable-until, reads metrics, writes JSON + markdown |
| 18 | Update `scripts/run-perf-smoke.mjs` | 1 modified | Delegates to `e2e-perf/run-audit.mjs` |
| 19 | Update E2E pixel constants (all raw literals) | 3 modified (scrubber.spec, manual-smoke, perf.spec) | All raw `280`/`303`/`32` replaced with passed arguments |
| 20 | Run functional E2E tests | — | All 64 pass (regression gate) |
| 21 | Update `AGENTS.md` | 1 modified | Project structure, "What's Done" reflect new layout |
| 22 | Update `changelog.md` | 1 modified | Phase 0 entry with full detail |
| 23 | **HUMAN runs the harness** | — | `node e2e-perf/run-audit.mjs --label "Baseline (pre-coupling-fixes)"` |
| 24 | Commit (after human approval) | — | One commit: "Phase 0: measurement infrastructure + shared constants" |

**Estimated effort:** 4–5 hours of agent work.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Moving perf spec breaks import paths | Medium | Low | Verify `helpers.ts` import resolves from `e2e-perf/` via `../e2e/helpers` |
| New tests (P3b, P13–P16) are flaky on first write | High | Low | They run manually — flakiness is diagnosed on first run, not in CI |
| Shared constants import from `src/` doesn't work in E2E tsconfig | Medium | Low | E2E tsconfig may need `paths` update. Fallback: re-export from `e2e/constants.ts` |
| Phase 1 constants refactor introduces a typo | Low | High | Functional E2E tests (step 20) catch any scroll/position regression |
| `stable-until` date excludes too much data | Low | Low | Yesterday midnight gives ~1.3M images — plenty for all scenarios |
| Perf numbers fluctuate >10% between runs on same code | High | Medium | Use `--runs 3` for baselines; single runs for quick checks. Median smooths noise |

---

## What This Does NOT Include

- **Phases 2–6** of the coupling plan (header measurement, scrubber decoupling,
  perf micro-opts, font decoupling, panel responsiveness) — those come after
  Phase 0, each with its own harness run
- **CI integration** — this is a manual tool, not a CI pipeline
- **Dashboard** — the markdown file is the dashboard
- **Multi-browser testing** — Chromium only (LoAF is Chrome-specific)
- **Threshold alerts** — the human reads the diff table and judges

---

*This document is the execution spec. Once approved, the agent executes
steps 1–22 in order. Step 23 is the human. Step 24 is after human approval.*

