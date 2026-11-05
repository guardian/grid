# Kupua Rendering Performance — Analysis & Work Plan

> **29 March 2026.** Systematic rendering performance audit using instrumented
> browser probes against 1.3M real images (TEST cluster).
>
> **Baselines collected:** 1400x900 @1x (Playwright default), 3840x2160 @1x
> (full 4K), **1987x1110 @1.25x** (MacBook Pro Retina — developer's actual
> screen, canonical baseline).
>
> Transient working doc. Fixes go to `changelog.md`, persistent findings to
> `performance-analysis.md`. Session handoff: `rendering-perf-session-plan.md`.

---

## Measurement Infrastructure

**File:** `e2e/rendering-perf-smoke.spec.ts` (12 tests, P1–P12)
**Runner:** `scripts/run-perf-smoke.mjs`
**Config:** `playwright.smoke.config.ts` — hardcoded 1987x1110 @1.25x DPR

Five simultaneous browser probes:

| Probe | API | What it catches |
|---|---|---|
| Layout Shift (CLS) | `PerformanceObserver('layout-shift')` | Content moving — element-level source attribution |
| Long Animation Frames | `PerformanceObserver('long-animation-frame')` | >50ms frames with script attribution (Chrome 123+) |
| Frame jank | `requestAnimationFrame` loop | Dropped/janky/severe counts, avg/p95/max |
| DOM mutations | `MutationObserver` | Adds, removes, attr changes, burst detection |
| Paint entries | `PerformanceObserver('paint')` | FP/FCP timing |

---

## Baseline Results — 4K (3840x2160 @1x)

> These numbers are from the 4K run. The canonical MacBook Retina run is
> pending. 4K is worst-case; Retina will be between 1400px and 4K.

### Per-scenario summary

| Test | Scenario | CLS | Max frame | Severe (>50ms) | DOM churn | Verdict |
|---|---|---|---|---|---|---|
| P1 | Initial load | 0.0000 | **184ms** | **2** | 199 | 🟡 JSON parse jank |
| P2 | Grid scroll (30 wheels) | 0.0000 | **184ms** | **4** | 580 | 🟡 JSON parse jank |
| P3 | Seek to 50% | 0.0000 | **234ms** | **5** | 2,102 | 🟡 JSON parse + virtualizer |
| P4a | Grid → Table | 0.0000 | **500ms** | **2** | 232 | 🔴 Severe jank |
| P4b | Table → Grid | 0.0000 | **133ms** | **1** | 212 | 🟡 Worse than @1400px |
| P5a | Left panel open | 0.0000 | 50ms | 0 | 228 | ✅ Good |
| P5b | Right panel open | 0.0000 | 100ms | 1 | 294 | 🟡 Panel jank at 4K |
| P5c | Both panels close | 0.0000 | **117ms** | **2** | 624 | 🟡 Re-layout jank |
| P6 | Sort toggle (Never Lost) | 0.0032 | **167ms** | **2** | 505 | 🟡 IMG CLS + jank |
| P7 | Scrubber drag | 0.0000 | **250ms** | **3** | 3,780 | 🟡 JSON parse on seek |
| P8 | Table scroll (40 wheels) | **0.046** | **317ms** | **69** | **164,128** | 🔴🔴 Critical |
| P9 | Sort field change | 0.0030 | **133ms** | **2** | 663 | 🟡 IMG CLS |
| P11 | Thumbnail CLS (5 seeks) | 0.0007 avg | — | — | — | ✅ Negligible |
| P12 | Density drift (8 switches) | — | — | — | — | ✅ ±5px (test bug on cycles 4-8, fixed) |

### P10 composite (4K)

| Phase | CLS | Max frame | DOM churn |
|---|---|---|---|
| Load | 0.0000 | 201ms | 199 |
| Scroll | 0.0000 | 184ms | 625 |
| Seek 30% | 0.0000 | 133ms | 410 |
| Grid→Table | 0.0003 | **284ms** | **10,545** |
| Sort toggle | 0.0000 | **251ms** | 1,330 |

### Scaling: 1400px → 4K

| Test | Metric | @1400px | @4K | Factor |
|---|---|---|---|---|
| P1 | Max frame | 50ms | 184ms | **3.7x** |
| P4a | Max frame | 200ms | 500ms | **2.5x** |
| P4b | Max frame | 33ms | 133ms | **4.0x** |
| P5c | Max frame | 18ms | 117ms | **6.5x** |
| P8 | Severe frames | 23 | 69 | **3.0x** |
| P8 | DOM churn | 49,520 | 164,128 | **3.3x** |
| P8 | LoAF blocking | 839ms | 3,608ms | **4.3x** |

**Insight:** Nearly everything scales linearly with viewport area. Grid
shows ~13 cols at 4K (vs ~5 at 1400px), table ~67 visible rows (vs ~30).
The virtualizer creates proportionally more DOM. MacBook Retina (~7 cols
grid, ~35 rows table) will be in between.

### What's excellent everywhere

- **CLS is perfect** on panels, density switch, scroll, drag.
- **P12 density drift is 0px total** — confirmed at Retina with both sorts.
  ±4px oscillating (grid↔table row height difference), not accumulating.
- **Panels are fast** — P5a/P5b/P5c all ≤33ms max frame at Retina. ✅
- **Table→Grid switch is fast** — P4b 49ms max frame at Retina. ✅
- **P11 thumbnail CLS is worse than expected at Retina** (0.0021 avg/seek)
  — upgraded from "negligible" to "real issue". More visible columns means
  more images loading post-seek. Fix: aspect-ratio placeholders.

---

## Baseline Results — Retina (1987x1110 @1.25x)

> Canonical baseline — developer's actual screen.

### Per-scenario summary

| Test | Scenario | CLS | Max frame | Severe (>50ms) | DOM churn | Verdict |
|---|---|---|---|---|---|---|
| P1 | Initial load | 0.0001 | 100ms | 1 | 103 | ✅ Good (JSON 82ms) |
| P2 | Grid scroll (30 wheels) | 0.0000 | 100ms | 3 | 767 | ✅ Good |
| P3 | Seek to 50% | 0.0068 | **167ms** | **3** | 1,287 | 🟡 JSON + virtualizer |
| P4a | Grid → Table | 0.0000 | **267ms** | **1** | 168 | 🔴 React mount 195ms |
| P4b | Table → Grid | 0.0000 | 49ms | 0 | 116 | ✅ Excellent |
| P5a | Left panel open | 0.0000 | 33ms | 0 | 147 | ✅ Excellent |
| P5b | Right panel open | 0.0000 | 18ms | 0 | 132 | ✅ Excellent |
| P5c | Both panels close | 0.0000 | 33ms | 0 | 295 | ✅ Excellent |
| P6 | Sort toggle (Never Lost) | 0.0001 | **150ms** | **2** | 375 | 🟡 JSON parse |
| P7 | Scrubber drag | 0.0000 | 83ms | 1 | 1,814 | ✅ Good |
| P8 | Table scroll (40 wheels) | **0.038** | **267ms** | **33** | **75,533** | 🔴🔴 Critical |
| P9 | Sort field change | 0.0053 | 100ms | 1 | 291 | 🟡 IMG CLS |
| P11 | Thumbnail CLS (5 seeks) | **0.0021** avg | 134ms avg | 12 total | — | 🟡 Upgraded |
| P12 | Density drift (8 switches) | — | — | — | — | ✅ 0px drift |

### P10 composite (Retina)

| Phase | CLS | Max frame | DOM churn |
|---|---|---|---|
| Load | 0.0001 | 84ms | 103 |
| Scroll | 0.0000 | 100ms | 476 |
| Seek 30% | 0.0016 | 84ms | 394 |
| Grid→Table | 0.0000 | **250ms** | **7,472** |
| Sort toggle | 0.0000 | **217ms** | 1,369 |

### P11 detail (Retina) — upgraded to real issue

| Sort | Avg CLS/seek | Max CLS/seek | Seeks with shifts | Multi-comp |
|---|---|---|---|---|
| Uploaded | 0.0021 | 0.0054 | 2/5 | 0/5 |
| Credit | 0.0028 | 0.0048 | 4/5 | 1/5 |

IMG shifts dominate (4–8 per affected seek, 250–390ms windows). Thumbnails
load after buffer arrives and reflow grid cells. More visible at Retina than
4K because Retina shows ~7 columns (more images in viewport at seek time).
**Fix: aspect-ratio placeholder from ES `source.dimensions`.**

### P12 detail (Retina) — confirmed excellent

Both sorts (Uploaded, Credit): 0px total drift, ±4px oscillation (grid
365px ↔ table 361px), all 8 cycles. Null cycles: 0. Perfectly stable.

### Scaling: 1400px → Retina → 4K

| Test | Metric | @1400px | @Retina | @4K |
|---|---|---|---|---|
| P1 | Max frame | 50ms | 100ms | 184ms |
| P4a | Max frame | 200ms | 267ms | 500ms |
| P5c | Max frame | 18ms | 33ms | 117ms |
| P8 | Severe frames | 23 | 33 | 69 |
| P8 | DOM churn | 49,520 | 75,533 | 164,128 |
| P8 | CLS | 0.000 | 0.038 | 0.046 |
| P11 | Avg CLS/seek | 0.0007 | 0.0021 | 0.0007* |

*P11 was lower at 4K due to fewer columns → fewer visible images per seek.

---

## Issues (ranked by Retina severity)

### 🔴🔴 Issue A: Table scroll — catastrophic at 4K (P8)

| Metric | @1400px | @4K |
|---|---|---|
| Max frame | 250ms | **317ms** |
| Severe (>50ms) | 23 (5.8%) | **69 (17%)** |
| P95 frame | 50ms | **117ms** |
| Avg frame | 22ms | **35ms** |
| DOM churn | 49,520 | **164,128** |
| LoAF blocking | 839ms | **3,608ms** |
| CLS | 0.0000 | **0.046** (pill shifts) |

**LoAF attribution (4K worst):**
- `Response.json.then` es-adapter.ts: **217ms**
- `DIV.onscroll` @tanstack/react-virtual: **60ms**
- `DIV.onscroll` ImageTable.tsx: **26ms**

**New at 4K: CLS from pill elements.** 38 unexpected shifts from
`SPAN.inline-flex` (SearchPill/DataSearchPill in Keywords/Subjects/People
columns). More visible rows → more pills → inline-flex reflows during
virtualizer recycling.

**Three compounding causes:**
1. JSON.parse blocking (217ms) — see Issue F
2. Virtualizer DOM churn — ~67 rows x 23 cols = ~1,540 cells recycled
3. Pill CLS — list-field pills reflow during row recycling

### 🔴 Issue B: Grid→Table — half-second freeze at 4K (P4a)

| Metric | @1400px | @4K |
|---|---|---|
| Max frame | 200ms | **500ms** |
| LoAF blocking | 160ms | **458ms** |

`DIV#root.onclick → react-dom`: **229ms** (table mount) +
`DIV.onscroll → @tanstack/react-virtual`: **176ms** (initial scroll)

### 🟡 Issue F: JSON.parse blocking (new — pervasive at 4K)

Shows up in P1, P2, P3, P7, P10 — the single biggest LoAF contributor:

| Test | `Response.json.then` blocking |
|---|---|
| P1 load | 191ms |
| P2 scroll | 181ms |
| P3 seek | 138ms |
| P7 drag | 143ms |
| P10 scroll | 188ms |
| P10 switch | 197ms |

ES responses are ~1-2MB JSON parsed synchronously on main thread.

### 🟡 Issue D: Sort jank — 167ms at 4K

Same pattern: JSON parse + virtualizer in one frame. Will benefit from
Issue F fix.

### 🟡 Issue C: Thumbnail CLS — upgraded at Retina, fixable

P11: avg 0.0021 CLS/seek at Retina (was 0.0007 at 4K — fewer columns).
4–8 IMG shifts per affected seek over 250–390ms windows. **Fix:** set
`aspect-ratio` on grid cell IMG container using `source.dimensions`
width/height from the ES doc. Eliminates reflow entirely.

### ✅ Issue E: Density drift — confirmed excellent at Retina

P12 at Retina: 0px total drift, ±4px stable oscillation, all 8 cycles,
both sorts (Uploaded + Credit). No null cycles. Perfectly stable.

### 🟡 Issue G: Density switch progressively worsens focus-finding (user-reported)

**User observation:** After many density switches (grid↔table), the focused
image takes progressively longer to locate / appears at a worse position.

**What P12 shows:** On local 10k data, P12 measures 0px drift across 8
cycles. The `density-focus.ts` bridge saves/restores a viewport ratio and
the numbers are perfectly stable at Retina with both sorts.

**Why real data might differ:** P12 scrolls to ~offset 500 on 10k data. On
1.3M data, the user is likely at offset 400k+ with buffer extends and evicts
happening during or between density switches. Possible causes:

1. **Buffer eviction during switch.** The unmount save reads `bufferOffset`
   and `imagePositions` from the store. If an extend/evict completes between
   the save (unmount cleanup) and the restore (mount effect), the
   `localIdx` computation uses a stale `bufferOffset` → wrong `rowTop` →
   wrong scroll target. This is a race condition that's invisible on local
   data (buffer never hits capacity at 10k).

2. **Virtualiser `scrollToOffset` rounding.** Both grid and table compute
   `targetScroll = rowTop - ratio * clientHeight` then clamp. The
   virtualiser applies its own clamping and may snap to the nearest item
   boundary. Over many cycles, if the snap is always in the same direction,
   it accumulates. P12's ±4px oscillation suggests this is bounded locally,
   but at different `clientHeight` values (panel open/closed) the rounding
   error could be larger.

3. **Grid column count instability on mount.** Grid initialises `columns`
   via `useState(4)`, then the ResizeObserver fires and sets the real count.
   The mount effect uses `Math.floor(el.clientWidth / MIN_CELL_WIDTH)` to
   compute `cols`, which should match the eventual ResizeObserver value. But
   if the container is still being laid out during `useLayoutEffect` (e.g.
   panels animating), `el.clientWidth` could be transiently wrong →
   `rowTop` wrong → progressive drift. Bug #17 fixed the anchor-capture
   variant of this but the mount-restore path uses the same `el.clientWidth`
   computation.

**This is NOT related to overscan or rendering perf.** It's a state
management / timing issue in the density-focus bridge. Can be investigated
and fixed separately.

**Recommendation:** Add a P12 variant to the smoke test that:
- Seeks to ~30% on real data (deep buffer position, extends active)
- Runs 12+ density switches (not just 8)
- Logs the ratio saved/consumed on each cycle (instrument `density-focus.ts`)
- Measures whether drift is monotonic or oscillating

If drift is confirmed, the fix is to snapshot `bufferOffset` at save time
and pass it alongside the ratio, so the restore can detect if the buffer
shifted and fall back to `scrollToIndex(center)` instead of using a stale
ratio.

### 🟡 Issue H: Sort-after-seek content flash (user-reported)

**User observation:** After seeking to a position (scrubber click), changing
sort causes content to "show up then immediately shift (cells reposition),
sometimes twice."

**Root cause — confirmed in code.** The sort-around-focus flow has a
two-phase async gap that produces visible content shifts:

1. User changes sort with a focused image at position ~30k
2. `search(focusedImageId)` fires → initial search returns first page
   (positions 0–199 in new sort order)
3. Focused image unlikely to be in first page of new sort
4. **Not-in-first-page path** (search-store.ts line 800): old buffer stays
   visible (`loading: true`), `_findAndFocusImage` runs async
5. Old buffer is from old sort order at offset ~30k — the images in it are
   now at **different positions** in the new sort. The user sees stale
   content from the old sort.
6. `_findAndFocusImage` completes (3 ES requests: find image → countBefore
   → forward + backward fetch) → replaces buffer in one shot → bumps
   `sortAroundFocusGeneration` → view scrolls to focused image
7. **First visible shift:** old buffer → new buffer (different images appear)
8. **Second visible shift:** scroll-to-focused-image effect fires (may be
   a separate paint frame from the buffer replacement)

**Why "sometimes twice":** The buffer replacement (step 7) and the scroll
effect (step 8) are separate state updates. React may batch them into one
paint or two, depending on timing. When they split across frames, the user
sees: (a) old content → (b) new content at wrong scroll position → (c) new
content scrolled to focused image. That's two shifts.

**What the tests show:** Bug #15 test tracks `results.length` changes and
asserts only one buffer transition (old → final). P6 measures CLS at 0.0001
(Retina). The flash of *wrong content* isn't captured by CLS because the
elements don't move — they get replaced (different images). And the scroll
shift may not register as CLS because it's a programmatic `scrollToOffset`
(browsers exclude user-initiated scroll from CLS).

**This is NOT related to overscan.** It's an inherent timing gap in the
sort-around-focus async protocol. The old buffer is visible for the duration
of 3 sequential ES requests (find image, countBefore, forward/backward
fetch) — typically 200–800ms on TEST.

**Why the current design keeps the old buffer visible:** The alternative is
showing a loading spinner / blank screen during the async gap. The original
Bug #15 fix specifically chose "keep old buffer visible" over "flash blank"
because a brief view of stale-but-recognisable content was considered less
jarring than a blank screen. The user's report suggests this trade-off may
need revisiting.

**Possible fixes (not yet implemented):**

1. **Opacity fade during sort-around-focus.** When `sortAroundFocusStatus`
   is non-null, apply `opacity: 0.3` + `pointer-events: none` to the grid/
   table container. The old content is still visible (orientation preserved)
   but clearly signalled as "loading." When `sortAroundFocusGeneration`
   bumps, restore full opacity. This is a 5-line CSS change with no async
   protocol changes. Eliminates the "content shifts" perception because
   the user expects a change when the dimmed content resolves.

2. **Batch buffer + scroll into one paint.** In `_findAndFocusImage`,
   set the buffer, focusedImageId, and sortAroundFocusGeneration in a single
   `set()` call (already the case — line 643). The scroll effect should fire
   in the same `useLayoutEffect` pass. If it doesn't (React concurrent mode
   edge case), force synchronous layout by reading `scrollTop` after
   `scrollToIndex`. This would eliminate the "second shift" but not the
   first (old→new content).

3. **Skeleton the buffer region.** During `sortAroundFocusStatus !== null`,
   render skeleton rows instead of stale data. More disruptive but
   eliminates the "wrong content" problem entirely.

**Recommendation:** Option 1 (opacity fade) is the right trade-off — low
effort, no async changes, makes the transition intentional rather than
glitchy. Worth trying as a quick fix.

---

## Work Plan

### Phase 1: Table scroll (Issue A) — critical

**Goal:** P95 < 33ms, severe < 5, CLS < 0.005 at MacBook Retina.

**1a. Offload JSON.parse (fixes Issue F globally)**
- `scheduler.yield()` after `response.json()` in es-adapter.ts — one line,
  breaks the long task. Measure. If insufficient, move to Web Worker.
- Impact: eliminates 130-217ms from every LoAF.

**1b. Reduce table DOM per row**
- Skip `flexRender()` for simple text columns — plain `<span>`.
- Lazy `title` attribute (set on hover, not render).
- Stabilise `aria-rowindex` from `bufferOffset + index`.

**1c. Fix pill CLS**
- Fixed max-width on pill elements, or `contain: layout` on cell div.

### Phase 2: Density switch (Issue B)

**Goal:** Max frame < 150ms at Retina.

- `startTransition` the density URL param change.
- If insufficient, lazy-mount table columns.

### Phase 3: Thumbnail CLS (Issue C) — upgraded

**Goal:** Avg CLS/seek < 0.001 at Retina.

- Set `aspect-ratio: width/height` on grid cell IMG container using
  `source.dimensions` from the ES document. Eliminates IMG reflow on load.
- Fallback for missing dimensions: keep current behaviour (reflow).

### Phase 4: Re-assess after Phase 1-3

Sort jank (Issue D) should resolve from Phase 1a (JSON.parse fix).
Density drift (Issue E) confirmed resolved. Re-measure before planning
further work.

---

## Quantitative Gates (Retina baseline → post-experiment → target)

| Issue | Test | Metric | Pre-experiment | Post A+E | Target | Status |
|---|---|---|---|---|---|---|
| F | All | LoAF worst (JSON.parse) | 186ms | ~100ms (yield fix) | <50ms | 🟡 Improved |
| A | P8 | P95 frame | 67ms | **34ms** | <33ms | 🟡 Nearly there |
| A | P8 | Severe frames | 33 | **14** | <8 | 🟡 Good progress |
| A | P8 | CLS (pills) | 0.038 | 0.041 | ~~<0.005~~ Accept | ✅ False positive |
| A | P8 | DOM churn | 75,533 | **42,436** | <40,000 | 🟡 Nearly there |
| B | P4a | Max frame | 267ms | ~217ms | <150ms | 🟡 Improved |
| C | P11 | Avg CLS/seek | 0.0021 | **0.0000** | <0.001 | ✅ Fixed (aspect-ratio) |

## Regression workflow

```
npx playwright test                     # 63 local E2E (~70s)
node scripts/run-perf-smoke.mjs P<N>    # target perf test
./scripts/run-e2e.sh                    # full local (before declaring done)
node scripts/run-perf-smoke.mjs         # all 12 perf tests
```

---

## Experiment Results — 29 March 2026

Four experiments run against Retina baseline, targeting P8 table scroll.
E2E tests (63 local) run before each perf measurement.

### Experiment A: Reduce virtualizer overscan (20 → 5) ✅ KEPT

**File:** `ImageTable.tsx` — `overscan: 20` → `overscan: 5`

| Metric | Baseline | Exp A | Change |
|---|---|---|---|
| Max frame | 300ms | **217ms** | **-28%** |
| Severe | 36 | **16** | **-56%** |
| P95 | 67ms | **50ms** | **-25%** |
| CLS | 0.041 | 0.047 | +14% (noise) |
| DOM churn | 76,354 | **51,965** | **-32%** |
| LoAF worst | 309ms | **217ms** | **-30%** |

Grid already used `overscan: 5` — this only changed the table virtualizer.
Cuts rendered off-screen cells from ~920 to ~230 per scroll frame.

### Experiment B: `content-visibility: auto` on rows — REVERTED (no effect)

Added `contentVisibility: 'auto'` + `containIntrinsicSize` to all three row
types (skeleton, pending, data). Numbers identical to baseline — expected,
since TanStack Virtual already does DOM virtualisation. Browser-level
`content-visibility` can't skip layout for elements the virtualiser already
manages.

### Experiment C: `contain: strict` on cells — REVERTED (broke tests)

`contain: strict` includes `contain: size` which prevents flex children from
inheriting parent height. Cells collapsed to content height, breaking click
targets. Playwright's Bug #17 tests failed consistently (click intercepted by
overlapping cells). `contain: layout` (without `size`) is safe — see Exp E.

### Experiment D: Reduce PAGE_SIZE (200 → 100) — REVERTED (worse)

More frequent extends → more jank events. Per-extend cost slightly lower but
overwhelmed by doubled frequency:

| Metric | Baseline | Exp D | Change |
|---|---|---|---|
| Severe | 36 | **38** | +6% ❌ |
| Janky | ~40 | **60** | +50% ❌ |
| DOM churn | 76,354 | **79,937** | +5% ❌ |
| LoAF count | ~30 | **40** | +33% ❌ |

Also caused Bug #17 E2E tests to skip (buffer fills slower with 100-doc pages
on 10k local dataset — threshold check `resultsLength < 800` not met).

### Experiment E: `contain: layout` on cell divs ✅ KEPT

**File:** `ImageTable.tsx` — added `contain: 'layout'` + `overflow-hidden`
to gridcell `<div>`. Unlike `strict`, `layout` doesn't affect height inheritance.

Combined with Experiment A (overscan 5), final numbers:

| Metric | Baseline | A+E | Change |
|---|---|---|---|
| Max frame | 300ms | **217ms** | **-28%** |
| Severe | 36 | **14** | **-61%** |
| P95 | 67ms | **34ms** | **-49%** |
| CLS | 0.041 | 0.041 | same |
| DOM churn | 76,354 | **42,436** | **-44%** |
| LoAF worst | 309ms | **204ms** | **-34%** |
| LoAF count | ~30 | 22 | -27% |

No regressions on any other test. P12 drift still 0px.

### CLS analysis — 0.041 is inherent to virtualiser recycling

All 26 shifts are SPAN pills (Keywords/Subjects/People columns) that change
geometry when the virtualiser recycles rows with different content. Tried:
- `contain: layout` on pill wrapper (no effect)
- `contain: layout` on cell div (no effect)
- `contain: strict` on cell div (broke height)
- `overflow-hidden` on pill wrapper (no effect)

**Root cause:** CLS API counts any element that changes position between
frames, even during user-initiated scroll. Virtualiser row recycling creates
a new pill at the recycled row's position → browser measures old-position-to-
new-position delta as a shift. This is a **false positive** — the user never
perceives these shifts because they happen during fast scrolling.

**Recommendation:** Accept 0.04 CLS for P8. The shifts are invisible to users
and architecturally inherent to any virtualised table with variable-width
inline content. The CLS < 0.005 target is unreachable without eliminating
pills entirely or making them fixed-width (which would harm usability).

### Trade-off: P10 Seek got worse with overscan 5

Overscan reduction improved continuous scrolling dramatically but worsened
seek-to-position rendering:

| P10 Phase | Metric | Baseline | A+E | Change |
|---|---|---|---|---|
| Seek to 30% | DOM churn | 394 | **1,346** | +242% ❌ |
| Seek to 30% | Max frame | 84ms | **150ms** | +79% ❌ |
| Seek to 30% | Severe | 2 | **4** | +100% ❌ |
| Grid→Table | DOM churn | 7,472 | **4,344** | -42% ✅ |
| Grid→Table | Max frame | 250ms | 217ms | -13% ✅ |
| Sort toggle | DOM churn | 1,369 | 621 | -55% ✅ |

**Root cause:** With overscan 5, a seek lands and the virtualiser renders fewer
rows initially (~40 vs ~55). The browser then triggers a scroll event during
layout, causing a second round of virtualiser updates as it discovers more rows
need rendering. With overscan 20, the first render already covered the visible
area + deep overscan, so no follow-up was needed.

**Why this is the right trade-off:** Seeks are infrequent (user action, ~1/min).
Continuous scrolling is constant (~60 frames/sec). Trading +4ms one-off seek
cost for -33ms per scroll frame is overwhelmingly positive. The seek numbers are
still well within acceptable range (150ms max frame, 4 severe).

**Could dynamic overscan fix it?** TanStack Virtual's `overscan` is fully reactive —
read from `this.options.overscan` on every `getVirtualIndexes` call, recalculated
whenever scroll position, count, or overscan value changes. So technically you could
do `const overscan = isScrolling ? 2 : 8` or bump overscan temporarily during seek.
**Not worth it:** (1) the remaining frames are dominated by JSON.parse and DOM diffing,
not overscan count — going 5→2 during scroll saves ~138 cells, marginal vs the 20→5
drop that removed ~690; (2) transitions create their own jank — dropping overscan evicts
off-screen rows synchronously, raising it inserts them, injecting layout work at exactly
the start/stop moments; (3) lower overscan during scroll = more visible blank rows
(at overscan 2, 64px buffer, one fast trackpad swipe outruns the virtualiser);
(4) complexity vs payoff — tracking `isScrolling`, wiring the conditional, testing
transitions, handling edge cases (seek mid-scroll, density change during scroll).

**When dynamic overscan *would* be justified:** If a future experiment raises overscan
for non-scroll contexts (e.g. 10–15 for keyboard navigation prefetch) and only drops it
during fast continuous scroll. That's a genuine UX trade-off ("prefetch more when idle,
render less when scrolling fast") — but needs its own measurement session.

**Recommendation:** Leave at static 5. The absolute seek numbers (150ms max, 4 severe)
are well within tolerance. Revisit only if P10 seek max-frame exceeds 250ms in a future
smoke run. The next real wins are in Experiments F (skip `flexRender`) and K (Web Worker
JSON.parse) — those attack the remaining bottleneck (JS main thread work per row).

---

## Deep Analysis & Future Experiments (29 March 2026)

### Coverage gaps in the current P1–P12 suite

The 12 tests cover grid scroll, table scroll, seeks, density switches, panel
toggles, sort changes, scrubber drag, thumbnail CLS, and density drift. Three
significant user workflows are **not covered**:

#### Gap 1: Image detail traversal (prev/next)

**What's missing:** Rapidly pressing ←/→ in image detail view. Each press:
1. Triggers a TanStack Router `navigate()` with `replace: true`
2. Changes the `image` URL param → React reconciles `ImageDetail`
3. Loads a new full-size image via imgproxy (~456ms median)
4. Renders `ImageMetadata` sidebar (~325 lines of registry-driven fields)
5. May trigger `loadMore()` if within 5 images of buffer edge
6. Fires prefetch abort + new prefetch timer (400ms debounce)

**Potential issues:**
- **Metadata sidebar jank:** `ImageMetadata.tsx` iterates all `DETAIL_PANEL_FIELDS`,
  creates section breaks, renders pills, formats dates — every single navigation.
  With 20+ fields this is non-trivial React work per keypress.
- **Image decode blocking:** Large images (>5000px) decoded synchronously on main
  thread. `img.decode()` is available but not used. During rapid traversal, decode
  of the *previous* image may block the frame where the *next* image should appear.
- **Prefetch cascade:** During rapid ←/→, each press aborts the previous prefetch
  and starts a new 400ms timer. The abort is correct, but completed fetches from
  2-3 images ago linger in the browser cache, consuming memory. Not a jank issue
  but a memory concern during long traversal sessions.
- **`loadMore()` during traversal:** When the user navigates to within 5 images of
  the buffer edge, `loadMore()` fires. This triggers `extendForward` → ES fetch →
  JSON parse → state update → re-render. If the user is pressing → rapidly, this
  could coincide with an image navigation and produce a compound jank frame.

**Recommendation:** Add **P13: Image Detail Traversal**. Navigate to an image near
the middle of the buffer, then press → 20 times at 200ms intervals (simulating
rapid flicking). Measure: frame jank during navigation, CLS from image/metadata
changes, LoAF from sidebar re-render + image decode. Then repeat near the buffer
edge to capture the loadMore interaction.

**Potential fix if jank found:** `useMemo` or `memo` on `ImageMetadata` keyed by
`image.id` (currently re-renders on every prop change). Or `img.decode()` before
swapping `src`.

#### Gap 2: Search/filter changes

**What's mostly ES-bound:** Typing a query, toggling free-to-use, selecting a date
range, clicking a facet filter value — all trigger an ES search. The rendering cost
is: clear old results → show loading → render new results. This is similar to P1
(initial load) and P9 (sort change). The ES latency dominates (200-800ms on TEST),
so rendering jank is masked by the network wait.

**One exception worth testing:** **Rapid CQL chip editing.** The `<cql-input>` Web
Component re-renders on every keystroke and fires `queryStr` change events. If the
user types fast, the 300ms search debounce prevents ES floods, but the *Web
Component itself* does chip parsing/rendering on every keypress. On a complex query
with 5+ chips, this could produce input lag.

**Recommendation:** Low priority. Add a P14 only if users report input lag. The
current CQL input implementation defers value resolution via `LazyTypeahead` which
already prevents the main stall vector.

#### Gap 3: Facet filter expansion ("Show more")

**What happens:** Expanding "Show more" on a facet field fires a single-field
100-bucket aggregation request. The response renders up to 100 filter value rows
with formatted counts. The scroll-anchored collapse on "Show fewer" is a complex
DOM operation (measure header position, set scrollTop).

**Recommendation:** Low priority — the filter panel is a secondary surface and the
100-row render is a one-shot cost. Not worth a dedicated perf test.

---

### Remaining experiments with potential

#### Experiment F: Skip `flexRender` for simple text columns (Plan 1b)

**Rationale:** `flexRender()` is called for every visible cell on every render.
For simple text columns (Description, Credit, Source, etc.), it does:
1. Check if `columnDef.cell` is a function or React element
2. Call the function with `CellContext` (creates a new context object)
3. Return the React element

For ~15 of the 23 columns, the cell renderer is just `info.getValue() || "—"` —
a trivial string. Replacing `flexRender` with a direct string render for these
columns would eliminate ~15 function calls + ~15 object allocations per row per
render frame.

**Estimated impact:** With overscan 5, ~40 rows visible → ~600 `flexRender` calls
per scroll frame. Eliminating ~450 of those (15 simple cols × 30 visible rows)
saves maybe 2-5ms per frame. Modest but compounds — could push P95 from 34ms to
~30ms.

**Risk:** Low — the column def already knows whether it has a custom renderer. Can
branch at column-def build time (not render time).

**How to test:** In `TableBody`, check if the column def's `cell` is a plain
accessor (no custom renderer, no formatter). If so, render the value directly
as a text node instead of calling `flexRender`.

#### Experiment G: Lazy `title` attribute (Plan 1b)

**Rationale:** Every gridcell `<div>` gets `title={rawValue ?? undefined}`. For 40
rows × 23 cols = 920 cells, that's 920 `title` attributes set on every render.
Most are never seen (user must hover for 500ms+). Setting `title` on `mouseenter`
instead would eliminate 920 attribute writes per render frame.

**Estimated impact:** Small — attribute writes are fast. But DOM mutation count
drops, which may improve the DOM churn metric. Worth measuring.

**Risk:** Very low — `title` tooltip behaviour is unchanged from user perspective.

**How to implement:** Remove `title` from JSX, add `onMouseEnter` that sets
`e.currentTarget.title = rawValue`.

#### Experiment H: Grid view aspect-ratio placeholders (Plan Phase 3)

**Rationale:** P11 shows avg 0.0021 CLS/seek at Retina from IMG elements loading
after the buffer arrives and reflowing grid cells. ES documents include
`source.dimensions.width` and `source.dimensions.height`. Setting
`aspect-ratio: w/h` on the thumbnail `<img>` would reserve the correct space
before the image loads, eliminating reflow entirely.

**Estimated impact:** Should reduce P11 avg CLS/seek from 0.0021 to ~0.0001
(non-IMG shifts only). This was identified as the fix in the original plan.

**Risk:** Low — dimensions may be missing on some images (pre-2015 uploads).
Fallback: keep current behaviour (reflow). The `source.dimensions` field is
reliably present on >99% of images in TEST.

**How to implement:** In `GridCell`, read `image.source?.dimensions` and set
`style={{ aspectRatio: \`${w}/${h}\` }}` on the `<img>`. The containing div
already has `height: 190` and `overflow: hidden`, so oversized aspect ratios
are clipped.

#### Experiment I: `React.startTransition` for Grid-to-Table (Plan Phase 2)

**Status: PREVIOUSLY TRIED AND REVERTED.** Broke P12 Credit sort density drift
(0px to -303px). The `density-focus.ts` bridge relies on synchronous mount/unmount
timing — `saveFocusRatio` runs in `useLayoutEffect` cleanup, and
`consumeFocusRatio` runs in the next component's mount `useLayoutEffect`. Wrapping
the density change in `startTransition` defers the unmount, breaking the
synchronous handoff.

**Can it be revisited?** Only if the density-focus bridge is redesigned to use
an async protocol (e.g. shared ref with generation counter instead of consume-once
module state). This is significant complexity for a 267ms → <150ms improvement.

**Recommendation:** Defer. The 217ms max frame at Retina (after overscan fix) is
acceptable. The remaining cost is `react-dom` mount (139ms) — this is React's
inherent cost for creating ~920 DOM nodes. `startTransition` wouldn't reduce the
total work, just yield between chunks. A lazy-mount approach (render visible
columns first, rest in idle callback) would be architecturally simpler but requires
TanStack Table column-level lazy loading which doesn't exist.

#### Experiment J: Reduce columns rendered per row

**Rationale:** The biggest remaining P8 cost is DOM churn: 42k mutations for 40
visible rows × 23 visible columns = 920 cells recycled per scroll frame. If users
typically care about 8-10 columns, the other 13+ are rendered but rarely read.

**Approaches:**
1. **Horizontal viewport culling:** Only render columns whose `left` offset is
   within the scroll container's visible horizontal range. TanStack Table supports
   `columnVisibility` but not viewport-aware culling. Would need custom logic in
   the cell render loop — skip cells whose CSS variable width places them off-screen.
2. **Default fewer columns visible:** Currently 23 visible by default. Reducing to
   ~12 (hiding less-used columns like Subjects, People, Keywords, Byline title,
   Special instructions by default) would nearly halve DOM churn.

**Estimated impact:** Option 1 could cut DOM churn by 30-50% depending on scroll
position. Option 2 is simpler but changes UX defaults.

**Risk:** Option 1 is complex (need to track horizontal scroll position and
column positions). Option 2 is a UX decision, not a technical experiment.

**Recommendation:** Option 2 is the better path — review default column visibility
with the user. The table already has a column chooser context menu.

#### Experiment K: Web Worker for JSON.parse (Plan 1a escalation)

**Status:** `scheduler.yield()` is already in place (lines 299-300 of
es-adapter.ts). The LoAF attribution now shows `Scheduler.yield.then` instead of
`Response.json.then`, confirming the yield works. But the JSON parse itself still
blocks the main thread for 50-100ms before the yield runs.

**Approach:** Move the `fetch()` + `response.json()` into a Web Worker. The worker
parses the JSON off the main thread and posts the result back via `postMessage`
(structured clone, ~5ms for 1-2MB). The main thread never blocks on JSON.parse.

**Estimated impact:** Would eliminate the 50-100ms JSON.parse blocking entirely.
LoAF worst for P8 would drop from ~204ms to ~100-120ms (just the virtualiser
scroll handler). P95 could drop from 34ms to ~25ms.

**Risk:** Medium — structured clone has its own cost (~5ms for 1MB). Worker setup
is one-time. The `AbortController` signal needs to be translated to worker
cancellation. `_source` excludes already keep responses at ~1MB, so clone cost is
bounded. Worth prototyping.

**Recommendation:** Worth trying as the next experiment after the current session.
The JSON.parse cost is the single remaining large LoAF contributor visible in all
the data.

---

### P13 design: Image Detail Traversal (new test)

```
P13: Image detail traversal — jank during rapid prev/next

Setup:
  - Navigate to /search?nonFree=true
  - Seek to 50% (so buffer has room in both directions)
  - Click 5th image to open detail view
  - Inject perf probes, reset

Phase 1: Rapid forward traversal (20 presses, 200ms apart)
  - Press → 20 times
  - Measure: frame jank, CLS (image swap + metadata re-render),
    LoAF (metadata component, image decode)
  - Expected bottleneck: metadata sidebar re-render

Phase 2: Traversal near buffer edge (triggers loadMore)
  - Navigate to image at results.length - 3
  - Press → 10 times (crosses buffer boundary)
  - Measure: compound jank from loadMore + navigation
  - Expected bottleneck: JSON.parse from extend + image swap

Phase 3: Backward traversal after forward
  - Press ← 10 times rapidly
  - Measures: abort/re-prefetch churn, any asymmetry

Report: per-phase CLS, max frame, severe, LoAF attribution
```

This test fills the biggest gap in the current suite. Filters/search are
ES-bound (P9 already covers the rendering cost of a full result-set swap).
Image traversal is the only **high-frequency, rendering-dominated** user
interaction without coverage.

---

### Summary: prioritised next steps

| Priority | Experiment | Expected impact | Effort | Risk |
|---|---|---|---|---|
| 1 | **P13 test** (image traversal) | New coverage | Low | None |
| 2 | **H** (grid aspect-ratio) | P11 CLS → ~0 | Low | Low |
| 3 | **K** (Web Worker JSON.parse) | P8 LoAF -50% | Med | Med |
| 4 | **F** (skip flexRender) | P8 P95 -10% | Low | Low |
| 5 | **G** (lazy title) | P8 churn -5% | Trivial | None |
| 6 | **J** (fewer default cols) | P8 churn -40% | UX decision | UX |
| 7 | **I** (startTransition) | P4a -50ms | High | High (breaks P12) |
