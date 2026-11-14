# Two-Tier Virtualisation — Code Audit Report

> 14 April 2026

---

## 1. Scope of Work

**Four layers, implemented across 10-14 Apr 2026:**

1. **Position Map** (Phases 0-3, 10-12 Apr) — lightweight `[id, sortValues]` index for 1k-65k results
2. **Two-Tier Virtualisation** (Sessions 1-3, 13 Apr) — `virtualizerCount = total`, global indices, direct scroll
3. **E2E Test Adaptation** (13 Apr) — making existing tests work in always-two-tier local environment
4. **Bug fixes + hardening** (13-14 Apr) — Bug #18 skeleton deadlock (fundamental `twoTier` derivation change), permanent skeleton fix, End key fix, density-switch fixes, Home button fixes, position map null-zone fix, scrubber thumb frozen fix, placeholder detection, nonFree consolidation, scroll-container-ref observability, cross-tier test matrix

---

## 2. Code Balance vs HEAD

> **Note:** Exact line counts are approximate — many files were modified multiple
> times across the 13-14 April bug fix sessions. The numbers below reflect the
> final state, not the intermediate states.

### Production code (14 files + 2 new)

| File | ~Lines | What |
|------|--------|------|
| `search-store.ts` | 3,178 | Position map fetch trigger, parallel seek path, `exactOffset` branching, `_seekTargetGlobalIndex` (exact/inexact split), sort-around-focus position map fetch, scoped perf marks |
| `useDataWindow.ts` | 430 | Two-tier mode: `twoTier` from total range, global `getImage`/`findImageIndex`, scroll-triggered seek, extend threshold remapping |
| `es-adapter.ts` | — | `fetchPositionIndex()` — dedicated PIT, chunked `_source:false` walk, scheduler yield, explicit `missing` in sort clauses for null-zone compat, ES error body diagnostics |
| `Scrubber.tsx` | 1,170 | Tristate mode (`buffer`/`indexed`/`seek`), `isScrollMode` includes `twoTier` prop, `useScrollContainerGeneration()` dep on scroll-sync effect |
| `scroll-container-ref.ts` | — | **New functionality:** generation counter + `useSyncExternalStore` hook for observable container changes |
| `position-map.ts` | 78 | `PositionMap` type, `cursorForPosition()` helper |
| `useScrollEffects.ts` | 912 | `isTwoTierFromTotal()` + `toVirtualizerIdx()` helpers, two-tier gates on compensation (#4/#5), bufferOffset→0 guard (#8, twoTier guard removed), seek scroll-to-target branching (#6), density-focus restore |
| `mock-data-source.ts` | — | `fetchPositionIndex` stub for tests |
| `ImageDetail.tsx` | — | Global index for `storeImageOffset`, `getImage()` instead of `results[idx]`, position counter |
| `ImageGrid.tsx` | — | `storeImageOffset` two-tier gate, width-change anchor fix |
| `tuning.ts` | 177 | `POSITION_MAP_THRESHOLD` constant |
| `types.ts` | — | `fetchPositionIndex?()` on `ImageDataSource` interface |
| `ImageTable.tsx` | — | `storeImageOffset` two-tier gate, `getImage()` |
| `search.tsx` | — | `positionMapLoaded` prop (separate from `twoTier`), `currentPosition` derivation |
| `useListNavigation.ts` | — | `loadMore` guard: `bufferOffset + resultsLength < total` |
| `home-defaults.ts` | — | **New file:** `DEFAULT_SEARCH` single source of truth for home URL defaults |

### Test code (3 test files in `src/`)

| File | Lines | What |
|------|-------|------|
| `search-store-position-map.test.ts` | 545 | Position map store integration: fetch lifecycle, invalidation, abort, seek with map |
| `useDataWindow.test.ts` | 457 | Two-tier index mapping: `getImage`, `findImageIndex`, extend triggers, viewport anchor |
| `position-map.test.ts` | 244 | `cursorForPosition` edge cases, `PositionMap` type validation |

### E2E test changes (6 files)

| File | What |
|------|------|
| `scrubber.spec.ts` | Two-tier tests (12 added, 6 later culled by tier matrix), ~14 mode-aware assertion edits, placeholder detection retrofit, Home button tests, density-switch tests. 3 grid/table pairs merged into parameterised loops. |
| `helpers.ts` | `waitForPositionMap()`, `isTwoTierMode()` (total-range-based), `seekTo` position-map wait fix, `assertNoVisiblePlaceholders()`, `countVisiblePlaceholders()` |
| `keyboard-nav.spec.ts` | Store-based focus for Home key test |
| `buffer-corruption.spec.ts` | Store-based focus for metadata/detail tests, culled redundancies |
| `tier-matrix.spec.ts` | **New file:** 18 cross-tier tests (buffer/two-tier/seek) |
| `playwright.tiers.config.ts` | **New file:** 3 projects × 3 webServers for tier matrix |

### Summary

Habitual E2E suite: 128 tests (~5.8min). Tier matrix: 54 tests (~4.2min, manual).
Unit tests: 270. Total test count across all modes: 270 unit + 128 habitual E2E +
54 tier matrix + 20 perf + 27 smoke = ~499.

---

## 3. Critical Assessment

### What was done well

**1. The central invariant (`twoTier` derived from total range) is cleanly threaded.**
`twoTier` is derived from `SCROLL_MODE_THRESHOLD < total ≤ POSITION_MAP_THRESHOLD`,
making the coordinate space stable from frame 1. The position map is a background
performance optimisation (faster seeks), not a coordinate-space decision — an
important separation that avoids late coordinate-space flips when the map arrives
asynchronously. Every code path checks `twoTier` or `isTwoTierFromTotal()` to
decide behaviour. When false, all paths are identical to HEAD — zero regression
by design.

**2. The feature boundary is clean.** `search()` invalidates the position map
and triggers a new fetch. `twoTier` stays true during the transition (because
it's total-based, not positionMap-based), so the coordinate space doesn't
flip during search-to-results. `seek()` preserves the position map. Filters,
sort changes, queries, and Home all go through `search()`, so position map
refresh is automatic.

**3. No unnecessary abstractions.** The position map is a plain struct-of-arrays
(two parallel arrays + length). `cursorForPosition` is a 6-line function. No classes,
no inheritance, no factory patterns. The simplest representation that works.

**4. The parallel seek is well-isolated.** The `Promise.all` path only activates
when `positionMap` is available. The sequential fallback is untouched. Error handling
is per-direction (one failing doesn't kill the other).

**5. The E2E test adaptation evolved well.** Initially, tests used `if (!isTwoTier)`
guards. The cross-tier test matrix (14 April) superseded 6 of those tests with 18
tier-aware tests that run across all 3 tiers via env-var-controlled thresholds. The
`seekTo` position-map wait fix in `helpers.ts` was the right root-cause fix. The
placeholder detection helpers (`assertNoVisiblePlaceholders`) catch "buffer correct
but viewport shows skeletons" regressions that were previously invisible.

**6. Dedicated PIT for position map fetch.** Correct decision — avoids interference
with the main search PIT lifecycle. The measurement script validated this upfront.

**7. `scroll-container-ref.ts` made observable.** The density-switch scrubber thumb
bug revealed that `scroll-container-ref.ts` was a fire-and-forget setter/getter with
no notification mechanism. Adding a generation counter + `useSyncExternalStore` hook
is the right fix — any consumer that needs to react to container changes subscribes
via the hook instead of hoping indirect effect deps catch the change.

**8. `toVirtualizerIdx` helper.** The global→virtualizer index conversion
(`isTwoTier ? globalIdx : globalIdx - bufferOffset`) appears in many places across
`useScrollEffects.ts`. The `toVirtualizerIdx` helper makes the pattern greppable and
reduces the odds of getting the ternary wrong.

### Concerns and opportunities

**1. `search-store.ts` is ~3,178 lines.**

The position-map seek path added ~145 lines inside `seek()`, which was already the
largest function in the file (~500 lines). The seek function now has 5 strategy
branches: End key → position-map → shallow → deep date → deep keyword, each with
its own null-zone handling.

This isn't yet a problem — it's linear complexity (a decision tree, not
combinatorial), the branches are well-commented, and every branch ends with the
same `set()` call. But it's approaching the limit where a single grep or scroll
can't see the full function. If another seek strategy is ever needed, this should
be extracted.

**Recommendation:** No action now. If `seek()` grows beyond ~600 lines or a 6th
path is added, extract each path into a named async function (e.g.
`_seekViaPositionMap`, `_seekViaPercentile`, `_seekViaKeyword`) called from a
dispatcher. The dispatcher reads well, the implementations can be unit-tested
independently. But doing this proactively would be refactoring for the sake of it.

**2. The `exactOffset` variable in `seek()` is accumulating responsibilities.**

It started as "the offset is known-exact (no percentile drift)." Now it also
controls: (a) whether to use `targetLocalIndex` directly vs reverse-compute,
(b) whether to set `_seekTargetGlobalIndex` (exact→`clampedOffset`,
inexact→`actualOffset + backwardItemCount`), and (c) it was the 1-line End key
bug fix. These are all currently aligned, but they're conceptually distinct:
"offset accuracy" ≠ "scroll targeting strategy" ≠ "two-tier global index need."

**Recommendation:** No action now. These three properties are isomorphic today
(exact offset ↔ direct targeting ↔ known global index). If they ever diverge
(e.g. a seek path with exact offset but no position map), consider splitting
into explicit booleans.

**3. The module-level `let _scrollSeekTimer` in `useDataWindow.ts`.**

Module-level mutable state (timer ref) for scroll-triggered seek debounce.
This is the established pattern in the codebase (see `_visibleStart`,
`_visibleEnd`, `_viewportAnchorId` in the same file). No issue.

### Things that DON'T need restructuring

- **The `twoTier` prop threading** (DataWindow → useScrollEffects → components).
  Some might want to make this a context. Don't — the prop drilling is 3 levels
  deep and explicit. A context would hide when components re-render on mode change.

- **The `isScrollMode` pattern in Scrubber.** The tristate → boolean derivation
  (`buffer || indexed || twoTier`) is clear and correct. The `twoTier` prop makes
  the scrubber immediately scrollable even before the position map loads — correct
  design.

- **The cross-tier test matrix.** Some might worry about the 3-webserver approach.
  Don't — it's the only way to test tier boundaries without modifying the app.
  The env-var-controlled thresholds are clean.

---

## 4. Performance Assessment

| Metric | Before | After | Notes |
|--------|--------|-------|-------|
| Initial render | Unchanged | Unchanged | Position map fetch is background; no blocking |
| Seek (1k-65k, position map) | ~850ms (TEST, sequential) | ~450ms (TEST, parallel) | ~350ms savings from `Promise.all` + timing tuning (SEEK_COOLDOWN_MS 700→100ms) |
| Seek (>65k, no map) | ~600ms | ~600ms | Unchanged — same path |
| Memory at 10k (local) | ~5-10MB buffer | +~3MB position map | Acceptable |
| Memory at 65k (TEST) | ~5-10MB buffer | +~18MB position map | Measured in Phase 0, acceptable |
| Scroll in two-tier | N/A (new) | 0ms for in-buffer, ~200-450ms for scroll-seek | Scroll-triggered seek with 200ms debounce |
| Extend (prepend compensation) | Works | Gated off in two-tier | Correct — no compensation needed |
| Seek-to-first-extend | 800ms | 150ms | SEEK_COOLDOWN_MS 700→100ms, deferred scroll 800→150ms |

**No performance regressions identified.** The parallel fetch + timing tuning are
perf-improving changes. The position map's memory cost (~18MB at 65k) is one-time
and bounded by `POSITION_MAP_THRESHOLD`.

---

## 5. Verdict

This is clean work, refined through significant bug-fix iteration. The number of
bug fixes on 13-14 April (skeleton deadlock, permanent skeletons, End key,
density-switch position loss, Home button sort reset, scrubber thumb frozen,
position map null-zone failure) reflects the complexity of the feature, not code
quality problems — each had a distinct root cause.

**No restructuring needed.** The feature is self-contained and well-gated.
No outstanding action items.

**The production code implements a feature that fundamentally changes how the
scrubber works for 1k-65k results — from a seek control (teleport on release)
to a real scrollbar (instant drag). The bug-fix iteration was extensive but
each fix addressed a real, distinct issue.**
