# DISASTAH-NOT-PERF — Post-Mortem and Recovery Plan

> **Date:** 31 March 2026
> **Context:** ~5 hours of agent work across two sessions tried to fix regressions
> from the unpushed commit `3dac9ff5e`. Every fix introduced new bugs. Nothing from
> the fix sessions is committed. This document captures what happened, what broke,
> and what (if anything) is salvageable.

---

## Current Git State

```
3dac9ff5e  (HEAD, unpushed)  "kupua: coupling fixes (Phases A–C) + perf measurement infrastructure"
34b3e17d3  (origin/mk-next-next-next, pushed, SAFE)  "Use layout constants, introduce performance test harness"
```

**Layer 1 — Unpushed commit `3dac9ff5e`:** 18 files, ~3,155 insertions, ~117 deletions.
**Layer 2 — Uncommitted changes (this session):** 10 files, ~1,181 insertions, ~27 deletions.

### How to get back to a working app

```bash
# 1. Discard ALL uncommitted changes (Layer 2 — the failed fix session)
git checkout -- .

# 2. Soft-reset the unpushed commit (Layer 1 — keeps files as staged)
git reset --soft HEAD~1

# 3. Now everything from 3dac9ff5e is staged. Discard it all:
git reset HEAD .
git checkout -- .

# You're now at 34b3e17d3 — the last pushed, known-good state.
```

Or simply: `git reset --hard 34b3e17d3` (nuclear option — discards everything in one step).

---

## What the Pushed Commit (`34b3e17d3`) Changed — SAFE

Analysed line-by-line. **Zero behavioural change.** Details:

| File | What | Impact |
|---|---|---|
| `src/constants/layout.ts` (NEW) | Shared constants: `TABLE_ROW_HEIGHT=32`, `TABLE_HEADER_HEIGHT=45`, `GRID_ROW_HEIGHT=303`, `GRID_MIN_CELL_WIDTH=280`, `GRID_CELL_GAP=8` | None — just a new module |
| `src/components/ImageGrid.tsx` | Replaced 3 inline constants with imports from `layout.ts`, aliased to same local names | Zero — identical values, identical names |
| `src/components/ImageTable.tsx` | Replaced 2 inline constants with imports from `layout.ts`, aliased to same local names | Zero — identical values, identical names |
| `src/components/Scrubber.tsx` | Removed `handleKeyDown` callback + `ARROW_STEP`/`ARROW_STEP_LARGE` constants | Zero — `handleKeyDown` was **dead code** (never wired to any JSX `onKeyDown` prop) |
| `src/lib/sort-context.ts` | Removed unused `isDecade` variable; fixed misleading comment ("decade" → "half-decade") | Zero — the tick type condition was already `isHalfDecade`, `isDecade` was declared but never used |

**Verdict: The pushed commit is pure mechanical refactoring. The app at `34b3e17d3` behaves identically to its parent.**

---

## What the Unpushed Commit (`3dac9ff5e`) Changed — THE DISASTER

18 files. The changes fall into these categories:

### Category 1: Perf Harness Infra (USEFUL — keep)

| File | What |
|---|---|
| `e2e-perf/results/audit-log.json` | 1,638 lines of raw measurement data from 5 test runs |
| `e2e-perf/results/audit-log.md` | 195-line human-readable summary of measurement results |
| `e2e-perf/run-audit.mjs` | Bug fix: `aggregateMetrics()` now preserves `focusDriftPx`/`focusDriftRatio`/`focusVisible` fields (were being silently stripped). Also: O(1) sentinel for result key instead of `ids.join(",")` |
| `.gitignore` | Added `e2e-perf/results/.metrics-tmp.jsonl` |

**These files contain no app code. They are measurement infrastructure. Safe to keep.**

### Category 2: Docs (USEFUL as cautionary record — keep selectively)

| File | What | Keep? |
|---|---|---|
| `exploration/docs/perf-measurement-report.md` (NEW) | 295-line report of all measurement data with honest assessment | ✅ Yes — valuable data |
| `exploration/docs/focus-drift-and-scroll-handoff.md` (NEW) | 427-line handoff plan for focus drift + P8 investigation | ⚠️ Yes as reference, but its **fix recommendations are WRONG** (they were followed and caused the disaster) |
| `exploration/docs/changelog.md` | 221 lines appended describing Phases A–C implementation | ✅ Yes — historical record |
| `exploration/docs/fix-ui-docs-eval.md` | Added Part 5 (measured results); updated priority table with ✅ marks | ✅ Yes |
| `exploration/docs/fix-ui-coupling-plan.md` | Added ✅ DONE markers, measured results, performance budget table | ✅ Yes |
| `exploration/docs/fix-ui-coupling.md` | Marked C6, C7 as resolved; removed old code samples | ✅ Yes |
| `exploration/docs/coupling-fix-handoff.md` | Added Phase C "done" annotation | ✅ Yes |
| `AGENTS.md` | Updated perf section, known issues, project structure | ⚠️ Describes state that no longer exists if code is reverted |

### Category 3: App Code Changes (BROKE THINGS — details below)

| File | Change ID | What |
|---|---|---|
| `src/lib/scroll-container-ref.ts` (NEW) | B.1 | Module-level ref for scroll container (replaces DOM archaeology in Scrubber) |
| `src/hooks/useHeaderHeight.ts` (NEW) | C.1 | ResizeObserver hook measuring sticky header height |
| `src/lib/scroll-reset.ts` | B.1 | Uses `getScrollContainer()` instead of `document.querySelector(ARIA selectors)` |
| `src/components/Scrubber.tsx` | B.1, C.7 | Uses `getScrollContainer()` instead of DOM sibling-walking. Removed `findScrollContainer`, `MutationObserver`. Fixed tooltip magic number. |
| `src/components/ImageGrid.tsx` | A.1, A.2, A.4, B.1 | Stabilised `handleScroll` via ref (A.1), memoised column indices (A.2), **changed GridCell key to `image?.id`** (A.4), registered scroll container (B.1) |
| `src/components/ImageTable.tsx` | A.1, A.3, A.5, B.1, C.1 | Stabilised `handleScroll` via ref (A.1), cached canvas font (A.3), O(1) visible-key sentinel (A.5), registered scroll container (B.1), measured header height (C.1) |

---

## What Specifically Broke (and Why)

### BUG 1: Visual reordering on seeks and searches (A.4 — GridCell key)

**The change:** `key={imageIdx}` → `key={image?.id ?? \`empty-${imageIdx}\`}` in ImageGrid.

**Why it was done:** Content-based keys prevent React from unmounting/remounting GridCells when `bufferOffset` shifts (backward extend). Measured: −14% domChurn on extends.

**Why it broke:** TanStack Virtual uses **positional rendering** — row N renders at `top: N * estimateSize`. Content-based keys cause React to reuse component instances from old virtual positions when the buffer is wholesale-replaced (seek, new search). React sees "same key, same component" and tries to update in place, but the virtualizer has already positioned the div at a new coordinate. The result: visible reordering/shuffling animation as React reconciles mismatched positions.

**The trap:** This session's fix attempt (revert to `key={imageIdx}`) caused an even worse bug — **wrong image on click** (clicking an image navigated to a different image's detail view). The memo'd GridCell wasn't re-rendering when the underlying image changed because positional keys + same index = React thinks nothing changed.

**Conclusion:** Neither key strategy works cleanly. Content keys break seeks; positional keys break click-to-detail after buffer replacement. The handoff doc's "Option C" (conditional keying based on a wholesale-replace flag) might work but was never attempted. **This is the hardest problem and should not be attempted without a clear, tested plan.**

### BUG 2: Home button doesn't scroll to top after deep seek

**Observed:** After seeking deep (scrubber drag to position 500k), clicking Home/logo lands at image 5 (row 2), not image 1. Off by one row.

**Root cause (suspected):** The scroll-reset path (`resetScrollAndFocusSearch`) sets `scrollTop = 0` and dispatches a synthetic scroll event, but the virtualizer's internal `scrollOffset` state lags behind. The virtualizer renders from its stale offset for one frame, then catches up — but by then the buffer has been replaced and the wrong content is at position 0.

**This session's fix attempts:**
1. **Option A:** Created `scroll-reset-ref.ts` — registration pattern so `resetScrollAndFocusSearch()` can call `virtualizer.scrollToOffset(0)`. **Result: still broken.**
2. **Option C:** Added `useLayoutEffect` watching `bufferOffset` transitions from non-zero to 0 — forces `scrollTop=0` + `virtualizer.scrollToOffset(0)`. **Result: still broken, and introduced the wrong-image-on-click bug when combined with the A.4 revert.**

**Conclusion:** The timing issue is deeper than just "tell the virtualizer to scroll to 0". The problem may be that the buffer replacement and scroll reset happen in different microtask/render cycles. Needs careful investigation with devtools to trace the exact sequence of events.

### BUG 3: Density switch focus completely lost after 3+ switches

**Observed:** Switching table↔grid 3+ times (at normal speed) loses the focused image entirely. Earlier switches are OK but show drift (−160px on table→grid). Four visible reordering flashes on table→grid switch (previously max 3, 2 was already too many).

**Measured data (before fix attempts):** P4b drift = −160px (table→grid). P4a = 0px (grid→table).

**This session's fix attempt:** Modified `saveFocusRatio` in ImageTable unmount to include `HEADER_HEIGHT` offset; modified ImageTable mount restore to use symmetric formula. **Result: not tested against live data before session ended. Likely made things worse given the other failures.**

**Root cause (suspected for multi-switch loss):** Possibly `imagePositions` map eviction (map only holds positions for images in the current buffer), or accumulated rounding errors in ratio save/restore across multiple switches. The module-level `density-focus.ts` bridge holds one value — if a switch triggers multiple save/consume cycles, the value gets stomped.

### BUG 4: P12-scroll.severe monotone upward trend (A.1 — handleScroll stabilisation)

**The change:** Stored `virtualizer` in a ref instead of using it directly in `handleScroll`'s dependency array. This makes `handleScroll` stable across renders (doesn't get recreated every render).

**Potential issue:** `virtualizerRef.current` can be one render stale during rapid scroll. The `range` values read from the stale virtualizer may trigger slightly different `loadMore` timing, causing more loads per scroll session.

**Data:** P12-scroll.severe went 9→11→12→14 across Baseline→A→B→C. Monotone upward. Single-run data (not confirmed with `--runs 3`), so could be noise.

---

## What the Failed Fix Session (Layer 2) Added — ALL BROKEN, DISCARD

| File | What | Status |
|---|---|---|
| `src/lib/scroll-reset-ref.ts` (NEW) | Registration pattern for `virtualizer.scrollToOffset(0)` | ❌ Didn't fix Issue 1 |
| `src/lib/sort-focus.ts` (NEW) | Module-level bridge for viewport ratio preservation across sort changes | ❌ Never tested on live data; approach may be sound but implementation untested |
| `src/lib/scroll-reset.ts` | Added `fireScrollReset()` call | ❌ Didn't fix Issue 1 |
| `src/components/ImageGrid.tsx` | Scroll-reset registration, sort-focus ratio capture/restore, bufferOffset→0 transition guard, **A.4 revert (positional keys)** | ❌ A.4 revert caused wrong-image-on-click. Everything else untested/broken. |
| `src/components/ImageTable.tsx` | Same as ImageGrid + HEADER_HEIGHT offset in density save/restore | ❌ Untested on live data |
| `AGENTS.md` | Updated to describe non-existent fixed state | ❌ Describes fiction |
| `exploration/docs/changelog.md` | 66 lines describing fixes that don't work | ❌ Describes fiction |
| `exploration/docs/deviations.md` | Added §26 (sort-around-focus ratio preservation) | ❌ Feature doesn't work |
| `exploration/docs/post-perf-fixes.md` (NEW) | 432-line handoff doc for this session | ⚠️ Analysis is useful, fix recommendations are wrong |
| `exploration/docs/focus-drift-and-scroll-handoff-v2.md` (NEW) | 436-line revised handoff doc | ⚠️ Same — analysis useful, recommendations wrong |

**Recommendation: Discard all of Layer 2.** The two handoff docs contain useful analysis but dangerous fix recommendations. If kept, they need giant warnings at the top.

---

## What Is Actually Worth Salvaging from `3dac9ff5e`

### Definitely keep

1. **`e2e-perf/results/audit-log.json` + `audit-log.md`** — measurement data from 5 runs. Irreplaceable unless you re-run.
2. **`e2e-perf/run-audit.mjs` changes** — the focusDrift field preservation fix is a real bug fix in the harness.
3. **`.gitignore` addition** — trivial, correct.
4. **All docs in `exploration/docs/`** — the measurement report, handoff docs, eval updates, coupling fix plan updates. These are historical record even though the code changes they describe are being reverted. They document what was tried and what the measured data showed.

### Maybe keep (needs careful manual testing)

5. **`src/lib/scroll-container-ref.ts`** (B.1) — the module-level ref pattern replacing DOM archaeology in Scrubber. This is architecturally cleaner. The Scrubber changes that consume it are tightly coupled, so you'd need to keep both or neither.
6. **`src/components/Scrubber.tsx` changes** (B.1, C.7) — uses `getScrollContainer()` instead of `findScrollContainer()` DOM walking. Removes `MutationObserver`. Fixes tooltip magic number `48` → measured `offsetHeight`. **These changes are logically independent from the broken A.x changes.** They could be extracted and kept, but require the scroll-container-ref module.
7. **`src/lib/scroll-reset.ts` change** — uses `getScrollContainer()` instead of `document.querySelector(ARIA selectors)`. Pairs with B.1.
8. **`src/hooks/useHeaderHeight.ts`** (C.1) — ResizeObserver hook. Architecturally sound, zero scroll-path cost. But it's only consumed by ImageTable, and the ImageTable changes are tangled with the broken A.x stuff.

### Definitely discard

9. **ImageGrid.tsx changes** — A.1 (virtualizerRef), A.2 (columnIndices memo), A.4 (content-based key), B.1 (registerScrollContainer). A.4 is the catastrophic change. A.1 has the P12 regression concern. A.2 is harmless but not worth keeping alone. B.1 is fine but requires the scroll-container-ref module.
10. **ImageTable.tsx changes** — A.1 (virtualizerRef), A.3 (canvas font cache), A.5 (O(1) visible key), B.1 (registerScrollContainer), C.1 (useHeaderHeight). A.1 has the P12 concern. A.5 is probably fine but was part of a commit that broke things. The safest path is to discard all and re-introduce individually with testing.

---

## The Fundamental Problem

The coupling-fix programme tried to optimise 5+ independent things in one commit. Some worked (scrubber decoupling, canvas font cache, column array memo). One was catastrophic (A.4 content-based keys). The monolithic commit made it impossible to keep the good and discard the bad without manual surgery.

The fix session then compounded the problem by:
1. Following handoff doc recommendations that were wrong (A.4 revert to positional keys)
2. Layering fix-on-fix without testing each change against live data
3. Adding 3 new module-level bridge files for an untested fix approach
4. Modifying 2 large components in multiple orthogonal ways simultaneously

### Lesson: One change at a time, test against live data after each

The perf harness exists and produces real numbers. Future work should:
1. Make ONE change
2. Run unit + E2E tests
3. Run perf harness against live data
4. Confirm no regression
5. Commit that one change
6. Repeat

---

## Recovery Options

### Option A: Nuclear reset (recommended)

```bash
git reset --hard 34b3e17d3
```

Back to the last pushed commit. All perf harness data, all docs, all code changes — gone. You'd need to re-run the perf harness to regenerate the measurement data. But the app works.

### Option B: Soft reset + surgical keep

```bash
# Discard uncommitted (Layer 2)
git checkout -- .

# Soft-reset Layer 1
git reset --soft HEAD~1

# Unstage everything
git reset HEAD .

# Now selectively stage what you want to keep:
git add kupua/e2e-perf/results/audit-log.json
git add kupua/e2e-perf/results/audit-log.md
git add kupua/e2e-perf/run-audit.mjs
git add kupua/.gitignore
git add kupua/exploration/docs/  # all docs

# Discard the rest (code changes):
git checkout -- kupua/src/
git checkout -- kupua/AGENTS.md

# Commit what you kept
git commit -m "kupua: perf measurement data + docs (code changes reverted)"
```

This preserves the measurement data and docs without any code changes.

### Option C: Soft reset + re-introduce B.1 separately (ambitious)

Same as Option B, but after the cleanup commit, cherry-pick just the B.1 changes (scroll-container-ref + Scrubber + scroll-reset) as a separate commit and test manually. This is the cleanest architectural improvement that's independent from the broken A.x stuff. But it requires manual testing of the Scrubber in all modes (scroll, seek, drag, wheel forwarding, density switch).

---

## The One Good Thing

> "The only good thing about current state of the app is: flashes of reordering (which itself is a bug) happens faster."

This was real. The P7 LoAF improvement (133→47ms) from A.1 (handleScroll stabilisation) + B.1 (no more DOM archaeology on every scroll event) is genuine and measured. But it came packaged with A.4 (the catastrophic key change) in the same commit. If B.1 is ever re-introduced separately, the "faster flashes" improvement should return without the reordering regression.

---

## Tests Were Useless

64 E2E tests passed after every change in the unpushed commit. All of them passed after the catastrophic fix session too. They caught none of:
- Wrong image on click (A.4 revert)
- Home button landing at row 2 instead of row 1
- Focus lost after 3+ density switches
- Visual reordering on seeks

This is the biggest meta-problem. The test suite validates structure and basic flows but not visual correctness or data integrity after state transitions. Any future perf work needs to **first** add tests that would catch these regressions, **then** make the changes.

Specific test gaps:
1. **No test verifies that clicking image N opens image N** (not image N±K)
2. **No test verifies scroll position is exactly 0 after Home from deep seek** (tests check "near top" but not pixel-exact)
3. **No test for focus survival across 3+ rapid density switches**
4. **No test for visual reordering during seek** (would need screenshot comparison or DOM position assertions)

