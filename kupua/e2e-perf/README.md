# Perf Test Suite — Reference

> Quick reference for humans and agents interpreting perf audit results.
> The tests live in `perf.spec.ts`, the harness in `run-audit.mjs`.

## How to Run

```bash
# Terminal 1 — start app against real ES
./scripts/start.sh --use-TEST

# Terminal 2 — run all tests
node e2e-perf/run-audit.mjs --label "Description" --runs 1

# Terminal 2 — run specific tests
node e2e-perf/run-audit.mjs P4a,P4b,P6 --label "Quick check"

# Terminal 2 — stable baseline (median of 3)
node e2e-perf/run-audit.mjs --label "Baseline" --runs 3
```

## Test Inventory

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

### Metrics Glossary

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

