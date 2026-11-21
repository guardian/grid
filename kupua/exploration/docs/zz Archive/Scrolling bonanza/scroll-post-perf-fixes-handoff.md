# Post-Perf Fixes — Agent Handoff

> **Created:** 2026-03-31
> **Status:** Ready for execution.
> **Prerequisite reading:** `AGENTS.md`, `perf-measurement-report.md`.
> **Git context:** Almost all changes live in commit `3dac9ff5e` ("kupua: coupling
> fixes Phases A–C + perf measurement infrastructure"). The previous commit is
> `34b3e17d3` ("Use layout constants, introduce performance test harness"). Diff
> those two commits to see every change that could cause the regressions below.

---

## Quick Start for Executing Agent

**Read these files first** (in this order — this is the minimum context to start work):

1. `kupua/AGENTS.md` — project overview, architecture, what's done
2. This document (you're reading it)
3. `kupua/src/lib/scroll-reset.ts` (~45 lines) — the imperative scroll reset
4. `kupua/src/lib/scroll-container-ref.ts` (~28 lines) — module-level ref pattern
5. `kupua/src/lib/density-focus.ts` (~40 lines) — ratio bridge pattern (model for new code)
6. `kupua/src/constants/layout.ts` (~28 lines) — TABLE_ROW_HEIGHT=32, GRID_ROW_HEIGHT=303
7. `kupua/src/components/ImageGrid.tsx` (~680 lines) — focus on: GridCell key (~line 655), scroll-reset effect (~line 460), sortAroundFocusGeneration effect (~line 517), handleScroll (~line 352)
8. `kupua/src/components/ImageTable.tsx` (~1534 lines) — focus on: scroll-reset effect (~line 758), sortAroundFocusGeneration effect (~line 821), handleScroll (~line 632), visibleImages sentinel (~line 542)
9. `kupua/src/stores/search-store.ts` (~1622 lines) — focus on: `search()` (~line 734), `_findAndFocusImage()` (~line 516), `seek()` (~line 1044)
10. `kupua/src/hooks/useUrlSearchSync.ts` (~174 lines) — sort-only detection, `resetSearchSync()`
11. `kupua/src/components/SearchBar.tsx` (~206 lines) — Home logo handler (~line 125)

**Do NOT read all of search-store.ts or ImageTable.tsx upfront.** Use the line
numbers above to read targeted sections. You will need more context as you go —
gather it incrementally.

**Execution order:** Issue 1 → Issue 3 → Issue 2. Each issue section below has its
own investigation steps. Follow them sequentially — don't skip ahead.

**Test commands:**
- `cd kupua && npx playwright test` — run full E2E suite (foreground, ~70s)
- `cd kupua && npx vitest run` — run unit tests
- Perf tests (`run-audit.mjs`) — **human only**, never run these yourself

---

## Issue 1 — CRITICAL: Home Button Doesn't Scroll to Top After Deep Seek

### Symptom

Multiple scenarios all exhibit the same bug — landing near but not at the top of
results when the app should scroll to position 0:

1. **Fresh app → scrubber click at ~50% (deep seek) → click Home logo.** Expected:
   first image. Actual: ~200 items from the top.
2. **Deep seek → open image detail → click a metadata value (click-to-search).**
   Expected: first result of the new query. Actual: near but not at the top.
3. **Any scenario where a new search fires while the virtualizer's internal scroll
   state is deep** — the DOM `scrollTop` is reset to 0, but the virtualizer still
   thinks it's deep.

### Root Cause Analysis

All these scenarios share the same fundamental problem: **`scrollTop = 0` on the DOM
is not sufficient — `virtualizer.scrollToOffset(0)` must also be called, and it isn't
always.**

TanStack Virtual maintains its own internal `scrollOffset` state, separate from the
DOM's `scrollTop`. It syncs via scroll events: when a `"scroll"` event fires, the
observer reads `element.scrollTop` and writes it to `this.scrollOffset`. But this
sync is event-driven and can lag during rapid state transitions.

**Path 1 (Home button):** After a deep seek, the URL is already `/search?nonFree=true`.
The Home `<Link>` navigates to the same URL. So `searchParams` doesn't change. The
scroll-reset `useLayoutEffect` (which calls `virtualizer.scrollToOffset(0)`) **doesn't
fire**. Only the imperative `resetScrollAndFocusSearch()` runs, which does
`scrollContainer.scrollTop = 0` + synthetic scroll event. This used to work
pre-commit because the virtualizer had more opportunities to sync its internal state
(A.1 `handleScroll` churn gave it extra sync points). After A.1 stabilised
`handleScroll`, fewer sync opportunities exist, and the virtualizer can lag behind.

**Path 2 (metadata click-to-search from image detail):** The URL DOES change (new
`query` param), so the scroll-reset `useLayoutEffect` DOES fire and calls
`virtualizer.scrollToOffset(0)`. But `scrollToOffset(0)` internally calls
`scrollElement.scrollTo({ top: 0 })` and then schedules a `requestAnimationFrame`
reconciliation. If the `search()` async response arrives and triggers a re-render
between the `scrollTo` and the rAF reconciliation, the virtualizer may re-compute
its visible range using a stale `scrollOffset` (the scroll observer callback hasn't
fired yet for the `scrollTo` call). The result: correct data at the wrong position.

**What changed in the commit:** Two changes compound:
- **A.1 (`handleScroll` stabilisation):** Before A.1, `handleScroll` changed every
  render → the `useEffect` that calls `handleScroll()` fired every render, giving
  the virtualizer's scroll observer more chances to sync `scrollOffset` with DOM
  `scrollTop`. After A.1, `handleScroll` is stable → the effect only fires on
  `bufferOffset`/`results.length` changes → fewer sync opportunities.
- **`scroll-reset.ts` changed from `document.querySelector` to
  `getScrollContainer()`:** Both return the same element, but the change may mask a
  null-ref issue if `registerScrollContainer` hasn't fired yet (unlikely but untested).

### Proposed Fix

**The fix must ensure `virtualizer.scrollToOffset(0)` is called in every
scroll-to-top scenario, not just when `searchParams` changes.**

**Option A (recommended): Registration pattern.** Create
`src/lib/scroll-reset-ref.ts` (same pattern as `scroll-container-ref.ts`):

```ts
let _onReset: (() => void) | null = null;
export function registerScrollReset(cb: (() => void) | null): void {
  _onReset = cb;
}
export function fireScrollReset(): void { _onReset?.(); }
```

Both ImageTable and ImageGrid register on mount:
```ts
useEffect(() => {
  registerScrollReset(() => virtualizer.scrollToOffset(0));
  return () => registerScrollReset(null);
}, [virtualizer]);
```

Then `resetScrollAndFocusSearch()` calls `fireScrollReset()` in addition to the
existing DOM `scrollTop = 0`. This guarantees the virtualizer's internal state is
reset regardless of whether `searchParams` changed.

**Option B (store-based):** Add `_scrollResetGeneration: number` to the search store.
`resetScrollAndFocusSearch()` increments it. Both density components watch it via
`useLayoutEffect` and call `virtualizer.scrollToOffset(0)`. Slightly heavier
(Zustand subscription + React re-render) but avoids the module-level ref.

**Option C (also necessary regardless of A/B):** The scroll-reset `useLayoutEffect`
in both density components should also be triggered when `search()` completes with
`bufferOffset: 0` and the current scroll position is non-zero. Currently it only
watches `searchParams` — which doesn't cover the Home-button case (same URL).
Consider adding `bufferOffset` to the dependency array, with a guard that only
resets when `bufferOffset` transitions to 0 from a non-zero value.

**Recommendation: Option A + Option C.** Option A handles the imperative
`resetScrollAndFocusSearch()` path. Option C handles any search that returns to
position 0 (belt-and-suspenders).

### Investigation Steps

1. **Add console.log to `resetScrollAndFocusSearch()`**: log `getScrollContainer()`
   result, `scrollTop` before/after, and whether the element matches
   `document.querySelector(...)`.
2. **Add console.log to the scroll-reset `useLayoutEffect`** in ImageGrid: log
   whether it fires on Home click and on metadata click-to-search.
3. **Reproduce all three scenarios** and read console output.
4. **Implement Option A.** Test all three scenarios.
5. **If still broken:** add Option C.

### Validation

- Run `npx playwright test` — existing tests cover seek + navigation.
- Add specific tests:
  - Seek to 50% → click Home → assert `bufferOffset === 0` AND `scrollTop === 0`
    AND the first visible image is the first result.
  - Seek to 50% → open image detail → click metadata value → assert new query in
    URL AND `scrollTop === 0` AND `bufferOffset === 0`.

---

## Issue 2 — Focus Drift: Sort-Around-Focus and Density Switch

### Context

The perf measurement programme identified two focus-drift bugs:

| Issue | Data | Priority |
|---|---|---|
| P6: sort-around-focus places focused item ~41% viewport below expected | focusDriftPx=428, ratio=0.412 | **High** |
| P4b: table→grid switch places focused item 160px above expected | focusDriftPx=−160, ratio=−0.156 | **Medium** |

P4a (grid→table) is perfect at 0px drift.

### The "Never Lost" Principle

The focused item should stay at the **same relative viewport position** across all
transitions. An item near the top stays near the top. Near the bottom stays near the
bottom. Centre stays at centre. Exception: if the restored position would place the
item outside the viewport, clamp to the nearest visible edge.

This is **ratio preservation** — the density-switch bridge (`density-focus.ts`)
already does this for density changes. The bugs:
1. Sort-around-focus uses `align: "center"` instead of ratio preservation.
2. Density-switch table→grid ratio preservation has a ~160px error.

### P6: Sort-Around-Focus Fix

**Root cause:** Both code paths in `_findAndFocusImage` (Branch A: image in first
page; Branch B: image needs seeking) end with `scrollToIndex(idx, { align: "center" })`
in the `sortAroundFocusGeneration` effect. This ignores the pre-sort viewport ratio.

**Fix — create `src/lib/sort-focus.ts`** (same pattern as `density-focus.ts`):
```ts
let _saved: { ratio: number } | null = null;
export function saveSortFocusRatio(ratio: number): void { _saved = { ratio }; }
export function consumeSortFocusRatio(): { ratio: number } | null {
  const s = _saved; _saved = null; return s;
}
```

**Capture** in the scroll-reset `useLayoutEffect` (both ImageTable ~line 790 and
ImageGrid ~line 487), at the `sortOnly && focusedImageId` skip point — this fires
synchronously when `orderBy` changes, before the async search completes:
```ts
if (sortOnly && focusedImageId) {
  // Capture pre-sort ratio (same geometry as density-focus save)
  const store = useSearchStore.getState();
  const gIdx = store.imagePositions.get(focusedImageId);
  if (gIdx != null) {
    const localIdx = gIdx - store.bufferOffset;
    if (localIdx >= 0) {
      const rowTop = localIdx * ROW_HEIGHT; // grid: Math.floor(localIdx / cols) * ROW_HEIGHT
      saveSortFocusRatio((rowTop - el.scrollTop) / el.clientHeight);
    }
  }
  return;
}
```

**Restore** in the `sortAroundFocusGeneration` effect — replace `scrollToIndex(idx,
{ align: "center" })` with:
```ts
const saved = consumeSortFocusRatio();
if (el && saved) {
  const rowTop = idx * ROW_HEIGHT; // grid: Math.floor(idx / cols) * ROW_HEIGHT
  let clamped = Math.max(0, Math.min(
    el.scrollHeight - el.clientHeight,
    rowTop - saved.ratio * el.clientHeight
  ));
  // Edge clamping: keep item on screen
  const itemY = rowTop - clamped;
  if (itemY < 0) clamped = rowTop;
  else if (itemY > el.clientHeight - ROW_HEIGHT)
    clamped = rowTop - el.clientHeight + ROW_HEIGHT;
  clamped = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, clamped));
  virtualizer.scrollToOffset(clamped);
} else {
  virtualizer.scrollToIndex(idx, { align: "start" });
}
```

### P4b: Density Switch Table→Grid Fix

**Diagnosis: log first, then fix.** Add `console.log` to the table unmount
(`saveFocusRatio`) and grid mount (`consumeFocusRatio` + restore) paths. The most
likely causes: `el.scrollHeight` too small at grid mount time, or `el.clientHeight`
difference (table has 45px internal header). See §P4b in the previous handoff version
for detailed logging templates.

### P17: Deep-Position Density Switch Test

Add after P4b is fixed. Test from `seekTo(0.5)` — P4a/P4b only test from item ~5.

### Step 0: Write Local E2E Tests First

Before any production code changes, add functional E2E tests that assert viewport
drift after sort-around-focus and density-switch. The existing tests only assert
image ID preservation, not viewport position. Use the `getFocusedViewportPos()`
technique from `e2e-perf/perf.spec.ts`.

---

## Issue 3 — Visual Reordering During Seeks and Sort Changes

### Symptom

When seeking (scrubber click, sort toggle), images visibly shuffle/reorder before
settling into their final positions. This happens more frequently after the perf
commit.

### Root Cause Analysis

**Primary suspect: A.4 — GridCell key change from `key={imageIdx}` to
`key={image?.id ?? "empty-${imageIdx}"}`.**

Before A.4, GridCell keys were positional: `key={0}`, `key={1}`, etc. When the
buffer was replaced wholesale (seek, search), React would unmount cells at positions
[0..N] and mount new cells at positions [0..N]. Each cell renders at its correct
virtual position from the start.

After A.4, keys are content-based: `key={image.id}`. When the buffer is replaced,
if ANY image from the new buffer was also in the old buffer (which is common — seek
to a nearby position, or sort reversal where some images stay in the first page),
React's reconciler **reuses the component instance**. It finds the old DOM node
(which is positioned at the OLD virtual row) and moves it to the NEW virtual row.
This move is visible as a "reorder" for one frame before the virtualizer stabilises.

**This is the classic content-key-in-virtualizer antipattern.** TanStack Virtual
uses positional rendering — row N is rendered at `top: N * estimateSize`. When
React reconciles by content key instead of position key, it fights the virtualizer's
positioning, causing transient misplacement.

**Why A.4 was introduced:** It reduced domChurn on backward extends by 14–18% (the
GridCell key fix let React reuse cells when `bufferOffset` shifted). This is a real
win for the **extend** case (incremental buffer growth). But it's a regression for
the **wholesale replacement** case (seek, search, sort-around-focus).

**Secondary suspect: A.5 — visibleImages sentinel change** (ImageTable only). The
O(1) sentinel `firstId|lastId|count` could theoretically return stale `visibleImages`
if a wholesale buffer replacement puts different images at the same first/last/count
positions. This is extremely unlikely with image IDs (SHA-1 hashes) but worth checking.

**Tertiary suspect: Scroll-mode fill** (`_fillBufferForScrollMode`). For result sets
≤ 1000, after the initial page loads, background chunks of 200 are appended. Each
chunk triggers a Zustand `set()` → React re-render → virtualizer item count grows.
This can cause visible row shifting as the content area height changes incrementally.

### Proposed Fix

**For A.4 (GridCell key):** The fix is nuanced. We want positional keys for wholesale
replacements but content keys for incremental extends. Options:

**Option A (recommended): Revert to positional keys, accept domChurn on extends.**
The domChurn reduction from A.4 was 14–18% on P3/P11 tests. These tests measure
seek + reflow, which is a brief operation. The visual reordering affects every seek
and search — a much more impactful user-facing regression. Revert `key={image?.id}`
→ `key={imageIdx}` and accept the domChurn cost.

**Option B: Composite key that includes position.** Use
`key={\`${imageIdx}-${image?.id ?? ""}\`}` — this is always positional (imageIdx
changes between old and new renders) so React won't reuse across buffer replacements,
but within a single render it's stable. However, this gives the same domChurn as pure
positional keys, defeating the purpose of A.4.

**Option C: Conditional keying.** Use `image?.id` during scroll (incremental
extends) and `imageIdx` during seeks/searches (wholesale replacements). Add a store
flag `_wholesaleReplace` set to true during seek/search and false after the first
scroll event. The GridCell key reads this flag: `_wholesaleReplace ? imageIdx :
(image?.id ?? imageIdx)`. Complex but gives the best of both worlds.

**Recommendation: Option A.** The visual reordering is a worse regression than the
14–18% domChurn increase was a win. The domChurn doesn't cause visible jank — it was
measured in an automated harness. The reordering is directly visible to users.

**For A.5 (sentinel):** If reverting A.4 doesn't fix all reordering, also check
whether the sentinel causes stale `visibleImages` during buffer replacement. Add a
`console.log` when the sentinel matches but `results` has changed. If this fires,
revert to `ids.join(",")` or add a generation counter to the sentinel.

### Measurement Gap: No Probe for Visual Reordering

The perf harness currently has CLS (layout-shift), DOM churn (MutationObserver),
frame timing (rAF), and LoAF. **None of these can detect the reordering bug:**

- **CLS** only fires when an *already-rendered* element moves within a single frame
  due to layout recalculation. React unmounting a cell at row 5 and mounting one at
  row 12 is a DOM mutation, not a layout shift.
- **DOM churn bursts** show that mutations happen in waves (~3 bursts 500ms apart
  would correlate with 3 visible reorders), but can't distinguish normal virtualizer
  recycling from pathological reordering.
- **Frame timing / LoAF** measure jank, not content correctness.

**If the A.4 revert doesn't fully resolve the issue**, a **content-fingerprint probe**
would be needed: snapshot the visible image IDs at each rAF, count how many times
the ordered set changes after a seek/search trigger. >1 change = reordering bug.
This is ~30 lines in `injectPerfProbes()`. But don't build it now — the root cause
is known, the fix is a one-line revert. Only build the probe if the revert doesn't
work and the cause needs further investigation.

### Investigation Steps

1. **Revert A.4 locally** (`key={image?.id}` → `key={imageIdx}`). Test visually:
   seek, sort toggle, Home click. If reordering disappears, A.4 is confirmed.
2. **Run the local E2E test suite** to ensure the revert doesn't break anything.
3. **If reordering persists after A.4 revert:** add logging to `_fillBufferForScrollMode`
   and the `visibleImages` memo to identify the secondary cause.

---

## How the Perf Testing Loop Works

**The agent NEVER runs perf tests (`run-audit.mjs`) directly.** The human runs them.

| What | Command | Who runs it |
|------|---------|-------------|
| Unit tests | `npx vitest run` | **Agent** |
| Functional E2E | `npx playwright test` (foreground, no pipe/tail) | **Agent** |
| Perf audit | `node e2e-perf/run-audit.mjs ...` | **Human only** |

After any code change, tell the human what to run and wait for results.

---

## Recommended Execution Order

1. **Issue 1 (CRITICAL):** Add logging → reproduce → identify root cause → fix.
   This should be a 30-minute fix once the cause is confirmed.
2. **Issue 3 (reordering):** Revert A.4 GridCell key → test visually → run E2E
   suite. If reordering gone, done. If not, investigate A.5 and scroll-mode fill.
3. **Issue 2 (focus drift):** Step 0 (E2E tests) → P4b logging → P4b fix → P6
   ratio capture/restore → P6 reorder investigation → P17 test.
4. **Perf measurement:** After all fixes, ask human to run:
   ```
   node e2e-perf/run-audit.mjs P3,P3b,P4a,P4b,P6,P8,P11 --label "Post-regression fixes" --runs 1
   ```
   Compare domChurn on P3/P11 (expect regression from A.4 revert) against the
   visual improvement. Document the trade-off.

---

## Source File Map

| File | What to look at |
|------|-----------------|
| `src/lib/scroll-reset.ts` | `resetScrollAndFocusSearch()` — the imperative Home reset. Changed from `querySelector` to `getScrollContainer()`. |
| `src/lib/scroll-container-ref.ts` | Module-level `_el` ref — registered by density components on mount. |
| `src/components/ImageGrid.tsx` | A.4 GridCell key (search for `key={image?.id`), A.1 handleScroll stabilisation, A.2 columnIndices memo, scroll-reset effect (~line 460), registerScrollContainer (~line 179). |
| `src/components/ImageTable.tsx` | A.5 visibleImages sentinel (search for `sentinel`), A.1 handleScroll, A.3 canvas font cache, scroll-reset effect (~line 758), registerScrollContainer (~line 428). |
| `src/stores/search-store.ts` | `search()` (~line 734), `seek()` (~line 1044), `_findAndFocusImage()` (~line 516), `_fillBufferForScrollMode()` (~line 413). |
| `src/components/SearchBar.tsx` | Home logo onClick handler (~line 125). |
| `src/lib/density-focus.ts` | Module-level bridge pattern — model for `sort-focus.ts`. |
| `src/hooks/useUrlSearchSync.ts` | `resetSearchSync()` and where `search(sortAroundFocusId)` is called. |
| `e2e-perf/perf.spec.ts` | `getFocusedViewportPos()` helper, P4/P6 tests. |
| `e2e/scrubber.spec.ts` | Existing tests — add drift assertions and Home-after-seek test. |

---

## Key Constraints

1. Do not run perf tests (`run-audit.mjs`) — human only.
2. Do not reduce overscan below 5.
3. Do not replace TanStack Virtual.
4. Do not change `density-focus.ts` module-level pattern.
5. Add `deviations.md` entry for P6 ratio preservation.
6. Update `AGENTS.md`, `changelog.md`, `perf-measurement-report.md` after all fixes.





