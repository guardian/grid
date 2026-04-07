# Focus Drift & P8 Table Scroll — Agent Handoff Plan

> **Created:** 2026-03-31
> **Status:** Ready for execution.
> **Prerequisite reading:** `AGENTS.md`, `coupling-fix-handoff.md` (for test/harness
> process), `perf-measurement-report.md` (full measured data), `fix-ui-docs-eval.md`
> Part 5 (summary of what the coupling work found).

---

## Context: Where We Are

The coupling-fix programme (Phases 0–C) is complete. The perf harness now persists
`focusDriftPx`, `focusDriftRatio`, and `focusVisible` correctly. The final Phase C
re-run produced three actionable findings:

| Issue | Data | Priority |
|---|---|---|
| P6: sort-around-focus places focused item ~41% viewport below expected | focusDriftPx=428, ratio=0.412 | **High — visually jarring** |
| P4b: table→grid switch places focused item 160px above expected | focusDriftPx=−160, ratio=−0.156 | **Medium — noticeable** |
| P8: table fast scroll p95=50ms, domChurn=~57k — unchanged by all coupling fixes | Consistent across all phases | **High — primary user-facing bottleneck** |

P4a (grid→table) is **perfect** — 0px drift. This asymmetry is a key diagnostic clue.

The two items for this agent:

1. **Focus drift elimination** — fix P6 (428px) and P4b (−160px); add P17 test.
2. **P8 table fast scroll** — investigate and reduce the ~57k DOM churn.

These are independent. Work on them in order, but each has its own validation loop.

---

## How the Perf Testing Loop Works

**The agent NEVER runs perf tests (`run-audit.mjs`) directly.** The human runs them.

### Commands Reference

| What | Command | Who runs it |
|------|---------|-------------|
| Unit tests | `npx vitest run` | **Agent** |
| Functional E2E | `npx playwright test` (foreground, no pipe/tail) | **Agent** |
| Perf audit (all) | `node e2e-perf/run-audit.mjs --label "..."` | **Human only** |
| Perf audit (subset) | `node e2e-perf/run-audit.mjs P4a,P4b,P6 --label "..."` | **Human only** |

### Template for every perf request

> Ready for perf measurement. Please:
>
> 1. Make sure the real-data app is running:
>    `./scripts/start.sh --use-TEST`
> 2. Run: `node e2e-perf/run-audit.mjs P4a,P4b,P6 --label "Focus drift: initial baseline" --runs 1`
> 3. When it finishes, let me know and I'll read the results from `e2e-perf/results/audit-log.json`.

**Always give exact copy-pasteable commands. Always specify `--runs 1` or `--runs 3`.
Always say whether `--use-TEST` needs to be started or is already running.**

**After reading results:** (1) present a plain-English summary, (2) flag regressions
(>10% worse), (3) flag expected improvements that didn't materialise, (4) update docs.

---

## Work Item 1: Focus Drift Elimination

### The Goal

Get `focusDriftPx` as close to 0 as possible on all three paths:
- P4a (grid→table): already 0px — must stay 0 after any changes
- P4b (table→grid): −160px → 0
- P6 (sort change): 428px → 0

### Diagnostic: What the Code Does

#### P6 (sort change, `_findAndFocusImage`)

`_findAndFocusImage()` in `search-store.ts` (line 516) runs after every sort change
when a focused image exists. It:
1. Fetches the image's new sort-order position via `countBefore` → global offset
2. Loads a page centred on that image (backward + forward)
3. Sets `focusedImageId` and increments `sortAroundFocusGeneration`

The scroll then happens in `ImageTable.tsx` (line 821):
```ts
useLayoutEffect(() => {
  if (sortAroundFocusGeneration === 0) return;
  const idx = findImageIndex(id);
  if (idx >= 0) {
    virtualizer.scrollToIndex(idx, { align: "center" });
  }
}, [sortAroundFocusGeneration, findImageIndex, virtualizer]);
```

`scrollToIndex(idx, { align: "center" })` tells TanStack Virtual to scroll so the
item is vertically centred in the scroll container. But TanStack Virtual's "center"
alignment means centred in the **scroll container**, not in the **viewport**. The
scroll container's visible height is `clientHeight`; the header sits above it and is
**not** part of the scroll container. The focused item will appear roughly centred
in the scroll container, but the header offset may not be the full story.

**The real culprit for the 428px drift:** the test measures `rowTop - scrollTop`
(pixel offset from the top of the scroll container's visible area) and compares it to
the position before the sort. `scrollToIndex` with `align: "center"` does not attempt
to preserve the pre-sort viewport position at all — it always re-centres. So unless
the image happened to be centred before the sort (it isn't — tests focus item ~5),
the drift will always be large. This is an intentional design choice, but it violates
the "Never Lost" principle which says position should be **preserved**, not reset to
centre.

**Proposed fix — P6:** Before the sort fires, capture the current `viewportRatio` of
the focused item (the same value `saveFocusRatio` uses). Store it in the search store
or pass it to `_findAndFocusImage`. After the seek completes and
`sortAroundFocusGeneration` increments, use `scrollToOffset` to restore the same
ratio rather than `scrollToIndex(..., "center")`.

**How to implement:**
1. Add `_sortAroundFocusRatio: number | null` to the store state (or use module-level
   state like `density-focus.ts` — module-level is simpler here).
2. In the `ImageTable` / `ImageGrid` `sortAroundFocusGeneration` effect, instead of
   `scrollToIndex(idx, "center")`, compute `targetScroll = idx * ROW_HEIGHT -
   ratio * el.clientHeight` (same formula as the density-switch restore) and call
   `virtualizer.scrollToOffset(clamped)`.
3. The ratio must be captured **synchronously** before the sort is triggered. The
   cleanest place is in the sort-change handler in `useUrlSearchSync.ts` or wherever
   `search(focusedImageId)` is called — read the focused item's current
   `getBoundingClientRect()` or compute `idx * ROW_HEIGHT - scrollTop` at that moment.

**Alternative simpler fix:** `scrollToIndex` accepts a `behavior` and there's no
built-in "preserve position" alignment in TanStack Virtual. But `scrollToOffset` takes
an exact pixel value. Once you know the target row's top pixel (`idx * ROW_HEIGHT`)
and the desired ratio (saved before the sort), the math is straightforward.

#### P4b (table→grid, `density-focus.ts` restore path)

P4a (grid→table) is perfect. P4b (table→grid) drifts by −160px. Both go through the
same `density-focus.ts` bridge. The asymmetry means the bug is in one direction only.

**Save path (table unmount — `ImageTable.tsx` line 881):**
```ts
saveFocusRatio((localIdx * ROW_HEIGHT - el.scrollTop) / el.clientHeight, localIdx);
```
This saves `(rowTop - scrollTop) / clientHeight`. Positive = item is below top of
viewport. Negative would mean item is above the top — which cannot happen (localIdx ≥ 0,
scrollTop ≥ 0, so `localIdx * ROW_HEIGHT - scrollTop` could be negative if the item
is scrolled partially out of view above).

Wait — if the item's top is scrolled partially above the viewport top, `rowTop -
scrollTop` is negative, so `ratio < 0`. On restore in `ImageGrid`:
```ts
const targetScroll = rowTop - saved.ratio * el.clientHeight;
```
This would give `rowTop + |ratio| * clientHeight` — a scroll position *higher* than
the item's top. If `ratio` is correctly negative (item was above viewport mid-point),
this should restore correctly.

**The −160px drift means the item appears 160px above where it was.** This suggests
the restore overshoots by 160px. Possible causes:

1. **`ROW_HEIGHT` mismatch:** `ImageTable` saves using `TABLE_ROW_HEIGHT` (52px);
   `ImageGrid` restores using `GRID_ROW_HEIGHT`. If `localIdx` is, say, 5:
   - Table save: `rowTop = 5 × 52 = 260px`
   - Grid restore: `rowTop = floor(5 / cols) × GRID_ROW_HEIGHT`

   For 1 column (cols=1): `rowTop = 5 × GRID_ROW_HEIGHT`. If `GRID_ROW_HEIGHT` ≠
   `TABLE_ROW_HEIGHT`, the positions are different. But this isn't a bug in the ratio
   restore — it's expected that row pixel positions differ between densities.

2. **The restore formula is correct but `saved.ratio` is computed incorrectly at
   save time.** Check the exact values by adding logging:
   `console.log("[density-focus] save: localIdx=", localIdx, "rowTop=", localIdx * ROW_HEIGHT, "scrollTop=", el.scrollTop, "ratio=", ratio)`

3. **The grid's `scrollToOffset` clamps to `scrollHeight - clientHeight`, but at
   mount time `scrollHeight` may not yet reflect the full virtualizer size.** The
   virtualizer's virtual height is set via the inner div's `style.height`; at mount,
   if the virtualizer hasn't rendered yet, `scrollHeight` could be smaller than
   expected, causing incorrect clamping.

**Key investigation step:** Add temporary `console.log` to both `saveFocusRatio` and
the grid's mount `useLayoutEffect` to capture: `localIdx`, `ratio`, `rowTop`,
`el.scrollTop`, `el.scrollHeight`, `el.clientHeight`, `clamped`. Run P4b manually
(switch density in the browser) and read the console. The numbers will tell you exactly
which part of the formula is off.

**Do NOT run the perf test first.** Run `npx playwright test e2e/density-switch.spec.ts`
(or the relevant functional test) to see if the drift is also visible functionally, then
add logging and iterate.

### Test Coverage Plan

**After fixing P6 and P4b, add P17:**

#### P17: density switch from deep scroll position (row 500+)

P4a/P4b currently focus item ~5 (near the top). The real-world "Never Lost" failure
mode occurs when the user is deep in the list (row 500, 1000, etc.) and switches
density. Add P17 to test this:

```ts
test("P17: density switch from deep position — Never Lost at row 500+", async ({ kupua }) => {
  await gotoPerfSearch(kupua);
  await requireRealData(kupua);

  // Seek to a deep position (item ~500)
  // Use the scrubber or keyboard to get there
  // Focus an image at ~row 500
  // Measure position before switch
  // Switch table → grid
  // Measure position after switch
  // emitMetric("P17", snap, { focusDriftPx: drift, focusDriftRatio: ratioDrift, focusVisible: posAfter?.visible ?? false });
});
```

Add P17 to `perf.spec.ts` following the same pattern as P4a/P4b (lines 621–690).

### Validation Sequence for Focus Drift Work

1. `npx vitest run` — must pass
2. `npx playwright test` — all 64 functional tests must pass
3. Ask human: `node e2e-perf/run-audit.mjs P4a,P4b,P6 --label "Focus drift fix: [description]" --runs 1`
4. Read drift values. Target: |focusDriftPx| ≤ 30px on all three paths
5. If P17 is added: `node e2e-perf/run-audit.mjs P4a,P4b,P6,P17 --label "..."`
6. Confirm P4a stays at 0px throughout

**Minimum viable fix:** P6 drift is the priority (428px, most visible). P4b is
secondary. Both should be attempted in the same session if possible.

---

## Work Item 2: P8 Table Fast Scroll — DOM Churn Investigation

### The Goal

Understand and reduce the ~57,000 DOM mutations that occur during a 40-event fast table
scroll session. Currently p95=50ms regardless of all coupling optimisations. Even a
10–15% reduction in domChurn would meaningfully improve p95.

### What the Data Shows

P8 measures: 40 × `mouse.wheel(0, 1500)` events over 40×60ms = 2.4s, plus 3s settle
time. Result:

| Metric | Value (C-full) |
|---|---|
| p95 frame time | 50ms (stuck — unchanged across all phases) |
| domChurn | ~57–58k mutations |
| LoAF | 748ms total |
| severe frames | 15 |

~57k mutations over a ~5s window is ~11,400 mutations/second. The virtualizer renders
roughly 15–20 visible rows at any one time. Each row has ~8–10 DOM elements (cells,
images, badges). A full re-render of the visible window is `20 rows × 9 els = 180
mutations`. At 60fps: `60 × 180 = 10,800 mutations/s`. This matches the measured data
— meaning **nearly every frame is a near-total re-render of the virtualizer's visible
window**. The scroll is so fast that TanStack Virtual continuously replaces the entire
rendered set.

**This is not a bug.** It is TanStack Virtual working as designed: on each scroll
event, it computes new `startIndex`/`stopIndex`, unmounts rows that left the window,
and mounts new ones. At `wheel(0, 1500)` × 60ms, you're advancing roughly 28 rows
per event (1500px / 52px per row ≈ 29). The virtualizer window is ~20 rows. You're
replacing the entire window on each wheel event.

### Investigation Approaches

#### Approach A: Measure the actual per-frame DOM contribution breakdown

Add Chrome DevTools trace capture or use the PerformanceObserver in the test to
identify which element types contribute most mutations. Is it:
- Row `<tr>` elements themselves?
- Cell `<td>` inner content (image `<img>` `src` changes)?
- Attribute updates (ARIA, `data-*`, `style`)?
- The virtualizer's `style.transform` on its inner container?

**How to investigate:** In the browser, open DevTools Performance tab, record while
doing the same 40-wheel scroll in the table view, then examine "Summary" → "Rendering"
and the flamechart. Look for which React component accounts for the most "commit"
work. This can't be automated in a Playwright test but the agent can ask the human to
do a 30-second profiling session.

#### Approach B: Check if `React.memo` is effective on `TableRow` / `GridCell`

If `TableRow` is not properly memoised, or if it receives new object/function props on
every scroll-triggered re-render, every visible row re-renders from scratch even if
its data hasn't changed. Check:

```
grep -n "memo\|TableRow\|GridCell" kupua/src/components/ImageTable.tsx | head -40
```

Look for: does `TableRow` use `React.memo`? Are its props stable (memoised image
objects, stable callbacks)? Is `selectedImageIds` (if it exists) passed as a new Set
on every render?

#### Approach C: Check if `image` objects from the store are referentially stable

If `useSearchStore(s => s.results)` returns a new array (or new image objects) on
every store update, `React.memo` on `TableRow` is useless — the `image` prop is always
`!==` even if the data hasn't changed. Check:

In `search-store.ts`, when `loadMore` extends the buffer (append/prepend), does it
spread the existing results array (`[...existing, ...new]`)? If so, all existing image
objects *should* be referentially stable (same object references), but the array
itself is new. `React.memo` checks `image !== prevImage` — if the objects are the same
references, this is fine.

**The risky path:** any `map()` or `filter()` on the results array in the selector
creates new object references even if data is identical. Check `useDataWindow` for any
transformation applied to `results` before passing rows to `TableRow`.

#### Approach D: Virtualizer overscan setting

TanStack Virtual's `overscan` option controls how many rows beyond the visible window
are kept mounted. Default is typically 3–5. A lower overscan reduces the render window
size, meaning fewer mutations per scroll event but also more "blank flash" at fast
scroll speeds. Check the current overscan setting in `ImageTable.tsx`:

```
grep -n "overscan" kupua/src/components/ImageTable.tsx
```

If it's set high (e.g. 10), reducing it to 3 would meaningfully reduce the mutation
count per frame at the cost of more blank rows at extreme scroll speeds.

#### Approach E: `scrollingDelay` / debounce the virtualizer render

TanStack Virtual supports a `scrollingDelay` option: during scroll, it renders a
lightweight "scrolling" version of items (e.g. skeleton rows), then fires a full
render only after scrolling stops. This would collapse the ~57k mutations during scroll
to near-zero, with a burst at scroll-end. The p95 during scroll would plummet but
p95 after scroll-end would spike. Whether this is an acceptable UX trade-off depends
on how fast the "scrolling" placeholder renders vs. the full row.

**This is a significant UX change.** Do not implement without discussing with the user.
Propose it as an option once the investigation (Approaches A–D) determines whether
there's a "free win" that doesn't require skeleton rows.

### The Likely Honest Outcome

P8's domChurn (~57k) is largely structural — TanStack Virtual replacing the entire
visible window on fast scrolls. Short of `scrollingDelay` (skeleton rows) or
switching to a canvas renderer (accessibility concerns — see eval doc Part 3.3A), the
churn can be reduced at the margins (Approach C: stable references, Approach B:
effective memoisation, Approach D: overscan tuning) but not eliminated. A realistic
target is 40–45k (15–25% reduction), not zero.

**Be honest with the user if the investigation shows the churn is irreducible without
a structural change.** The current 50ms p95 is acceptable for fast scroll on modern
hardware. It is not acceptable on 6× CPU throttle, but kupua's user base (Guardian
editorial staff) is unlikely to be on throttled hardware.

### Validation Sequence for P8 Work

1. Each investigative change: `npx vitest run` + `npx playwright test` first
2. Ask human: `node e2e-perf/run-audit.mjs P8 --label "P8 investigation: [what changed]" --runs 1`
3. Read domChurn and p95. Establish a new baseline after any change that moves the
   needle by >5%.
4. If a `--runs 3` confirmation is needed (for changes close to noise threshold):
   ask human explicitly.

---

## Minimal Perf Test to Request First

Before making any code changes, ask the human to run a clean baseline of just the
affected tests to verify the Phase C numbers are reproducible in the current state:

> **First thing:** please run a quick baseline so we know we're starting from a
> clean state:
>
> ```
> node e2e-perf/run-audit.mjs P4a,P4b,P6,P8 --label "Pre-fix baseline" --runs 1
> ```
>
> This will take about 3–4 minutes. Once done, I'll read the results and then
> start on the focus drift fixes.

---

## Source File Map

| File | Relevant section | Line range (approx.) |
|------|-----------------|----------------------|
| `src/stores/search-store.ts` | `_findAndFocusImage` | 516–665 |
| `src/stores/search-store.ts` | `sortAroundFocusGeneration` state + `search()` call site | 698, 734–870 |
| `src/components/ImageTable.tsx` | `sortAroundFocusGeneration` effect | 818–829 |
| `src/components/ImageTable.tsx` | Density-switch mount/unmount effects | 843–884 |
| `src/components/ImageGrid.tsx` | `sortAroundFocusGeneration` effect | 514–526 |
| `src/components/ImageGrid.tsx` | Density-switch mount/unmount effects | 541–586 |
| `src/lib/density-focus.ts` | Module-level bridge | entire file |
| `src/hooks/useUrlSearchSync.ts` | Where `search(focusedImageId)` is called on sort change | search for `sortAroundFocusId` |
| `e2e-perf/perf.spec.ts` | `getFocusedViewportPos()` helper | 91–145 |
| `e2e-perf/perf.spec.ts` | P4a, P4b tests | 621–690 |
| `e2e-perf/perf.spec.ts` | P6 test | 729–762 |
| `e2e-perf/perf.spec.ts` | P8 test | 802–836 |
| `e2e-perf/perf.spec.ts` | P12 test (for context on scroll drift) | 992–1110 |

---

## Key Architecture Decisions Not to Change Without Discussion

1. **`density-focus.ts` module-level variable** — works for serial unmount/mount.
   Moving it to a parent `useRef` (eval doc item 5) is the correct long-term fix but
   is not required for this work. Do not change it unless the investigation shows it's
   causing P4b drift (it almost certainly isn't — the serial ordering is preserved).

2. **`scrollToIndex(idx, { align: "center" })` in `sortAroundFocusGeneration` effect**
   — changing this is the core P6 fix. The change is `scrollToOffset(calculated)`
   instead. This is a deliberate departure from the "always centre after sort" behaviour
   — it's the right UX choice (position preservation > re-centering) but should be
   called out in `deviations.md`.

3. **P8's root cause is structural** — do not attempt to replace TanStack Virtual or
   switch to a canvas renderer without explicit user discussion. The eval doc (Part 3.3)
   already covers why those alternatives were rejected.

---

## Docs to Update After This Work

1. **`AGENTS.md`** — What's Done section
2. **`exploration/docs/changelog.md`** — append under current phase heading
3. **`exploration/docs/perf-measurement-report.md`** — add a new section (§7) with
   before/after focus drift values and P8 churn findings
4. **`exploration/docs/deviations.md`** — add entry for P6 position-preservation fix
   (departure from "always centre after sort")
5. **This file** — mark items complete as they are done

