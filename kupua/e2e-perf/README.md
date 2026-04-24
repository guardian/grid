# Perf Test Suite — Reference

> Quick reference for humans and agents interpreting perf audit results.
> Tests live under `e2e-perf/`; the harness is `run-audit.mjs`.

## Two measurement systems

This directory contains **two independent measurement systems** that run from
the same harness but answer different questions:

| System | Asks | Spec files | Output |
|---|---|---|---|
| **Jank** | "Is the browser drawing smoothly while the action runs?" (frame drops, CLS, DOM churn) | `perf.spec.ts` | `audit-log.{json,js,md}` + `audit-graphs.html` |
| **Perceived** | "How long between the user's click and them seeing the result?" (`t_0`, `t_ack`, `t_first_useful_pixel`, `t_settled`) | `perceived-short.spec.ts` (single-action) + `perceived-long.spec.ts` (multi-step journeys) | `perceived-log.{json,js,md}` + `perceived-graphs.html` |

Jank reads what the browser reports; no app cooperation needed. Perceived
reads what the app reports via `trace()` calls — see "Perceived
instrumentation" below.

The perceived suite has two flavours, **short** and **long**, that share
one trace API (`src/lib/perceived-trace.ts`), one `computeMetrics()` shape,
one log file, and one dashboard. The only difference is test length:
short tests are one user action each; long tests chain several to simulate
realistic workflows. They're tagged `kind: "short" | "long"` per log entry.

## Flag matrix

| Flag | Jank | Perceived (short) | Perceived (long) |
|---|---|---|---|
| `(no flag)` | ✓ | — | — |
| `--perceived` | ✓ | ✓ | ✓ |
| `--perceived-only` | — | ✓ | ✓ |
| `--short-perceived-only` | — | ✓ | — |
| `--long-perceived-only` | — | — | ✓ |

The two `-only` variants exist for fast iteration when editing one half: they
skip the half you're not touching.

Other flags:

| Flag | Effect |
|---|---|
| `--label "..."` | Tags this run in the log. Defaults to `"Quick check"` / `"Unnamed run"`. |
| `--runs N` | Repeat each suite N times; metrics aggregated as median + p95. |
| `--dry-run` | Run everything, print summaries, write nothing. |
| `--headed` | Show the browser window (otherwise headless). |
| `<P-id list>` | Positional jank-test filter (e.g. `P3,P8`). |

## How to run

```bash
# Terminal 1 — start app against real ES (manual-only, per session permission)
./scripts/start.sh --use-TEST

# Terminal 2 — examples
node e2e-perf/run-audit.mjs --label "Baseline" --runs 3
node e2e-perf/run-audit.mjs P4a,P4b,P6 --label "Quick jank check"
node e2e-perf/run-audit.mjs P8 --dry-run                         # no log writes
node e2e-perf/run-audit.mjs --short-perceived-only --dry-run     # iterate on PP1-PP10
node e2e-perf/run-audit.mjs --long-perceived-only --runs 5       # journey baseline
node e2e-perf/run-audit.mjs --perceived --label "Full audit" --runs 3
```

`--dry-run` is the recommended first step whenever running the perceived suite
on a new setup or after changing traced paths. It still runs Playwright; it
just doesn't write the log.

## Dashboards

Both dashboards are static HTML pages opened directly from disk
(`open results/audit-graphs.html`) — no server needed. Each loads a sibling
`.js` file (`audit-log.js` / `perceived-log.js`) written by the harness, which
sidesteps the browser's `file://` fetch ban. After each new run, refresh.

`audit-graphs.html` shows one sparkline per jank test across every
`audit-log.json` entry. **If new metric or entry keys appear that the page
doesn't recognise, it shows a red banner** asking you to update
`KNOWN_METRICS` / `KNOWN_ENTRY_KEYS` near the top of the file. That banner is
the contract — when adding a new metric to `perf.spec.ts` / `run-audit.mjs`,
also add it to `KNOWN_METRICS`.

`perceived-graphs.html` shows one sparkline per scenario across
every `perceived-log.json` entry, with checkboxes to filter by kind
(short / long) and a metric selector (`dt_ack_ms` / `dt_first_pixel_ms` /
`dt_settled_ms` / `status_total_ms`).

---

## Jank suite — test inventory

### Network/ES Dependency

Tests fall into three categories. This matters for result stability:

| Category | Tests | Single-run noise | Notes |
|----------|-------|-------------------|-------|
| **Client-only** | P4a, P4b, P5a/b/c, P13a/b, P14a/b/c, P15a/b/c, P16a/b | **Low** (±5%) | No ES requests. Jank/CLS/DOM churn are purely local. Trustworthy from a single run. |
| **Mixed** (client work triggered by ES response) | P2, P7, P8, P12 | **Medium** (±15%) | Scroll/drag is local but triggers `extendForward`/`extendBackward` which hit ES. Jank spikes correlate with response timing. |
| **ES-dominated** | P1, P3, P3b, P6, P9, P11, P11b | **High** (±20%+) | Test measures the full round-trip: ES query → response processing → render. SSH tunnel latency and cluster load dominate. |

**Practical guidance:**
- Use `--runs 1` during development for all tests. Don't panic about ±15% on ES-dominated tests.
- Use `--runs 3` for baselines and phase completion measurements.
- When evaluating a coupling-fix phase that targets client-side performance (e.g. handleScroll stabilisation), focus on the client-only tests (P4, P5, P14, P15, P16). These give reliable signal from a single run.
- When an ES-dominated test shows a big change, re-run with `--runs 3` before concluding it's a real regression.

### Focus Position Tracking

Tests P4a, P4b, P6, and P12 emit `focusDriftPx` and `focusDriftRatio` in their
structured metrics. These measure how accurately the focused image's viewport
position is preserved across transitions:

| Test | Transition | What drift means |
|------|-----------|------------------|
| **P4a** | Grid → Table | Focused image moved N pixels from where it was in grid view |
| **P4b** | Table → Grid | Same, reverse direction |
| **P6** | Sort direction toggle | Focused image moved N pixels despite sort-around-focus |
| **P12** | 8 density switches after deep scroll | Cumulative drift per switch (logged per-cycle to console) |

`focusDriftPx = 0` is perfection. Anything within ±ROW_HEIGHT (~32px table, ~303px grid) is acceptable — the image is on screen. Drift beyond viewport height means the image scrolled out of view: a "Never Lost" violation.

**Note:** P4a, P4b, and P6 emit `focusDriftPx` / `focusDriftRatio` into the
metrics dict and so appear on the `audit-graphs.html` dashboard. P12 logs
per-cycle drift to the console only (8 cycles, no single representative
number worth graphing) — inspect the test output, not the dashboard.

### Per-Test Reference

| ID | What it measures | Duration | Key metrics to watch |
|----|-----------------|----------|---------------------|
| **P1** | Initial page load | ~3s | CLS, maxFrame, LoAF. First render quality. |
| **P2** | Grid mousewheel scroll (30 events) | ~4s | severe, p95Frame, domChurn. Scroll smoothness. |
| **P3** | Scrubber seek to 50% (date sort) | ~5s | maxFrame, LoAF. Buffer replacement cost. |
| **P3b** | Scrubber seek to 50% (keyword sort) | ~8s | Same. Exercises composite-agg + binary-search path. |
| **P4a** | Grid→Table density switch | ~2s | maxFrame, domChurn, **focusDriftPx**. Mount/unmount cost. |
| **P4b** | Table→Grid density switch | ~2s | Same. Typically lighter than P4a. |
| **P5a/b/c** | Panel open/close | ~3s | CLS, maxFrame. Should be near-zero. |
| **P6** | Sort direction toggle | ~6s | maxFrame, LoAF, **focusDriftPx**. "Never Lost" accuracy. |
| **P7** | Scrubber thumb drag | ~5s | domChurn, maxFrame. Direct-DOM write path smoothness. |
| **P8** | Table fast scroll (40 events) | ~6s | severe, p95Frame, CLS, domChurn. **Known worst case.** |
| **P9** | Sort field change | ~3s | maxFrame, CLS. Full result set replacement. |
| **P10** | Full workflow composite | ~20s | `report: false` — not in diff tables. Stress test only. |
| **P11** | Thumbnail CLS after seek (3 positions) | ~15s | CLS per seek position. Image loading stability. |
| **P11b** | Same, keyword sort variant | ~15s | CLS comparison across sort types. |
| **P12** | 8 density switches after deep scroll | ~60s | Per-cycle drift (console), domChurn, severe. Accumulating error. |
| **P13a/b** | Image detail enter/exit | ~5s | CLS, maxFrame. Overlay transition quality. Scroll restoration. |
| **P14a** | Image traversal, normal (10 fwd @ 2/s) | ~6s | maxFrame, severe. Browsing-pace image swap smoothness. |
| **P14b** | Image traversal, fast burst (15 fwd @ 5/s + 3s settle) | ~7s | severe during burst, CLS/LoAF during settle. Does the app load only the final image? |
| **P14c** | Image traversal, fast backward (10 back @ 5/s + 3s settle) | ~6s | Same as P14b, reverse direction. Prefetch-behind effectiveness. |
| **P14d** | Image traversal, rapid burst (20 fwd @ 12/s + 3s settle) | ~5s | Cancellation stress test. Held arrow key — most images won't render. |
| **P15a/b/c** | Fullscreen enter/traverse/exit | ~4s | maxFrame. Should be near-zero (Fullscreen API is cheap). |
| **P16a/b** | Column drag-resize + double-click fit | ~3s | maxFrame, domChurn. CSS-variable path. Should be near-zero. |

### Jank metrics glossary

| Metric | Unit | What it means | Good | Bad |
|--------|------|---------------|------|-----|
| CLS | ratio | Cumulative Layout Shift (unexpected shifts only) | < 0.01 | > 0.1 |
| maxFrame | ms | Worst single frame duration (rAF delta) | < 50 | > 200 |
| severe | count | Frames > 50ms | 0 | > 10 |
| p95Frame | ms | 95th percentile frame duration | < 20 | > 50 |
| domChurn | count | DOM mutations (add + remove + attribute changes) | < 500 | > 10k |
| loafBlocking | ms | Total Long Animation Frame blocking time | < 50 | > 500 |
| focusDriftPx | px | Focus position change across transition | 0 | > viewportHeight |
| focusDriftRatio | ratio | Focus position change as fraction of viewport | 0.0 | > 0.5 |

---

## Perceived suite — instrumentation

The owning module is **`src/lib/perceived-trace.ts`**. The whole feature is
removable by deleting that file and reverting its ~10 call sites.

### When marks are collected

| Environment | Default | How to enable |
|---|---|---|
| Production build | **Never.** Tree-shaken via `import.meta.env.DEV` gate. Zero runtime cost. | n/a — by design |
| Dev (`npm run dev`) | Off — keeps console clean | `localStorage.setItem("kupua_perceived_perf", "1")` then refresh |
| Playwright (any perf run) | Always on — Playwright sets the flag before navigation | n/a — automatic |

Real users see nothing, ever. Devs opt in. Tests are unconditional.

The two gates are independent and serve different audiences: `import.meta.env.DEV`
is the production-safety gate (tree-shakes the code path out of real users'
bundles); the `localStorage` flag is the dev-noise gate (so a fresh `npm run dev`
isn't accumulating `performance.mark()` entries and a 500-item ring buffer in
every dev's browser by default).

### How marks are stored

Each `trace()` call has two side-effects:

1. `performance.mark("perceived:<action>:<phase>", { detail: payload })` —
   visible in DevTools → Performance panel.
2. Push onto `window.__perceivedTrace__` ring buffer (capped at 500
   entries, oldest evicted). Carries the rich `payload`.

Helpers exposed on window when enabled:
- `window.__perceivedTrace__` — the buffer; read directly.
- `window.__perceivedTraceClear__()` — wipe buffer (Playwright calls
  before each scenario).

### Canonical API contract

`src/lib/perceived-trace.ts` MUST export exactly this signature. Call sites
depend on it; do not bikeshed.

```ts
export interface TraceEntry {
  action: string;       // e.g. "sort-around-focus", "home-logo", "scrubber-seek"
  phase: string;        // e.g. "t_0", "t_ack", "t_status_visible", "t_settled"
  t: number;            // performance.now() at emission
  payload?: unknown;    // optional per-action context
}

export function trace(action: string, phase: string, payload?: unknown): void;
```

Phase markers (in causal order):
- `t_0` — user-initiated event (click, key, navigation commit). The audit
  doc's "Trigger boundaries" table prescribes the exact site for each action.
- `t_ack` — earliest visible response (loading state set, banner shown).
- `t_status_visible` — a status affordance (spinner, banner) became visible.
- `t_seeking` — a sub-phase of multi-stage actions (e.g. sort-around-focus
  reaches the seek step).
- `t_first_useful_pixel` — first row of new content available.
- `t_settled` — operation complete; UI stable.

`computeMetrics()` (in both spec files) takes the **first** `t_0` and **last**
`t_settled`, allowing UI-layer `t_0` to supersede a store-layer fallback.

### Call-site shape

Always one line, never wrapped in conditionals — the `ENABLED` gate inside
`trace()` is the only check:

```ts
import { trace } from "@/lib/perceived-trace";

trace("sort-around-focus", "t_0", { sort, focusedId });
trace("sort-around-focus", "t_status_visible");
trace("sort-around-focus", "t_settled");
```

### When to run the perceived suite

Same manual-only / TEST-cluster discipline as the jank suite. Re-run after
touching:

- `src/stores/search-store.ts` — search / seek / extend / sort-around-focus
- `src/hooks/useDataWindow.ts`, `src/hooks/useScrollEffects.ts`
- `src/lib/orchestration/`, `src/lib/reset-to-home.ts`
- Position-map / phantom-focus / sort-around-focus paths
- Status banners (`StatusBar.tsx`; anywhere `sortAroundFocusStatus` is set/read)
- Any `trace()` call site or the `perceived-trace.ts` module itself

The agent should **suggest** running the suite to the user — never run it
autonomously (real ES required, per-session permission).

### Targets (Phase 1, from `exploration/docs/perceived-perf-audit.md`)

| Action | Target median | Hard ceiling p95 |
|---|---|---|
| Logo / home / reset / panel toggle | <100 ms ack, <200 ms settle | 300 ms settle |
| Density swap | <100 ms ack, <400 ms settle | 800 ms settle |
| Filter / sort toggle | <100 ms ack, <1 s settle | 2 s settle |
| Search (warm) | <100 ms ack, <1.5 s first useful pixel | 3 s |
| Search (cold) | <100 ms ack, <2.5 s first useful pixel | 4 s |
| Sort-around-focus | <100 ms ack, <2 s settle | 4 s; status banner ≤2 s |
| Scrubber seek | <100 ms ack on click, <1 s first useful pixel | 2 s |

Calibration anchors:
- Home logo at ~200 ms is **felt** — lower discomfort bar.
- Removed scripted sort at ~14 s was **unacceptable** — upper bar.

### Debugging a single complaint without a full suite run

1. `npm run dev`.
2. DevTools console: `localStorage.setItem("kupua_perceived_perf", "1")` then refresh.
3. Reproduce the slow action.
4. `copy(JSON.stringify(window.__perceivedTrace__, null, 2))`. Paste into a file.

Or read historical results directly:
```bash
cat e2e-perf/results/perceived-log.md   # human-readable, both kinds
cat e2e-perf/results/perceived-log.json # machine-readable
```
