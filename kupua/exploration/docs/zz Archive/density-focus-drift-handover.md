# Density-Focus Drift — Handover Document

> **Date:** 1 April 2026
> **Status:** Partially fixed. Ratio stability achieved (globalIndex fix), but
> viewport drift persists due to post-restore prepend compensation clamping.
> **Files changed:** `useScrollEffects.ts` (uncommitted), `scrubber.spec.ts` (from
> prior Bug #17 commit), `ImageGrid.tsx` (from prior commit).

---

## 1. What the User Sees

After a deep scrubber seek, toggling density (grid ↔ table) repeatedly causes the
focused image to gradually drift out of the viewport. By the 3rd or 4th toggle it's
no longer visible. Without deep seek (near the top of the buffer), density switching
is stable.

This is an extension of Bug #17. The original Bug #17 fix (committed in `0ed86a730`)
made density switching work for a single toggle at deep scroll. This session attempted
to fix the **accumulated drift across multiple toggles**.

---

## 2. Root Cause Analysis

The density-focus save/restore cycle works as follows:

1. **SAVE** (unmount): capture `ratio = (rowTop + headerOffset - scrollTop) / clientHeight`
   plus the image's index.
2. **RESTORE** (mount, rAF2): recompute `scrollTop = rowTop + headerOffset - ratio * clientHeight`,
   set it on the DOM element.

The ratio itself is now stable across cycles (~0.291, tiny float drift only). The
globalIndex fix (saving `globalIndex` instead of `localIndex`) solved the ratio
explosion that was the initial symptom.

**The remaining drift comes from post-restore prepend compensation.** Here's the
exact sequence on each density toggle:

```
1. Old component unmounts → SAVE (ratio ≈ 0.291, correct)
2. New component mounts → rAF1 → rAF2 → RESTORE sets scrollTop correctly
3. RESTORE dispatches synthetic scroll event (line 592)
4. Scroll event → handleScroll → reportVisibleRange → extendBackward fires
5. extendBackward completes async → 200 items prepended to buffer
6. Prepend compensation (effect #4) fires → shifts scrollTop
7. If the new scrollTop exceeds maxScroll (scrollHeight - clientHeight),
   the browser clamps it. This loses pixels. Each cycle that clamps
   accumulates error.
```

**The clamping is the smoking gun.** From the logs on the 4th cycle:

```
[prepend-comp] prepended=200 cols=1 ... scrollBefore=25409.6 scrollAfter=30972.8 delta=5563.2
```

Expected delta is 6400 (200 × 32), but actual delta is 5563.2 because
`25409.6 + 6400 = 31809.6 > maxScroll(30973)`. The browser clamps to 30973.
That's an 837px loss. On the next unmount SAVE, the ratio captures the clamped
position, not the intended position.

The clamping happens because the buffer isn't large enough for the table's total
scroll height to accommodate the compensated position. After the RESTORE places
the viewport at scrollTop=25409, a 200-item prepend should shift everything down
by 6400px, but the total scroll height only grew to 32000px (1000 items × 32px),
giving maxScroll=30973. The target (31810) exceeds this.

### Why it only happens after deep seek

Near the top of the buffer, prepend compensation adds scroll that's well within
the scroll range. At deep scroll, the buffer window is positioned such that the
focused image is far into the buffer (localIndex=800+), and prepend compensation
pushes scrollTop near or past the bottom of the scroll range.

### Why the first 1-2 toggles work

The buffer starts small (200-400 items). Prepend compensation is small relative
to the scroll range. By the 3rd toggle, the buffer has grown (800-1000 items)
and the focused image is at localIndex 800+, making its rowTop large relative to
the total scroll height.

---

## 3. What Was Tried (and Why Each Failed)

### Attempt 1: Fresh localIndex lookup in rAF2
**Idea:** Re-lookup the focused image's localIndex from the store at rAF2 time
(when bufferOffset may have changed due to extends between mount and rAF2).
**Result:** `freshIdx` always equaled `savedIdx` — the buffer hadn't shifted yet
at rAF2 time. The extends happen AFTER rAF2 (triggered by the scroll event
dispatched at the end of rAF2). No effect on drift.

**User-observed logs (attempt 1 — localIdx drift visible):**
```
SAVE  localIdx=417 cols=6 scrollTop=20604.8 ratio=0.290856
RESTORE idx=417 cols=1 target=13090.3 clamped=13090.3 (no clamp)
SAVE  localIdx=617 cols=1 scrollTop=19490.4 ratio=0.290749   ← localIdx shifted +200
RESTORE idx=617 cols=6 target=30603.9 clamped=30603.9
SAVE  localIdx=817 cols=6 scrollTop=40906.4 ratio=0.290281   ← another +200
RESTORE idx=817 cols=1 target=25890.9 clamped=25890.9
```
LocalIdx grew by 200 each cycle (buffer extending), but restore used stale index.

### Attempt 2: Suppress prepend compensation during density restore
**Idea:** Check `peekDensityFocusRatio() != null` in prepend compensation effect,
skip if a density restore is pending.
**Result:** `_densityFocusSaved` is cleared in rAF2 (line 593) BEFORE the extends
arrive and trigger compensation. By the time prepend-comp fires, the flag is null.
Compensation still fires after restore. User logs confirmed prepend-comp lines
still appeared between RESTORE and the next SAVE.

### Attempt 3: Dedicated suppression flag with timer (`isDensityRestoreInProgress`)
**Idea:** Set a flag at mount, clear it 1000ms after rAF2 restore. Prepend/evict
compensation checks the flag and skips.
**Result:** Suppressing compensation means scrollTop doesn't track the buffer shift.
The next SAVE captures `ratio = (rowTop + headerOffset - scrollTop) / clientHeight`
where rowTop has shifted (new localIndex) but scrollTop hasn't (no compensation).
This produced **worse** drift — ratio exploded from 0.29 to 6.52 to 16.44.

**User-observed logs (attempt 3 — ratio explosion):**
```
SAVE  localIdx=405 scrollTop=12705.6 ratio=0.291241   ← correct
SAVE  localIdx=605 scrollTop=12705.6 ratio=6.523175   ← scrollTop didn't move!
SAVE  localIdx=805 scrollTop=12705.6 ratio=16.445...  ← keeps growing
```
scrollTop stayed at 12705.6 because compensation was suppressed, but localIdx
grew from 405→605→805 because the buffer extended. rowTop grew with localIdx
while scrollTop stayed put → ratio exploded.

**Key lesson:** Suppressing compensation and allowing compensation both cause drift,
just through different mechanisms.

### Attempt 4: Save globalIndex instead of localIndex
**Idea:** `globalIndex` is stable across buffer extends. The restore converts to
localIndex at rAF2 time using current `bufferOffset`.
**Result:** **Partially successful.** The ratio is now stable across cycles (~0.291).
The exploding ratio (6.52, 16.44) is gone. But the post-restore prepend compensation
clamping issue remains. This is the current state of the code.

**User-observed logs (attempt 4 — ratio stable, but clamping visible):**
```
SAVE  globalIdx=160353 localIdx=402 ratio=0.291241
RESTORE savedIdx=402 freshIdx=402 target=12609.9 clamped=12609.9 (ok)
[prepend-comp] scrollBefore=12609.6 scrollAfter=19009.6 delta=6400.0 (ok)
SAVE  globalIdx=160353 localIdx=602 ratio=0.291529 (stable ✓)
RESTORE savedIdx=602 freshIdx=602 target=29997.1 clamped=29997.1 (ok)
[prepend-comp] scrollBefore=29996.8 scrollAfter=39996.0 delta=9999.2 (ok)
SAVE  globalIdx=160353 localIdx=802 ratio=0.291627 (stable ✓)
RESTORE savedIdx=802 freshIdx=802 target=25409.5 clamped=25409.5 (ok)
[prepend-comp] scrollBefore=25409.6 scrollAfter=30972.8 delta=5563.2 ← CLAMPED! expected 6400
```
The 4th cycle's prepend-comp is clamped: 25409.6 + 6400 = 31809.6 > maxScroll(30973).
Browser clips to 30973. 837px lost. This accumulates on subsequent cycles.

### Attempt 5: Exact row-delta compensation
**Idea:** Replace `ceil(prependCount / columns)` with
`ceil(newCount / columns) - ceil(oldCount / columns)` for exact row delta.
**Result:** Correct fix for a secondary issue (1-row overshoot per cycle in grid),
but doesn't solve the clamping problem. Still in the code and should be kept.

---

## 4. Approaches NOT Yet Tried

### A. Don't dispatch synthetic scroll event from restore (most promising)

The scroll event dispatch on line 592 (`el.dispatchEvent(new Event("scroll"))`)
triggers the entire extend→prepend→compensation chain. Removing it would:
- Prevent extends from firing during the density-switch settle window
- Eliminate the post-restore compensation that causes clamping
- The scrubber thumb sync happens via effect #3 (buffer-change re-fire),
  which fires when `bufferOffset`/`resultsLength` change — it doesn't need
  the synthetic event

**Risk:** The visible range won't be reported until the user scrolls or the next
buffer change. The scrubber thumb might be slightly out of sync until then. This
is probably acceptable — a 1-frame delay vs. accumulated drift.

**Test:** Remove line 592, run all 72 E2E tests. If the scrubber sync tests fail
(tests 69-72), they might need a small wait. But the density-focus tests (65-66)
should improve.

### B. Abort extends during density-focus settle window

Call `abortExtends()` before the rAF1, similar to how `resetScrollAndFocusSearch()`
does it. This would prevent extends from firing during the settle window. The
cooldown (2 seconds) would expire and extends would resume normally afterward.

**Risk:** 2-second delay before the buffer can extend after a density switch.
Acceptable if the user is just toggling density, not scrolling.

### C. Re-run restore AFTER compensation settles

Instead of a single rAF2 restore, use a longer defer (e.g. setTimeout 500ms)
that runs after any compensation has fired. Recompute everything from the
store at that point.

**Risk:** Visible scroll jump — the user might see content flash to the wrong
position, then snap to the right one. Worse UX than the current gradual drift.

### D. Pre-extend the buffer before restore

When the density-focus restore detects that the focused image is deep in the
buffer, proactively trigger extends to ensure the buffer has enough items in
both directions. Then restore after the extends complete.

**Risk:** Complexity, async coordination. Probably over-engineered.

### E. Clamp-aware save

If the SAVE detects that `ratio` would produce a target that exceeds maxScroll
in the other density, adjust the ratio to account for this. This is fragile
because the SAVE doesn't know the other density's geometry.

**Recommendation:** Try approach A first. It's the simplest and addresses the
root cause (the scroll event shouldn't trigger extends during density restore).
If A breaks scrubber tests, combine with B (abort extends before restore).

---

## 5. Current State of the Code

### `useScrollEffects.ts` — uncommitted changes

1. **DensityFocusState uses `globalIndex` instead of `localIndex`** — correct,
   keep this. Prevents the ratio explosion bug.

2. **`saveDensityFocusRatio(ratio, globalIdx)`** — save passes globalIdx now.

3. **Mount restore converts globalIndex → localIndex** via
   `saved.globalIndex - store.bufferOffset`.

4. **rAF2 fresh-lookup** — re-reads `imagePositions` and `bufferOffset` from
   the store at rAF2 time. Doesn't help currently (extends haven't fired yet),
   but is correct defensive code.

5. **Exact row-delta compensation** — `ceil(newCount/cols) - ceil(oldCount/cols)`
   instead of `ceil(prependCount/cols)`. Correct, keep this.

6. **DIAG console.log statements** — three diagnostic log points are in the code
   (see section 6 below). Keep them — they are the primary debugging tool.

7. **Suppression machinery REMOVED** — `startDensityRestore`, `finishDensityRestore`,
   `isDensityRestoreInProgress` are gone. Correct — they made things worse.

### `scrubber.spec.ts` — committed in Bug #17 fix

- `scrollDeep` helper dispatches synthetic scroll events
- Bug #17 tests use programmatic focus and scroll-into-view
- TABLE_HEADER_HEIGHT tolerance for grid→table visibility check
- All 72 tests pass

### `ImageGrid.tsx` — committed in Bug #17 fix

- Passes `minCellWidth: MIN_CELL_WIDTH` in geometry for real column calculation

---

## 6. Diagnostic Console Logs

Three DIAG log statements are embedded in the current code. **Do not remove them**
until the drift bug is fully fixed — they are the primary debugging tool. Each
attempted fix was diagnosed entirely from these logs.

### Log locations in `useScrollEffects.ts`

1. **`[density-focus SAVE]`** — in the unmount effect (effect #10, cleanup).
   Fires when a density component unmounts and saves its viewport state.
   ```
   [density-focus SAVE] fid=<imageId> globalIdx=<n> bo=<n> localIdx=<n>
     cols=<n> rowH=<n> headerOff=<n> rowTop=<n> scrollTop=<n>
     clientH=<n> ratio=<float>
   ```
   **Key field:** `ratio` — should stay ~0.29 across cycles. If it explodes, the
   save is capturing wrong geometry.

2. **`[density-focus RESTORE]`** — in the mount effect (effect #10, rAF2 callback).
   Fires when a density component mounts and restores scroll position.
   ```
   [density-focus RESTORE] savedIdx=<n> freshIdx=<n> bo=<n> cols=<n>
     rowH=<n> headerOff=<n> rowTop=<n> savedRatio=<float> clientH=<n>
     scrollTopBefore=<n> target=<n> scrollH=<n> maxScroll=<n>
     clamped=<n> wasClamped=<bool>
   ```
   **Key fields:** `savedIdx` vs `freshIdx` (should differ if buffer extended),
   `wasClamped` (true = target exceeded scroll range), `scrollTopBefore`
   (what was there before we set it — reveals compensation interference).

3. **`[prepend-comp]`** — in the prepend scroll compensation effect (#4).
   Fires when buffer extends prepend items and scrollTop is adjusted.
   ```
   [prepend-comp] prepended=<n> cols=<n> oldCount=<n> newCount=<n>
     oldRows=<n> newRows=<n> deltaRows=<n> scrollBefore=<n>
     scrollAfter=<n> delta=<n>
   ```
   **Key field:** `delta` — when it's less than `deltaRows * rowHeight`, the
   browser clamped scrollTop. That's the drift.

### How to reproduce and read the logs

1. Start dev server: `npm run dev`
2. Open browser DevTools console, filter by `density-focus` or `prepend-comp`
   (note: browser can't OR-filter, so either leave unfiltered or check twice)
3. Seek deep via scrubber (~50%)
4. Focus an image (click it)
5. Toggle density 4-5 times, slowly (no racing — drift happens even at slow pace)
6. Watch the `ratio` field in SAVE logs — should stay ~0.29
7. Watch the `delta` field in prepend-comp logs — when `delta < expected`, clamping
   occurred and that cycle introduced drift

### Manual testing availability

**The user is available and willing to do manual browser testing** for each attempted
fix. The workflow that has been working:

1. Agent makes a code change
2. Agent says what to look for in the logs
3. User tests manually (seek deep, toggle density 4-5 times)
4. User pastes the console log output back
5. Agent analyses and iterates

This is fast (~2 min per round-trip) and has been the primary way every attempt was
validated. The user is careful and slow — no racing, clean repros every time.

---

## 7. Test Coverage

72 E2E tests pass with the current code. The relevant tests:

- **Test 26:** `focused image ID survives grid→table→grid` — checks ID only, not position
- **Test 27:** `density switch after deep seek preserves focused image` — checks ID + globalPosition
- **Test 28:** `rapid density toggling doesn't corrupt state` — checks state integrity
- **Test 65:** `table→grid: focused image visible after deep scroll + density switch` — Bug #17
- **Test 66:** `grid→table: focused image visible after deep scroll + density switch` — Bug #17

Tests 65-66 check visibility after a single density switch at deep scroll. They pass
because the first switch works fine — it's the 3rd+ switch that drifts. A new test
that toggles 4+ times at deep scroll and checks visibility each time would catch
this bug.

---

## 8. Summary for the Next Agent

**The ratio is stable now. The drift comes from post-restore prepend compensation
being clamped at the scroll range boundary.** The fix is to prevent extends from
firing during the density-switch settle window. The most promising approach is to
remove the synthetic scroll event dispatch from the rAF2 restore (line 592 of
`useScrollEffects.ts`). This is approach A from section 4.

Don't try to suppress prepend compensation — that makes things worse (attempt 3).
Don't try to adjust the ratio for clamping — that's treating symptoms.

The globalIndex fix and exact row-delta compensation should be kept regardless of
how the drift is fixed.

The DIAG console.log statements are already in the code and working. Use them.
Ask the user to test manually — they're fast, careful, and happy to do it.
