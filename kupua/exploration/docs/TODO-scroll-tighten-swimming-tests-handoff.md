# Agent Handoff: Tighten Swimming Detection Tests

> **Date:** 6 April 2026
> **Author:** External audit agent (scroll stability assessment)
> **Status:** Ready to execute
> **Estimated effort:** 1 session (~3–4 hours)
> **Risk:** Low — adds tests only, zero changes to `src/`

---

## The Problem

Swimming — visible content displacement during buffer prepend operations
after seek — was the central scroll engineering problem across agents 5–13.
It was **never caught by automated tests**. Every detection was manual:
a human watching the app on real data and seeing images shift.

The existing tests measure the right *concept* (`firstVisibleGlobalPos`
stability) but miss swimming for three structural reasons:

### Why the local E2E tests miss it

1. **Polling granularity is too coarse.** The settle-window test
   (`scrubber.spec.ts` L704) polls `firstVisibleGlobalPos` every 50ms for
   1.5 seconds. Swimming is a 1–2 frame event (~16–32ms). A 50ms poll
   has a ~50% chance of landing between the prepend and the compensation
   — missing the shift entirely.

2. **The metric is row-granular, not pixel-granular.** `firstVisibleGlobalPos`
   is computed from `Math.floor(scrollTop / ROW_HEIGHT) * cols + bufferOffset`.
   A sub-row shift (e.g. 150px in a 303px grid row) rounds to the same row
   index → zero detected shift. But 150px is absolutely visible to a human.

3. **Local data is too small.** With 10k docs and `BUFFER_CAPACITY=1000`,
   the buffer often holds >10% of the result set. After seek, extends only
   prepend 200 items to a buffer that's already 300. The geometry that
   produces visible swimming (200-item prepend into a 300-item buffer where
   the viewport sits at the buffer's top edge) requires a buffer that's a
   tiny fraction of total — which only happens at 100k+ docs.

4. **The test pre-scrolls.** The settle-window test scrolls to
   `scrollTop=150` before seeking (L715). This puts the user at a non-zero
   position in the buffer, which means the reverse-compute produces a
   non-zero `_seekTargetLocalIndex`. The headroom-zone problem (where
   `reverseIndex < backwardItemCount`) only triggers when the user is at
   `scrollTop ≈ 0` — the exact scenario the pre-scroll avoids.

### Why the smoke tests catch it (but aren't in CI)

The smoke tests (`smoke-scroll-stability.spec.ts`) run against TEST (1.3M
docs). They detect swimming because:
- The buffer is 0.08% of the result set (realistic geometry)
- They poll at the same 50ms interval but over longer windows
- They test from `scrollTop=0` (no pre-scroll masking)

But they can't be in CI because they need a live TEST cluster + SSH tunnel.

### Why CLS doesn't catch it

The perf tests (P3, P3b) measure CLS via `PerformanceObserver` for
`layout-shift` entries. CLS captures **unexpected layout shifts** — elements
moving without user interaction. But swimming during prepend compensation is
a `scrollTop` change, not a layout shift. The content doesn't *shift* in the
CSS sense; the viewport *scrolls* to a different position. The browser sees
a programmatic scroll, not a layout shift. CLS is structurally blind to this.

---

## What to Build

### Part 1: Pixel-accurate swimming probe (local E2E)

Add a new test to `e2e/scrubber.spec.ts` that detects swimming at pixel
granularity using **screenshot comparison**, not state polling.

**Approach:** Take a screenshot of a small viewport region (the top ~2 rows
of the grid) immediately after seek completes, then take screenshots at
short intervals during the settle window. Compare each subsequent screenshot
to the first using Playwright's `expect(screenshot).toMatchSnapshot()` with
tight pixel tolerance. Any pixel change in the content area = swimming.

```
Sequence:
1. Navigate, wait for results
2. Scroll to scrollTop=0 (NOT pre-scroll — test the worst case)
3. Click scrubber at 50%
4. Wait for seek complete (loading=false)
5. Take reference screenshot of grid area (clip to top 2 rows)
6. Every 16ms (requestAnimationFrame via page.evaluate), take screenshot
7. After 1500ms, stop
8. Compare each screenshot to reference — max pixel diff should be 0
```

**Why this works where polling doesn't:** Screenshots capture the actual
rendered pixels, including intermediate frames. If content shifts for even
one frame, the screenshot captures it.

**Practical concern:** Playwright's `page.screenshot()` is ~50–100ms per
call, so you can't get per-frame resolution. But you can get ~15–20
screenshots in 1.5 seconds, which is enough to catch a shift that persists
for 2+ frames. The alternative — `page.evaluate` with canvas-based pixel
capture — is faster (~5ms) but more complex.

**Simpler alternative if screenshot comparison is too slow:** Instead of
pixel comparison, track `scrollTop` at sub-frame granularity using a
`requestAnimationFrame` loop inside `page.evaluate`. Record every
`scrollTop` value. After the initial seek lands, `scrollTop` should change
only monotonically (compensation adds, never subtracts) and only during
extend operations. A non-monotonic change or a change without a
corresponding `_prependGeneration` bump = swimming.

```typescript
// Inside page.evaluate — runs at rAF rate (~60fps)
const samples: number[] = [];
function tick() {
  samples.push(el.scrollTop);
  if (samples.length < 100) requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
// ... after 1.5s, return samples to Playwright
```

Then assert: between any two consecutive samples, if `scrollTop` decreased
(content shifted down = user sees upward jump), that's swimming.

### Part 2: scrollTop=0 seek variant (local E2E)

Add a test that seeks from `scrollTop=0` — the exact scenario that was
masked by the pre-scroll in the existing test. This is the headroom-zone
case: the user has just loaded the page, hasn't scrolled, and clicks the
scrubber.

```
1. Navigate, wait for results
2. DO NOT SCROLL — scrollTop should be 0
3. Click scrubber at 50% (deep seek)
4. Wait for seek complete
5. Assert: firstVisibleGlobalPos is stable over 1.5s (existing pattern)
6. Assert: scrollTop moved to the headroom position (backwardItemCount
   items into the buffer), not stayed at 0
```

This specifically tests the `_seekSubRowOffset` path — the headroom-zone
fix from Agent 13. If that code regresses, this test catches it.

### Part 3: Tighten the existing settle-window test tolerance

The current settle-window test allows `MAX_SHIFT = cols + 1` items of
content shift (L773). That's 5 items in a 4-column grid = more than 1 full
row of visible shift. This is too generous — it would pass even with
significant swimming.

Tighten to `MAX_SHIFT = 0` for `firstVisibleGlobalPos` stability. The
bidirectional seek should produce zero content shift. If the test fails
at 0, that's a real regression.

Keep a separate tolerance for the headroom-zone test (Part 2) where the
scrollTop adjustment is expected and `firstVisibleGlobalPos` may shift by
up to 1 row during the headroom correction.

### Part 4: Smoke test improvements (for TEST cluster)

The existing smoke tests (S14, S16, S22-S24) are good. Improvements:

**4a. Add a rAF-based scrollTop trace to the smoke settle-window test
(S23).** Replace the 50ms `setTimeout` polling with a `requestAnimationFrame`
loop that runs for 2 seconds after seek. Return the full scrollTop trace
(~120 samples at 60fps). Assert: no non-monotonic scrollTop changes outside
of compensation events. Write the trace to the smoke report JSON for
agent consumption.

**4b. Add a "fresh app seek" smoke test.** Navigate to `/search`, wait for
results, immediately click scrubber at 50% without scrolling. This tests
the headroom-zone path on real data where the buffer geometry is realistic.
The existing smoke tests pre-scroll or test scroll-up-after-seek, but none
test the cold-start seek.

**4c. Add per-frame CLS capture to the smoke seek test.** Even though CLS
doesn't catch scrollTop-based swimming (see above), it catches a related
failure mode: if the bidirectional seek somehow produces a layout shift
(e.g. buffer replacement causes the virtualizer to briefly render wrong-
height content), CLS would detect it. Currently the smoke tests don't
measure CLS — only the perf tests do. Adding CLS to S23 makes the smoke
suite strictly more capable.

### Part 5: Unit test for the reverse-compute logic

The reverse-compute (L2100–L2213 of `search-store.ts`) is the most brittle
part of the seek function. It reads DOM state from inside the store and
computes `scrollTargetIndex` + `_seekSubRowOffset`. This logic can be
tested without a browser by extracting the pure computation:

```typescript
// What the reverse-compute does (pure function version):
function computeScrollTarget(input: {
  currentScrollTop: number;
  isTable: boolean;
  clientWidth: number;
  backwardItemCount: number;
  bufferLength: number;
  total: number;
  actualOffset: number;
  clampedOffset: number;
}): { scrollTargetIndex: number; seekSubRowOffset: number }
```

This function doesn't exist today — the logic is inline in `seek()`. But
you can write a Vitest test that imports `search-store`, calls `seek()` on
a `MockDataSource` with controlled geometry, and asserts the resulting
`_seekTargetLocalIndex` and `_seekSubRowOffset` values.

**Test cases:**
- `scrollTop=0`, `backwardItemCount=100` → `scrollTargetIndex=100`, `seekSubRowOffset=0`
- `scrollTop=150` (half-row), `backwardItemCount=100` → `scrollTargetIndex=100`, `seekSubRowOffset=150`
- `scrollTop=3030` (10 rows into buffer), `backwardItemCount=100` → `scrollTargetIndex=140` (100+40), `seekSubRowOffset=0`
- End key: `scrollTargetIndex = bufferLength - 1`
- Shallow seek (no backward fetch): `scrollTargetIndex` = reverse of current scrollTop

These are the exact edge cases that Agent 11 missed and Agent 13 fixed.
Having them as unit tests means the reverse-compute can't regress without
a test failure.

---

## File Changes Summary

| File | Change | Type |
|---|---|---|
| `e2e/scrubber.spec.ts` | Parts 1–3: pixel probe, scrollTop=0 seek, tightened tolerance | E2E test additions |
| `e2e/smoke-scroll-stability.spec.ts` | Part 4: rAF trace, fresh-app seek, CLS | Smoke test additions |
| `src/stores/search-store.test.ts` | Part 5: reverse-compute unit tests | Unit test additions |
| Zero files in `src/` | Nothing | No production changes |

---

## Constraints

- **Do not modify any file in `src/`.** This is tests-only.
- **Do not change tuning constants.** Tests must pass with current values.
- **Run `npm test` after Part 5.** Run `npx playwright test` after Parts 1–3
  (ask user to stop dev server on port 3000 first).
- **Parts 4a–4c require TEST cluster.** Ask the user for permission before
  running smoke tests. These are read-only.
- **Part 5 may require exposing `__kupua_store__` in tests.** Check if the
  existing unit tests already have access to store internals via
  `MockDataSource`. They do — `search-store.test.ts` uses `useSearchStore`
  directly.

---

## Priority Order

If time is limited, do them in this order:

1. **Part 2** (scrollTop=0 seek) — cheapest, highest signal. 15 minutes.
2. **Part 3** (tighten tolerance to 0) — one-line change. 5 minutes.
3. **Part 5** (reverse-compute unit tests) — catches the exact class of bug
   that caused agents 11–13. 30 minutes.
4. **Part 1** (pixel probe) — the gold standard, but most implementation
   effort. 1–2 hours.
5. **Part 4** (smoke improvements) — only useful when TEST is available.
   30 minutes.

---

## Success Criteria

After this session, a regression in swimming would be caught by:

- **Local CI (automatic):** Parts 1–3 + Part 5. Any prepend compensation
  that shifts visible content by even 1 pixel or 1 scrollTop unit triggers
  a test failure. The scrollTop=0 path (headroom zone) is explicitly
  covered.

- **Smoke (manual, on TEST):** Part 4. rAF-granularity scrollTop trace
  catches sub-frame shifts. Fresh-app seek tests the real-world scenario.
  CLS captures layout-shift failures that local tests can't reproduce.

The goal from `scroll-01-stability-audit-realistic.md`: *"every smoke test
failure should produce at least one local test improvement that would have
caught the same bug class locally."* Parts 1–3 and 5 close the specific
gap that let swimming survive through 8 agent iterations.

---

## Appendix: Scroll Stability Assessment

> The full stability assessment that motivated this handoff follows below.

---

# Scroll Stability Assessment — Kupua Infinite Scroll

## Executive Summary

Over the last four commits (`0a39cd8da` → `3b910f8e2`), spanning agents 5–13, the codebase underwent a prolonged, iterative effort to eliminate "swimming" — visible content displacement after deep seeks in an infinite-scroll image browser backed by Elasticsearch. The result is **5,549 lines added across 35 files**, yielding a functionally correct scroll system with zero swimming confirmed on both local (10k docs) and real (1.3M docs) data. However, the path taken reveals systemic issues worth an honest appraisal.

---

## What Was Built (The Good)

### 1. The Core Architecture Is Sound
The windowed-buffer + cursor-pagination + custom-scrubber design is genuinely novel for this problem space. The `scroll-architecture.md` doc accurately notes this is harder than Google Photos (which holds a full position map) or immich (which fits in RAM). The architecture handles:
- 1.3M–9M documents with ~1,000-item memory budget
- Seven sort fields (date, keyword, mixed), including null-zone handling
- Cursor-based pagination at any depth (no `from/size` limit)
- Sub-row pixel preservation across seeks

### 2. Bidirectional Seek Solved The Root Problem
The final fix (Agent 11–13) is elegant: after a deep seek fetches 200 items forward, add a backward fetch of 100 items. User lands in the buffer middle with headroom above. Both `extendBackward` and `extendForward` then operate on off-screen content → zero swimming. This is the right structural fix.

### 3. Exhaustive Test Coverage
- **72 E2E scrubber tests** (2,595 lines) — seek accuracy, scroll compensation, density switch, sort preservation
- **13 smoke tests** on real 1.3M data — scroll-up, settle-window, headroom boundary
- **10 buffer corruption tests** — regression suite for the async race condition
- **186 unit/integration tests** across the full store

### 4. Excellent Documentation
The `scroll-architecture.md` (630 lines) is a genuine staff-engineer-level document. The changelog entries are forensically detailed. The archive of worklogs (`Scrolling bonanza/`) preserves every dead end and root-cause analysis. Future developers will understand *why* every decision was made.

---

## What Went Wrong (The Honest Part)

### 1. Fifteen Agents to Fix One Problem Class

The changelog tells a story of serial misdiagnosis and approach churn:

| Agent | Approach | Outcome |
|-------|----------|---------|
| 3–4 | Initial swimming observation | Diagnosed, not fixed |
| 5 | End key `soughtNearEnd` flag | Partial — fixed one path |
| 6 | `_postSeekBackwardSuppress` flag | **Blocked scrolling up entirely** |
| 7 | Reduced cooldown 700→200ms | **Regressed swimming on real data** |
| 8 | (implied) | Undone Agent 7's change |
| 9 | Wrote tests for Agent 10 | **Died before running them** |
| 10 | Removed suppress flag, added post-extend cooldown | ✅ Fixed scroll-up. 1% swim remained |
| 11 | Bidirectional seek (Idea B) | **Made swimming WORSE** — missed headroom offset |
| 12 | Test fixes | Adjusted tests for new buffer shape |
| 13 | Headroom offset + sub-row preservation | ✅ Fixed. Zero swimming |

That's **8 dead-end or regression-producing iterations** before the final fix. Agent 6's suppress flag — which solved swimming by making the app unusable in a different way — survived as committed code for at least 3 agent sessions.

**Root cause of the churn:** Each agent treated the symptom (visible shift) rather than the structural cause (user positioned at buffer edge after seek). Only Agent 10's handoff document correctly identified "Idea B: bidirectional seek" as the real fix. Agents 5–9 added timing hacks (`_seekCooldownUntil`, `_postSeekBackwardSuppress`, deferred scroll timers) that papered over the issue without addressing it.

### 2. The Timing Chain Is Fragile

The current system relies on a carefully orchestrated timing chain:

```
seek data arrives
  → SEEK_COOLDOWN_MS (700ms) blocks ALL extends
    → SEEK_DEFERRED_SCROLL_MS (800ms) fires synthetic scroll event
      → first extendBackward fires
        → POST_EXTEND_COOLDOWN_MS (200ms) blocks next extend
          → next extendBackward fires
            → repeat
```

This is **five sequential timing dependencies**, all hardcoded in milliseconds. The comments say things like:
- *"If you see buffer corruption or swimming after seek, increase this"*
- *"200ms is conservative — may be tunable down to 50-100ms"*
- *"MUST be > SEEK_COOLDOWN_MS — if it fires during cooldown, the scroll event is swallowed and extendForward never runs → freeze at buffer bottom"*

These are textbook signs of a system held together by empirically-tuned magic numbers. The bidirectional seek eliminated the *worst* symptom, but the timing chain is still load-bearing for edge cases. On a slower machine or under CPU pressure, the 700ms might not be enough; on a faster one, 700ms is wasted latency.

**What would be better:** Replace time-based guards with state-based guards. Instead of "block extends for 700ms", use "block extends until the first paint after seek data arrives" (a `requestAnimationFrame` guard). This is what the `useLayoutEffect` compensation already partially does — but the cooldown mechanism is a parallel, redundant, time-based version of the same concept.

### 3. Complexity Metrics

| File | Lines | Scroll-Specific LOC (est.) | Concern |
|------|-------|---------------------------|---------|
| `search-store.ts` | 2,613 | ~900 (seek: 500, extend: 200, reverse-compute: 200) | God object — store, DAL orchestration, scroll math, cursor management all interleaved |
| `useScrollEffects.ts` | 717 | 717 | 10 numbered effects, each with nuanced interaction. Comments reference each other by number |
| `useDataWindow.ts` | 247 | 60 | Thin — but module-level mutable state (`_visibleStart/End`) is a smell |
| `tuning.ts` | 159 | 80 | 6 timing constants with prose explaining their interdependencies |

The `seek()` function alone is **~500 lines** (L1368–L2276). It contains:
- 5 seek paths (End key, shallow from/size, percentile, null-zone, keyword)
- Binary search refinement over SHA-1 hex space
- Bidirectional backward fetch
- Reverse-compute with headroom offset and sub-row preservation
- Null-zone cursor detection and remapping

This is too much for one function. The `seek()` function is doing algorithm selection, ES query orchestration, scroll position calculation, and Zustand state management in a single 500-line async function with 6 `if (signal.aborted) return` bail-out points.

### 4. The Reverse-Compute Is Clever But Brittle

The flash-prevention mechanism (L2100–L2213) reverse-computes a buffer-local index from the user's current `scrollTop`:

```typescript
const isTable = scrollEl.getAttribute("aria-label")?.includes("table");
const rowH = isTable ? TABLE_ROW_HEIGHT : GRID_ROW_HEIGHT;
const cols = isTable ? 1 : Math.max(1, Math.floor(scrollEl.clientWidth / GRID_MIN_CELL_WIDTH));
```

This reads DOM attributes from inside the Zustand store action. The store is supposed to be view-agnostic; here it's inspecting `aria-label` strings and `clientWidth` to detect the current density mode. The architecture document notes this as a deliberate trade-off, but it creates a coupling between the store (which should know about data) and the DOM (which should be the view's concern).

The headroom offset fix (L2150–L2161) adds another layer:

```typescript
if (backwardItemCount > 0 && reverseIndex < backwardItemCount) {
  _seekSubRowOffset = subRowOffset;
  reverseIndex += backwardItemCount;
}
```

This deferred pixel offset gets stored in Zustand state (`_seekSubRowOffset`) and consumed once by effect #6 in `useScrollEffects.ts`. It's a one-shot communication channel between an async store action and a synchronous React layout effect, implemented as mutable shared state. It works, but it's the kind of thing that breaks silently when someone refactors one side without knowing the other exists.

### 5. Test Coverage Is Wide But Not Deep Enough In The Right Places

The 72 E2E scrubber tests are impressive in breadth. But the key failure mode — swimming visible to the human eye — was repeatedly missed by automated tests and only caught by manual smoke testing on real data. The changelog explicitly notes:
- *"These tests have NEVER been run. Agent 9 wrote them and died before execution."*
- *"Manual testing reveals: 5 images disappear from top row in intermediate state. Was 3 before. WORSE."*
- *"E2E test pre-scrolled to scrollTop=150 before seeking, which masked this issue."*

The smoke tests (`smoke-scroll-stability.spec.ts`, 1,441 lines) were added as a reaction to this gap. They're a good safety net, but they run against a live TEST cluster — they can't be part of CI. The local E2E tests still can't reproduce the ~1% swim that was the original complaint, because it requires a buffer size and scroll geometry that doesn't manifest with 10k docs.

---

## Assessment: Is It Over-Engineered?

**No, but it's under-structured.** The problem genuinely requires this level of complexity. Browsing millions of sorted documents with position preservation across density switches, sort changes, and random-access seeks is not a solved problem in the frontend ecosystem. The approach is inventive and the final result works.

What's over-engineered is the *defensive timing layer* — the cooldowns, generation counters, deferred scroll events, and abort controllers that exist because the core state transitions weren't clean enough to avoid races. The bidirectional seek was the right structural fix; the 5 timing constants are the residue of 12 agents' worth of patch-on-patch.

**The single most valuable refactor** would be to extract `seek()` into a standalone module with:
1. Strategy selection (which seek path to use) — pure function
2. ES orchestration (the actual fetches) — async function, no Zustand
3. Buffer assembly (combining forward + backward, cursor management) — pure function
4. Scroll position computation (reverse-compute, headroom offset) — pure function reading geometry as a parameter, not DOM
5. State commit — single `set()` call with the assembled result

This would make each piece independently testable (unit tests, not E2E) and make the interactions between them explicit rather than implicit through shared mutable state.

---

## Final Verdict

**The scroll system works.** It handles an exceptionally hard problem correctly. The documentation is exemplary. The test coverage, while it has gaps in the most critical failure mode, is strong.

**The cost was high.** Fifteen agent sessions, ~5,500 lines, and a fragile timing chain that exists because earlier agents added palliative fixes instead of solving the structural problem. The bidirectional seek should have been implemented by Agent 6, not Agent 11. The suppress flag should never have been committed.

**The technical debt is manageable but real.** The 500-line `seek()` function, the DOM inspection from inside the store, the one-shot `_seekSubRowOffset` communication channel, and the 5-constant timing chain are all maintenance hazards. They're well-documented hazards — which is the next best thing to not having them.

**Recommendation:** Don't touch it unless you have to. If you do have to, the first move is extracting `seek()` into composable pieces that can be unit-tested. The second move is replacing the time-based cooldowns with frame-based guards. Both would reduce the coupling that made this a 15-agent odyssey instead of a 3-agent fix.

