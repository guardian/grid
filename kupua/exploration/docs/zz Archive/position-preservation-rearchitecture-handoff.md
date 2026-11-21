# Position Preservation — Full Rearchitecture Handoff

**Status:** Future work (not started)  
**Prerequisite:** The immediate phantom drift bug (Bug A + B) has been fixed
via a minimal geometry-coordinate fix in `buildHistorySnapshot`. This handoff
describes the larger rearchitecture that would unify all position preservation
into a single, robust system — **and**, in the same change, eliminate a
related bug family: intermediate flash of unwanted results during
buffer-replacement transitions.

**Date:** 2026-04-26  
**Companion docs:**
- `position-preservation-audit-handoff.md` — audit to validate this plan
  before implementation
- `preexisting-bugs-found-during-history-work.md` § Bug 2 — the seed flash
  bug + Option B standalone fix sketch

---

## Executive Summary

Kupua has **three independent ratio/coordinate systems** and **two parallel
preservation paths** (phantom vs explicit) working for **three scroll modes**.
The phantom drift bugs exposed fundamental fragility in how these interact.
The minimal fix (geometry-coordinate alignment) addresses the immediate
symptom. This document describes how to redesign the system so it has **one
coordinate system** and **one preservation path**, eliminating an entire
class of bugs.

**Beyond focus drift:** the same dual-path architecture is also responsible
for a second bug family — **intermediate flash** of stale buffer content
during sort/filter/popstate transitions when there is no anchor (Bug 2).
Unification likely deletes the flashing code path *by construction*. See
§ "Intermediate Flash and the No-Anchor Path" below.

---

## Current Architecture (Problems)

### Three Coordinate Systems

| # | Name | Formula | Used by | Includes padding? |
|---|------|---------|---------|-------------------|
| 1 | Sort-focus ratio | `(geoPixelTop - scrollTop) / clientH` | Effect #7 (param-watcher), Effect #9 (restore) | No |
| 2 | Density-focus ratio | `(geoPixelTop + headerOffset - scrollTop) / clientH` | Effect #10 (density switch save/restore) | No (but adds headerOffset for table) |
| 3 | History snapshot ratio | `(rowTop - scrollTop) / clientH` | `buildHistorySnapshot`, popstate restore | No (after Bug A fix; was DOM-based before) |

System 3 feeds into system 1 via `saveSortFocusRatio()` on popstate restore.
After the Bug A fix, systems 1 and 3 are aligned. System 2 is independent
(density-switch only) and correctly accounts for the table header.

**Future risk:** Any new code that computes a ratio and passes it to
`saveSortFocusRatio()` MUST use geometry coordinates. There's no type-level
enforcement of this — it's a number. A `ViewportRatio` branded type would
make this safer.

### Two Parallel Preservation Paths

**Explicit focus path:** `focusedImageId` is non-null. All preservation
code uses it directly. The image has a stable ID that survives across
buffer reloads.

**Phantom focus path:** `focusedImageId` is null. Code falls back to
`getViewportAnchorId()` — the image nearest viewport center. This is
inherently **fragile** because:
- It depends on scroll position (any sub-pixel drift changes the anchor)
- `_phantomFocusImageId` is one-shot (consumed after first use)
- After consumption, the system has no memory of which image it positioned
- Departing snapshots must re-derive the anchor, risking a different pick

### 24 Divergence Points

Full map of every code location where phantom and explicit paths diverge:

**Store plumbing (straightforward to unify):**
- D1: `_findAndFocusImage` in-buffer path — `search-store.ts` ~L1391
- D2: `_findAndFocusImage` deep-seek path — `search-store.ts` ~L1468
- D3: `search()` first-page shortcut — `search-store.ts` ~L1837
- D4: `search()` cleanup on entry — `search-store.ts` ~L1685
- D5: Error/timeout fallback paths — `search-store.ts` L1233, L1311, L1539

**Scroll effects (straightforward):**
- D6: Effect #9 sort-around-focus scroll — `useScrollEffects.ts` ~L700
- D7: Effect #7 param-watcher ratio save — `useScrollEffects.ts` ~L589
- D8: Density-switch save/restore — `useScrollEffects.ts` ~L815, L986

**Focus ring rendering (easy):**
- D9: ImageGrid focus ring — `ImageGrid.tsx` ~L526
- D10: ImageTable focus ring — `ImageTable.tsx` ~L325

**Click handlers (CANNOT unify — fundamental UX difference):**
- D11: Grid single-click — `ImageGrid.tsx` ~L400 (phantom: open detail, explicit: set focus)
- D12: Grid background click — `ImageGrid.tsx` ~L413
- D13: Table single-click — `ImageTable.tsx` ~L456

**Keyboard navigation (needs design decision):**
- D14: Arrow keys — `useListNavigation.ts` ~L397
- D15: Enter key — `useListNavigation.ts` ~L447
- D16: Home/End — `useListNavigation.ts` ~L473

**Feature gates (easy to change):**
- D17: Fullscreen preview `f` shortcut — `FullscreenPreview.tsx` ~L204
- D18: Metadata panel — `search.tsx` ~L232
- D23: Fullscreen preview resolve — `FullscreenPreview.tsx` ~L51
- D24: ImageDetail mount-guard — `ImageDetail.tsx` ~L86

**History/popstate (medium):**
- D19: Snapshot anchor selection — `build-history-snapshot.ts` ~L45
- D20: Popstate restore — `useUrlSearchSync.ts` ~L198
- D21: Phantom promotion — `useUrlSearchSync.ts` ~L221

**Mode switch:**
- D22: `setFocusMode("phantom")` clears focus — `ui-prefs-store.ts` ~L53

---

## Proposed Rearchitecture: Unified Preservation

### Core Idea

Always set `focusedImageId` internally. The "phantom" distinction moves from
the data model to the presentation layer. The store always knows which image
anchors the viewport. All preservation code uses this single, stable ID.

### What Changes

1. **Remove `_phantomFocusImageId`** — replaced by always setting `focusedImageId`
2. **Remove `phantomIdRef` and one-shot consumption** in Effect #9
3. **Remove `anchorIsPhantom`** from `HistorySnapshot` — anchor is always explicit
4. **Gate visible focus** on `getEffectiveFocusMode() === "explicit"`:
   - Focus ring (D9, D10): `isFocused = image.id === focusedImageId && shouldShowFocusRing()`
   - Metadata panel (D18): show only when `shouldShowFocusRing()`
   - Keyboard nav (D14-D16): only in explicit mode
   - Fullscreen preview (D17): only in explicit mode
5. **Click handlers unchanged** — D11/D13 still diverge (phantom: click-to-open,
   explicit: click-to-focus). This is UX, not data model.
6. **`getViewportAnchorId()` fallback eliminated** from all preservation paths
   — `focusedImageId` is always set, so the fallback never triggers

### What Stays the Same

- Click-to-open mode still opens detail on single click
- No focus ring in phantom mode
- No metadata panel in phantom mode
- Arrow keys still scroll in phantom mode (not move focus)
- The user sees no difference — change is purely internal

### Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| Click handlers | Phantom click must NOT set visible focus | Gate on `shouldShowFocusRing()`, not `focusedImageId` |
| Mode switch | Switching to phantom shouldn't clear position | Change: hide focus ring, keep `focusedImageId` |
| Background click | Clearing focus in phantom mode loses position | Keep `focusedImageId` on background click in phantom mode, or re-derive from viewport |
| `focusedImageId` consumers | Any code that checks `focusedImageId !== null` to mean "user explicitly focused" | Audit all consumers — must check `getEffectiveFocusMode()` instead |

---

## Intermediate Flash and the No-Anchor Path

### The link

The two-path architecture has a third symptom beyond phantom drift:
**intermediate-frame flashes** during buffer-replacement transitions when
the path with no anchor is taken.

**Bug 2 archetype** (sort dropdown, no focus, deep buffer):

| Frame | scrollTop | Buffer | loading | User sees |
|-------|-----------|--------|---------|-----------|
| 0 | deep | old sort | false | Old sort at deep position |
| 1 | **0** | old sort | false | **Old sort first page** ← FLASH |
| 2 | 0 | old sort | true | Still old sort (search in flight) |
| N | 0 | **new sort** | false | New sort first page ✓ |

Frame 1 happens because Effect #7 (`useScrollEffects.ts` param-watcher) runs
in a `useLayoutEffect` *before* paint, while `search()` only fires from
`useUrlSearchSync`'s `useEffect` *after* paint. With no `preserveId`, Effect
#7 falls through to `el.scrollTop = 0` on the old buffer.

**Why anchored paths don't flash:** when `preserveId` is non-null, Effect #7
saves the viewport ratio and **returns without resetting scroll**.
`search(focusId)` keeps `loading: true` and the old buffer visible.
`_findAndFocusImage` swaps the buffer + bumps `sortAroundFocusGeneration`,
and Effect #9 positions scroll in the same `useLayoutEffect` frame as the
re-render. **Zero intermediate frames.**

The flash is not a separate bug — it is the same dual-path disease as phantom
drift, manifesting at a different lifecycle moment. Drift = the anchor path
working imperfectly. Flash = the no-anchor path working as designed but
giving the user the wrong experience.

### Flash sites likely deleted by construction (P1 / always-set anchor)

If the rearchitecture wins and `focusedImageId` is always set (Option P1 in
the audit handoff), `preserveId` in Effect #7 is **never null**. The eager
`scrollTop = 0` else-branch is unreachable. Bug 2's code path disappears.

The §4 sort-relaxation question ("phantom + sort change → reset to top?")
becomes a UX *decision* made deliberately at the relaxation site, not an
accidental flash produced by a no-preserveId fallback.

Sibling sites that share family F1 (eager-reset-before-search) and would
likely also be deleted-by-construction:
- Filter change without focus
- Query typing settled (debounced)
- Popstate without snapshot (e.g. logo-reset entry)
- Any URL-driven search transition where the current code path computes
  `preserveId = null`

### Flash sites that survive unification (need separate fixes either way)

Not every flash is in family F1. The audit handoff catalogues these in
Section 7; for the rearchitecture, the relevant point is that the following
are **independent of the dual-path architecture** and need their own fixes
regardless of P1/P2:

- **F2. Non-atomic Zustand sets** — `setParams({ offset: 0 })` then
  `search(null)` in `useUrlSearchSync.ts`. React may render between the two
  `set()` calls. Independent of `focusedImageId`.
- **F3. Density-switch rAF chain** — Effect #10's two-rAF deferred restore.
  Geometry-paint mismatches during the chain.
- **F4. `bufferOffset → 0` window** — Effect #8 already exists *to prevent*
  a flash class. Audit whether it covers all entry points.
- **F5. PIT/buffer race** — first-page result arriving before
  `_findAndFocusImage` finishes.

### Decision matrix

| Audit finding | Rearchitecture proceeds? | Bug 2 standalone fix needed? |
|---|---|---|
| F1 dominates flash inventory AND deletes-by-construction under P1 | **Stronger yes** — one change kills two bug families | No — subsumed by P1 |
| F1 minor, F2–F5 dominate | Refactor case unchanged (still maintainability-only) | **Yes** — Option B `_scrollResetGeneration` per Bug 2 doc |
| Mixed | Refactor handles F1; Bug 2 Option B still needed for F2–F5 | Yes for F2–F5 |
| Drift fixed AND F1 minor | Refactor likely not worth it; archive | Yes — Option B alone |

The audit handoff Section 8 produces this matrix from concrete data.

### What this means for the rearchitecture's "What Changes"

Add a seventh item to the existing list in § "What Changes":

7. **No-anchor scroll-reset path is deleted.** Effect #7's
   `el.scrollTop = 0` else-branch becomes unreachable because
   `preserveId = focusedImageId` is always set. Sort-relaxation ("reset to
   top on sort change in phantom mode") moves out of Effect #7 and into the
   relaxation site itself — fired *atomically* via a generation bump
   (analogous to `sortAroundFocusGeneration`) so the scroll reset happens
   in the same `useLayoutEffect` frame as the buffer swap, not before paint.

This is the explicit unification of the Bug 2 Option B fix with the
rearchitecture: instead of adding a new `_scrollResetGeneration` counter
standalone, the rearchitecture either subsumes it (if all flash sites
resolve to the anchor path) or builds it once as part of the unified
atomic-handoff primitive.

### Risk: hiding the flash vs fixing it

If the rearchitecture lands but the always-set anchor is wrong (e.g.
`getViewportAnchorId()` picks an image that the new sort doesn't return),
`_findAndFocusImage` falls through to its first-page fallback. We must
verify this fallback is still flash-free in the unified world. Add to
the audit:

- Confirm `_findAndFocusImage` first-page fallback (`fallbackFirstPage`
  branch ~L1233/1311 in `search-store.ts`) doesn't expose intermediate
  state.
- Confirm "image not in new results" → reset-to-top transition is itself
  atomic (would need its own generation bump or piggyback on
  `sortAroundFocusGeneration`).

---

## Investigation Methodology (Reusable)

### Diagnostic Test Approach

The diagnostic test `e2e/smoke/phantom-drift-diag.spec.ts` captures BOTH
coordinate systems at every step:

- **PositionProbe**: Complete state snapshot including store state, scroll
  container measurements, DOM coordinates (getBoundingClientRect), geometry
  coordinates (row × ROW_HEIGHT), both ratios, viewport anchor, center image
- **captureVisibleCells**: All visible images with DOM and geometry coordinates,
  delta between them (should be constant = container padding)

Key insight: capture BEFORE and AFTER each navigation step, including
intermediate states. The `[drift-diag]` console.log instrumentation
(now removed from source) traced exact ratio values through the pipeline:
- `saveSortFocusRatio` (who called, what value, previous value)
- `consumeSortFocusRatio` (what was consumed)
- Effect #7 param-watcher (which image, which ratio, geometry details)
- Effect #9 restore (ratio, rowTop, target scrollTop, clamped, before/after)
- `buildHistorySnapshot` (anchor, ratio, DOM measurements)

### How to Re-add Instrumentation

To diagnose future position bugs, add console.log at these 5 points:

```typescript
// useScrollEffects.ts — saveSortFocusRatio
console.log(`[diag] saveSortFocusRatio: ${ratio.toFixed(6)}`,
  new Error().stack?.split('\n').slice(1, 3));

// useScrollEffects.ts — consumeSortFocusRatio
console.log(`[diag] consumeSortFocusRatio: ${r?.toFixed(6) ?? 'null'}`);

// useScrollEffects.ts — param-watcher (Effect #7)
console.log(`[diag] param-watcher: id=${preserveId}, ratio=${ratio.toFixed(6)}`);

// useScrollEffects.ts — Effect #9 ratio-restore
console.log(`[diag] Effect#9: id=${id}, ratio=${savedRatio.toFixed(6)}, ` +
  `rowTop=${rowTop}, target=${target.toFixed(1)}`);

// build-history-snapshot.ts — snapshot capture
console.log(`[diag] snapshot: anchor=${anchorImageId}, ratio=${viewportRatio?.toFixed(6)}`);
```

The diagnostic test captures these via `startConsoleCapture()` / `getConsoleLogs()`.

### Stable Test Corpora

Three queries that exercise all three scroll modes, pinned with `STABLE_UNTIL`:

| Mode | Total | Query |
|------|-------|-------|
| Scroll (<1k) | 958 | `search?nonFree=true&query=keyword:"mid length half celebration"&until=2026-03-04T00:00:00Z` |
| Two-tier (1k–65k) | 14,399 | `search?nonFree=true&until=2026-03-04T00:00:00Z&query=city:Dublin` |
| Seek (>65k) | 1,304,298 | `search?nonFree=true&until=2026-03-04T00:00:00Z` |

These require the TEST cluster via SSH tunnel (`./scripts/start.sh --use-TEST`).
Results are frozen by the `until` param — will not change unless images are
deleted from the index (extremely unlikely for historical data).

---

## Testing Plan for Rearchitecture

### Phase 1: Baseline (before changes)

Run the diagnostic test across all 3 scroll modes to establish baseline
drift measurements. The existing `phantom-drift-diag.spec.ts` tests D1
(phantom drift) and D2 (explicit drift) on seek mode. Extend to:
- D1/D2 on scroll mode (958 results)
- D1/D2 on two-tier mode (14,399 results)
- D4: Sort change + back/forward (tests the param-watcher → snapshot → restore cycle)
- D5: Filter change + back/forward (tests phantom promotion + snapshot + restore)

**Flash baseline:** also capture per-frame screenshots (or
`requestAnimationFrame` instrumentation) across the F1 sites enumerated in
the audit §7, on all 3 scroll modes. Need objective "frames of stale
content" counts for each site, **before** any rearchitecture work, to
validate post-refactor that the count drops to zero.

### Phase 2: Unification

1. Always set `focusedImageId` in phantom paths (D1-D3)
2. Remove `_phantomFocusImageId`, `phantomIdRef`, one-shot consumption (D4-D6)
3. Gate all visible focus on `shouldShowFocusRing()` (D9-D10, D14-D18)
4. Remove `anchorIsPhantom` from `HistorySnapshot` (D19-D21)
5. **Atomicise no-anchor scroll-reset.** Replace Effect #7's eager
   `el.scrollTop = 0` else-branch with a generation-bump pattern: bump
   `_scrollResetGeneration` from `search()`'s no-focus else-branch
   (~`search-store.ts` L1830) atomically with the buffer swap; new
   `useLayoutEffect` watches the generation and resets scroll in the same
   frame as the data swap. (If item 1 succeeds, this branch may already be
   unreachable — but keep the atomic primitive for defence-in-depth and for
   the deliberate §4 sort-relaxation site.)
6. Re-run ALL existing tests (396 unit + 183 e2e)
7. Re-run diagnostic tests across all 3 scroll modes
8. **Re-run flash baseline** — every F1 site should now report 0 frames of
   stale content. Any non-zero result blocks the merge.

### Phase 3: Plaster removal

With the coordinate system unified and the dual paths merged, evaluate
whether the existing plasters in Effect #9 can be simplified:
- Extremum snap (L856-864): may no longer trigger with correct ratios
- Bottom extremum snap (L869-879): same
- Row-proximity snap (L921-927): evaluate if still needed

### Phase 4: Coordinate system hardening

Consider introducing a branded `ViewportRatio` type to prevent accidentally
mixing DOM-based and geometry-based ratios. This is a type-level safeguard
that makes the coordinate system mismatch a compile error instead of a
runtime bug.

---

## Key Files Reference

| File | Role |
|------|------|
| `src/hooks/useScrollEffects.ts` | All scroll effects (10 categories), ratio save/restore |
| `src/hooks/useUrlSearchSync.ts` | Bidirectional URL↔store sync, popstate detection, snapshot restore |
| `src/lib/build-history-snapshot.ts` | Builds HistorySnapshot from current state |
| `src/lib/history-snapshot.ts` | HistorySnapshot interface, LRU snapshot store |
| `src/stores/search-store.ts` | Core search state, `_findAndFocusImage`, `search()` |
| `src/hooks/useDataWindow.ts` | `getViewportAnchorId()`, visible range reporting |
| `src/stores/ui-prefs-store.ts` | Focus mode (explicit/phantom) |
| `src/components/ImageGrid.tsx` | Grid rendering, focus ring, click handlers |
| `src/components/ImageTable.tsx` | Table rendering, focus ring, click handlers |
| `src/hooks/useListNavigation.ts` | Keyboard navigation |
| `src/constants/layout.ts` | ROW_HEIGHT, MIN_CELL_WIDTH, etc. |
| `src/lib/two-tier.ts` | `isTwoTierFromTotal()` — scroll mode detection |
| `e2e/smoke/phantom-drift-diag.spec.ts` | Diagnostic test with full coordinate capture |
