# Two-Tier Virtualisation — Multi-Session Workplan

> **Created:** 2026-04-13, revised 2026-04-13
> **Status:** Sessions 1-3 complete. Implementation done, pending E2E validation on local ES.
> **Prerequisite:** Phases 0-4a of `scroll-real-scrolling-through-24-workplan.md` (complete).
> **Goal:** Make the scrubber behave like a real scrollbar (drag = direct scroll)
> for 1k-65k results, just as it does for ≤1k today.

---

## What This Is (and Isn't)

**This is NOT about wheel/trackpad scrolling.** Wheel/trackpad already work for
all result sizes — the buffer extends at edges and seeks when needed. A user can
scroll through 1.3M results today with the mouse wheel.

**This IS about the scrubber.** For ≤1000 results, the scrubber drag directly
scrolls the content container — it IS a scrollbar. For >1000 results, the
scrubber is a seek control: drag previews a position, pointer-up teleports the
buffer there. The teleport takes ~850ms on TEST, ~300ms on PROD. The goal is to
eliminate the teleport for 1k-65k results by making the scrubber behave like a
scrollbar again.

**The mechanism:** Set `virtualizerCount = total` (instead of `results.length`)
when the position map is loaded. This gives the scroll container full physical
height. The scrubber's `scrollContentTo(ratio)` can then set `scrollTop` on a
container that spans all items. Cells outside the buffer show skeletons; the
buffer slides to fill them via normal extends and (when needed) scroll-triggered
seeks.

---

## What Must Not Break

Every feature that works today must continue to work identically. This section
catalogues each one, explains how the index shift affects it, and prescribes
the fix.

### Feature inventory

| Feature | How it works today | Two-tier impact | Fix needed? |
|---------|-------------------|-----------------|-------------|
| **Sort-around-focus** | Sort change → `_findAndFocusImage` finds focused image in new order → `sortAroundFocusGeneration` increments → useScrollEffects #9 scrolls to it | `findImageIndex` returns global (not local) in two-tier → `localIndexToPixelTop` receives global index → pixel math still correct (global row × rowHeight = correct pixel). | **Verify only** — pixel math is the same whether index is "local in a 1000-item list" or "global in a 24k-item list". The virtualizer's coordinate space matches. |
| **Phantom focus (viewport anchor)** | When no explicit focus, `_viewportAnchorId` tracks the image nearest viewport centre. Used as fallback for density-focus and sort-around-focus. | `reportVisibleRange` gets global indices → midpoint is global (e.g. 8010). Clamping to `results.length - 1` gives wrong item. Must convert to buffer-local: `midPoint - bufferOffset`, clamp to `[0, results.length - 1]`. If outside buffer (viewport showing skeletons), skip — no anchor available. | **Yes** — viewport anchor lookup must subtract `bufferOffset` in two-tier mode. Part of S1.1. |
| **Filters** | Filter change → URL → `useUrlSearchSync` → `search()` → invalidates position map → `twoTier` becomes false → everything reverts to buffer-local. | Filter change fires a fresh `search()` which sets `positionMap: null`. The scrubber immediately reverts to seek mode until the new position map loads. No two-tier code runs during the transition. | **No fix** — invalidation already handles this. |
| **Keyboard navigation (focused)** | Arrow keys → `useListNavigation` → `findImageIndex(currentId)` → delta → `getImage(nextIdx)` → `virtualizer.scrollToIndex()`. | `findImageIndex` returns global index in two-tier. `getImage(global)` returns image or skeleton. `virtualizer.scrollToIndex(row)` uses global row. All consistent. | **Verify only** — but must test arrow keys near buffer boundaries (where `getImage` returns undefined for adjacent cells → skip-placeholder logic in moveFocus). |
| **Keyboard navigation (unfocused)** | ArrowUp/Down → `scrollByRows`. PgUp/Down → `scrollByPage`. Both manipulate `el.scrollTop` directly and dispatch scroll event. `scrollByPage` calls `loadMore()` when `count - lastVisibleIdx <= 5 && resultsLength < total`. | In two-tier, `count = total` (e.g. 12k), `resultsLength = 1000`, so `resultsLength < total` is always true → `loadMore()` fires on every PgDown. Wasted ES calls. Same issue for `moveFocus`'s loadMore guard. | **Yes** — guard `loadMore` calls in `scrollByPage`, `moveFocus`, and `pageFocus` with buffer-coverage check. |
| **Home key** | `useListNavigation` capture handler: if `bufferOffset > 0`, calls `seek(0)`. Otherwise `scrollTop = 0`. | Home calls `seek(0)`, NOT `search()`. `seek()` does not invalidate the position map — `twoTier` stays true (correct: the position map is still valid). When buffer is at [0..999], `bufferOffset === 0` → else branch → `scrollTop = 0` → works (row 0 = global position 0 in two-tier). When buffer is deep, `seek(0)` repositions buffer → effect #8 fires. | **No fix** — both branches work correctly in two-tier. `getImage(0)` with buffer at [0..] returns `results[0]`. |
| **Home button / logo click** | `resetToHome()` → `search()` → `positionMap: null` → bufferOffset goes to 0 → useScrollEffects #8 resets scroll to 0. | `search()` invalidates position map → `twoTier` becomes false before anything renders. The bufferOffset→0 guard fires in non-two-tier mode. | **No fix** — but verify the guard doesn't also fire when the buffer slides to offset 0 during normal two-tier scrolling. Gate with `!twoTier`. |
| **New images count** | `NEW_IMAGES_POLL_INTERVAL` → `count()` call → updates `newImageCount` in store → badge in UI. | Poll calls `count()`, not `search()`. Doesn't touch buffer, position map, or scrubber. | **No fix** — completely orthogonal. |
| **New images refresh** | User clicks "N new images" → `search()` fires → position map invalidated → fresh results. | Same as filter change — `search()` invalidates everything. | **No fix.** |
| **Density switch (grid ↔ table)** | Unmount saves `globalIndex + ratio` → mount restores by computing `localIdx = globalIndex - bufferOffset` → `scrollToOffset`. | In two-tier: `localIdx` must be the global index itself (virtualizer uses global). Fix: `const idxNow = twoTier ? saved.globalIndex : saved.globalIndex - boNow`. | **Yes** — density-focus restore needs two-tier gate. |
| **Image detail overlay** | Double-click → `storeImageOffset(id, bufferOffset + idx, ...)` → detail overlay mounts → search stays mounted underneath. Return → `useReturnFromDetail` → `findImageIndex` → `scrollToIndex`. | In two-tier: `idx` from `findImageIndex` is global, so `storeImageOffset(id, idx, ...)` (no `+ bufferOffset`). `scrollToIndex` with global row → correct. | **Yes** — `storeImageOffset` callers need two-tier gate (3 call sites). |
| **Fullscreen preview** | `f` key → FullscreenPreview → traverse images → exit → `scrollToFocused()`. | Uses `findImageIndex` → global → `scrollToIndex(row)` → correct. | **Verify only.** |
| **Scrubber tooltip (sort labels)** | `getSortLabel(globalPosition)` → `interpolateNullZoneSortLabel()` which uses: (1) sort distribution binary search (accurate for all positions), OR (2) buffer-edge interpolation (fallback when no distribution). | Two code paths. **Distribution path:** receives `globalPosition`, uses `lookupSortDistribution()` — purely position→value binary search, no buffer access. Works identically in two-tier. **Buffer fallback path:** `estimateDateAtPosition()` does `localIdx = globalPosition - bufferOffset` then `results[localIdx]` — this already uses `bufferOffset` correctly, no change. Keyword fallback also uses `bufferOffset`. | **No fix** — both paths already speak global positions and handle `bufferOffset` correctly. |
| **Scrubber ticks** | `computeTrackTicksWithNullZone()` computes date/keyword boundary positions. **Distribution mode** (sort distribution loaded): iterates histogram buckets, each with a `startPosition` (global). Positions placed directly as tick positions. **Buffer fallback** (no distribution, `allDataInBuffer`): `estimateDateAtPosition()` interpolates from buffer edges using `bufferOffset`. | **Distribution mode** (the primary path for >1k results): tick positions are global positions from the distribution — completely independent of the buffer. Works identically. **Buffer fallback:** only used when `allDataInBuffer` (≤1k, buffer mode) — never runs in two-tier mode because twoTier requires total > 1k. | **No fix** — distribution mode uses global positions from histogram buckets; buffer fallback only runs when `allDataInBuffer` (≤1k). |
| **Scrubber tick cache key** | `search.tsx` line 121: `allDataInBuffer = total <= bufferLength`. When true, cache key starts with `buffer:`. When false, uses distribution-based key. | In two-tier, `total > bufferLength` so `allDataInBuffer = false` → distribution path used. The buffer fallback path never activates. No issue. BUT: note that `allDataInBuffer` is a separate boolean from `twoTier` — it checks raw total vs buffer length, not position map. This is correct: ticks should use distribution mode whenever total > buffer, regardless of position map status. | **No fix.** |
| **Prepend/evict scroll compensation** | `useScrollEffects` #4/#5: adjusts `scrollTop` when buffer items are prepended or evicted. | In two-tier: `virtualizerCount` is constant. Items are replaced at fixed positions, not inserted/removed. Compensation must NOT fire. | **Yes** — guard with `twoTier`. |
| **loadMore fallback in handleScroll** | `useScrollEffects` #3: when `scrollBottom < 500 && resultsLength < total`, fires `loadMore()`. | In two-tier, `resultsLength < total` is always true (buffer is 1000, total is 12k). When the user scrolls to the genuine end of all results, `scrollBottom < 500` triggers and `loadMore` fires repeatedly — wasted ES calls, because the buffer already covers the tail via seek. | **Yes** — guard with `bufferOffset + resultsLength >= total`. |
| **Seek (>65k, no position map)** | `positionMap === null` → `twoTier = false` → all indices buffer-local → scrubber in seek mode. | Completely unchanged. The `twoTier` boolean is false. | **No fix** — zero regression by design. |
| **CQL search input** | Query change → URL → `search()` → position map invalidated. | Same as filters. | **No fix.** |
| **URL sync / browser back** | URL is source of truth → `useUrlSearchSync` → `search()` → invalidation. | Same as filters. | **No fix.** |
| **Mode transition during drag** | When position map finishes loading while the user is mid-drag on the scrubber. | `scrubberMode` is derived from props → changes on re-render. But during drag, `isDragging` prevents the re-render from affecting thumb position — the drag handler owns the thumb via direct DOM writes. Mode switch takes effect on the NEXT interaction after drag ends. | **No fix** — harmless by design. |

### Summary of required changes

Only these things actually need code changes:

1. **`useDataWindow.ts`** — `virtualizerCount`, `getImage()`, `reportVisibleRange()` (extend triggers + scroll-triggered seek + viewport anchor), `findImageIndex()`, add `twoTier` to DataWindow interface
2. **`useScrollEffects.ts`** — gate prepend/evict compensation, gate bufferOffset→0 guard, adjust density-focus restore, gate `loadMore` fallback in handleScroll, branch effect #6 seek scroll-to-target on `twoTier`
3. **`useListNavigation.ts`** — guard `loadMore` calls in `scrollByPage`, `moveFocus`, and `pageFocus`
4. **`search.tsx`** — `currentPosition` computation
5. **`Scrubber.tsx`** — `isBufferMode` → `isScrollMode` (buffer OR indexed)
6. **`ImageGrid.tsx`, `ImageTable.tsx`, `ImageDetail.tsx`** — `storeImageOffset` callers
7. **`search-store.ts`** — `_seekTargetGlobalIndex`, parallel fetch

Everything else (filters, Home button, new images, CQL, URL sync, sort-around-focus core logic, tooltips, ticks) is untouched.

---

## The Central Invariant: `twoTier`

```ts
const twoTier = positionMap !== null;
```

When `false`: every code path is identical to today. Zero regression.

When `true`: indices become global, scroll container is full-height, scrubber
drags directly. The ONLY way `twoTier` becomes true is when the position map
finishes loading after a search with 1000 < total ≤ 65000.

**`search()` invalidates; `seek()` preserves.** Any `search()` call (filter,
sort, query, refresh, Home button/logo) immediately sets `positionMap: null` →
`twoTier` snaps to false → all code reverts to today's behaviour for the
duration of the search. If the new result set qualifies (1k < total ≤ 65k),
the position map loads in the background and `twoTier` becomes true again.

`seek()` does NOT invalidate the position map — this is correct. The position
map's data is still valid after seek (same PIT, same sort order). Features
like Home key (`seek(0)`) and scroll-triggered seek work with `twoTier` still
true.

---

## Index Semantics

| Concept | `twoTier = false` (today) | `twoTier = true` (new) |
|---------|--------------------------|------------------------|
| `virtualizerCount` | `results.length` (buffer-local) | `total` (global) |
| `virtualRow.index` | buffer-local 0..N | global 0..total |
| `getImage(idx)` | `results[idx]` | `results[idx - bufferOffset]` (or undefined) |
| `findImageIndex(id)` | buffer-local or -1 | **global** or -1 |
| `reportVisibleRange(s,e)` | buffer-local indices | global indices |
| `Scrubber currentPosition` | `bufferOffset + visibleRange.start` | `visibleRange.start` |
| Extend trigger: backward | `startIndex <= THRESHOLD` | `globalStart < bufferOffset + THRESHOLD` |
| Extend trigger: forward | `endIndex >= len - THRESHOLD` | `globalEnd > bufferOffset + len - THRESHOLD` |
| Viewport anchor | `results[midPoint]` | `results[midPoint - bufferOffset]` (skip if outside buffer) |
| Seek scroll-to-target | `localIndexToPixelTop(localIdx)` | `localIndexToPixelTop(globalIdx)` (virtualizer row 0 = global 0) |

---

## Session 1 — Index Mapping + Scrubber Mode Switch (~3-4 hours)

**Delivers:** `virtualizerCount = total` when position map loaded. All index
mappings adjusted. Scrubber drag = direct scroll in indexed mode. Tests pass.
Scroll-triggered seek NOT yet wired — scrubber-dragging past the buffer shows
skeletons that don't fill. (They fill after Session 2.)

### Files to modify

| File | What changes |
|------|-------------|
| `useDataWindow.ts` | `twoTier`, `virtualizerCount`, `getImage`, `reportVisibleRange`, `findImageIndex`, viewport anchor, `DataWindow` interface |
| `search.tsx` | `currentPosition` |
| `Scrubber.tsx` | `isBufferMode` → `isScrollMode` (buffer OR indexed) |
| `ImageGrid.tsx` | `storeImageOffset`, `results[idx]` → `getImage(idx)` |
| `ImageTable.tsx` | `storeImageOffset`, `results[idx]` → `getImage(idx)` |
| `ImageDetail.tsx` | `storeImageOffset` |
| `useListNavigation.ts` | Guard `loadMore` in `scrollByPage`, `moveFocus`, `pageFocus` |

### Steps

**S1.1 — `useDataWindow.ts` core changes** (~1.5 hours)

Add `twoTier` boolean (derived from `useSearchStore((s) => s.positionMap !== null)`).
Switch `virtualizerCount` to `twoTier ? total : results.length`. Remap:

- **`getImage(idx)`:** `twoTier ? results[idx - bufferOffset] : results[idx]`.
  Return `undefined` if `idx < bufferOffset` or `idx >= bufferOffset + results.length`
  (i.e. outside the buffer window — the view renders a skeleton).

- **`findImageIndex(id)`:** return the global position from `imagePositions.get(id)`
  directly when `twoTier` (no `- bufferOffset` subtraction, no `localIdx < 0` check).
  Still return -1 if the image isn't in `imagePositions`. When `!twoTier`, unchanged.

- **`reportVisibleRange` extend triggers:** In two-tier, indices are global.
  Extend backward when `globalStart < bufferOffset + EXTEND_THRESHOLD && bufferOffset > 0`.
  Extend forward when `globalEnd > bufferOffset + len - EXTEND_THRESHOLD && bufferOffset + len < total`.
  When `!twoTier`, unchanged.

- **Viewport anchor:** Convert global midpoint to buffer-local before indexing
  into `results[]`:
  ```ts
  const localMid = twoTier ? Math.round(midPoint) - bufferOffsetRef.current : Math.round(midPoint);
  if (localMid < 0 || localMid >= currentResults.length) return; // viewport showing skeletons — no anchor
  const anchorImage = currentResults[Math.min(Math.max(0, localMid), currentResults.length - 1)];
  ```

Add `twoTier` to `DataWindow` return type so consumers can use it.

**S1.2 — `search.tsx` currentPosition** (~10 min)

```ts
const currentPosition = positionMapLoaded
  ? visibleRange.start           // already global
  : bufferOffset + visibleRange.start;
```

**S1.3 — `Scrubber.tsx` mode switch** (~30 min)

```ts
const isScrollMode = scrubberMode === 'buffer' || scrubberMode === 'indexed';
```

Replace all 13 `isBufferMode` references that control drag-scrolls-container vs
seek-on-pointer-up. In indexed mode: drag sets `scrollTop` directly (like buffer
mode), track click scrolls directly, scroll-sync listener attaches.

The tooltip suppression check (`isBufferMode && thumbHeight >= trackHeight * 0.8`)
becomes `isScrollMode && ...`. At total=1200+ the thumb is tiny (~2.5% of track),
so suppression never fires — correct.

**S1.4 — `storeImageOffset` callers** (~20 min)

Three call sites: ImageGrid, ImageTable, ImageDetail. Currently
`bufferOffset + idx` where `idx` = buffer-local. In two-tier, `idx` from
`findImageIndex` is already global. Fix each:

```ts
const globalOffset = twoTier ? idx : bufferOffset + idx;
storeImageOffset(imageId, globalOffset, searchKey, cursor);
```

Also change `results[idx]` → `getImage(idx)` for sort value extraction.

**S1.5 — Guard `loadMore` in `useListNavigation`** (~15 min)

Three `loadMore` call sites in `useListNavigation` (`scrollByPage`,
`moveFocus`, `pageFocus`) check `resultsLength < total`. In two-tier this is
always true (buffer is 1000, total is 12k), causing wasted ES calls. Guard
with a buffer-coverage check: `bufferOffset + resultsLength < total` (more
precise than `resultsLength < total`, and doesn't need `twoTier` as a new
config field).

**S1.6 — Unit tests** (~45 min)

- `getImage()`: global index in range, out of range, at buffer boundaries,
  negative `idx - bufferOffset`
- `findImageIndex()`: returns global when twoTier, buffer-local when not
- `reportVisibleRange()`: extend triggers fire at correct buffer-relative
  boundaries; do NOT fire when viewport is entirely outside the buffer
- Viewport anchor: correct buffer-local lookup, skip when outside buffer
- Run full `npm test`

### Success criteria
- All 242+ existing tests pass
- New unit tests for two-tier index mapping
- Scrubber drag in indexed mode scrolls the container
- `VITE_POSITION_MAP_THRESHOLD=0` → no change from today

---

## Session 2 — Scroll-Triggered Seek + Compensation + Feature Verification (~3-4 hours)

**Delivers:** Scrubber drag past buffer → skeletons → seek → fill. Compensation
gated. All features from inventory verified.

### Files to modify

| File | What changes |
|------|-------------|
| `useDataWindow.ts` | Scroll-triggered seek with debounce |
| `useScrollEffects.ts` | Gate compensation, bufferOffset→0 guard, density-focus restore, loadMore fallback, seek scroll-to-target branching |
| `search-store.ts` | `_seekTargetGlobalIndex`, parallel fetch |

### Steps

**S2.1 — Scroll-triggered seek** (~1 hour)

In `reportVisibleRange()`, when `twoTier` and viewport is entirely outside the
buffer (i.e. `globalEnd <= bufferOffset || globalStart >= bufferOffset + len`),
fire a debounced `seek(globalStart)`. Module-level `setTimeout`, 200ms.

**Critical:** When viewport is outside the buffer, **skip extend triggers
entirely**. Extends work in PAGE_SIZE (200) increments from the buffer edges —
they can't bridge a gap of thousands of positions. Only the seek can
reposition the buffer. The extend triggers should only fire when the viewport
overlaps or is near the buffer.

Structure of `reportVisibleRange` in two-tier:

```
if twoTier:
  if viewport entirely outside buffer:
    debounced seek(globalStart)  — repositions buffer
    return                       — skip extends (useless at this distance)
  else:
    fire extends if near buffer edges (using buffer-relative thresholds)
else:
  existing logic (buffer-local indices, unchanged)
```

The existing extend cooldown (`SEEK_COOLDOWN_MS`, `frozenUntil`) naturally
prevents seek storms — the store blocks extends while a seek is in flight,
and the debounce coalesces rapid scroll events.

**S2.2 — Gate prepend/evict compensation** (~30 min)

useScrollEffects sections 4 and 5: early-return when `twoTier`. In two-tier,
`virtualizerCount` is constant (`total`). Items are replaced at fixed
positions, not inserted/removed. No scroll compensation needed.

**S2.3 — Gate bufferOffset→0 guard** (~15 min)

useScrollEffects section 8: only fire when `!twoTier`. In two-tier, the buffer
sliding to offset 0 during normal scrolling is not a "go home" event — it's
just the buffer covering the top of the result set.

**S2.4 — Gate `loadMore` fallback in `handleScroll`** (~10 min)

useScrollEffects section 3 has a fallback `loadMore` check:
```ts
if (scrollBottom < 500 && resultsLength < total) loadMore();
```

In two-tier, `resultsLength < total` is always true, so this fires at the
bottom of every scroll — wasted ES calls. Guard with:
```ts
if (scrollBottom < 500 && bufferOffset + resultsLength < total) loadMore();
```

**S2.5 — Density-focus restore** (~30 min)

useScrollEffects section 10 mount: `twoTier ? saved.globalIndex : saved.globalIndex - boNow`.

**S2.6 — Seek scroll-to-target for two-tier** (~45 min)

**Today:** `seek()` stores `_seekTargetLocalIndex` (buffer-local, 0..bufferLength).
Effect #6 in `useScrollEffects` uses `localIndexToPixelTop(targetIdx, geo)` to
compute the pixel offset, then sets `el.scrollTop`.

**Problem in two-tier:** The virtualizer's coordinate space is global (row 0 =
global position 0). After a position-map seek to position 8000 with buffer at
[7900..8099], `_seekTargetLocalIndex = 100` (buffer-local). But
`localIndexToPixelTop(100)` computes a pixel offset ~3000px from the top — the
virtualizer expects `localIndexToPixelTop(8000)` ≈ 2.4M px.

**Fix:** Add `_seekTargetGlobalIndex: number` to the store (default -1).
In `seek()`, when `exactOffset && positionMap !== null`, set
`_seekTargetGlobalIndex = clampedOffset` alongside `_seekTargetLocalIndex`.

In effect #6, branch on `twoTier`:
```ts
const targetIdx = twoTier && seekTargetGlobalIndex >= 0
  ? seekTargetGlobalIndex          // virtualizer row 0 = global 0
  : seekTargetLocalIndex >= 0
    ? seekTargetLocalIndex          // buffer-local, as today
    : 0;
const targetPixelTop = localIndexToPixelTop(targetIdx, geo);
```

Clear `_seekTargetGlobalIndex = -1` alongside `_seekTargetLocalIndex` resets.

**S2.7 — Parallel forward+backward fetch** (~30 min)

In the position-map branch of `seek()`, both cursors are known upfront from
the map. Replace the sequential flow with `Promise.all`:

```
Forward cursor:  cursorForPosition(posMap, clampedOffset)
Backward cursor: posMap.sortValues[clampedOffset]  (the entry AT the target, with reverse: true)
```

**Details:**

- **Skip conditions:** If `clampedOffset < halfBuffer` (near the start), skip
  the backward fetch (`skipBackwardFetch = true`) — same as the sequential
  path. If `clampedOffset + PAGE_SIZE >= total` (near the end), the End-key
  fast path already handles this upstream.

- **Null-zone cursors:** Both directions need `detectNullZoneCursor` handling.
  If the forward cursor is in the null zone, the forward fetch needs
  `sortOverride + extraFilter + cursor stripping`. Same for the backward
  cursor independently. Each direction may or may not be in the null zone.

- **Combining results:** Backward hits go at the front of the buffer, forward
  hits at the back. Same assembly logic as the sequential path — backward
  results are reversed (they come in reverse order), then concatenated with
  forward results.

- **Savings:** Sequential ~750ms (450 forward + 300 backward) → parallel
  ~450ms (max of the two). Only activates when `positionMap !== null`;
  sequential fallback unchanged.

**S2.8 — Feature verification** (~1 hour)

Manually test every feature from the inventory table. Run full `npm test`.

### Success criteria
- Scrubber drag past buffer → skeletons → fill
- No scroll jumps when buffer slides
- Sort-around-focus, density switch, Home, keyboard, filters all work
- No wasted ES calls at scroll boundaries
- All existing tests pass

---

## Session 3 — E2E Tests + Documentation (~2-3 hours)

**Delivers:** E2E coverage, documentation, ready for commit.

### Steps

**S3.1 — E2E tests** (~1.5 hours)

Set `VITE_POSITION_MAP_THRESHOLD=5000` for local tests. 8 scenarios:

1. Scrubber drag in indexed mode → direct scroll
2. Scrubber drag past buffer → skeletons → fill
3. Sort change → scrubber reverts to seek → map reloads
4. Home button → reset
5. Home key at deep position → seek(0) → scroll to top
6. Density switch at deep position
7. Keyboard nav in two-tier (focused + unfocused)
8. Seek mode regression: `VITE_POSITION_MAP_THRESHOLD=0`

**S3.2 — Documentation** (~30 min)

AGENTS.md, changelog.md, component-detail.md updates.

---

## What NOT to Do

1. **Don't change BUFFER_CAPACITY.** Buffer stays at 1000.
2. **Don't change wheel/trackpad scrolling.** It already works for all sizes.
3. **Don't implement live drag-seek.** Scrubber drag sets `scrollTop` directly.
4. **Don't touch seek mode.** When `positionMap === null`, everything unchanged.
5. **Don't duplicate seek logic.** All seeks go through the same `seek()`.

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Sort-around-focus breaks in two-tier | High | `findImageIndex` returns global; pixel math is identical. Test manually + E2E. |
| storeImageOffset double-adds bufferOffset | High | Explicit `twoTier` gate at all 3 call sites. Unit test. |
| Prepend compensation fires in two-tier → swimming | High | Guard with `twoTier`. |
| Seek scroll-to-target uses wrong index space | High | `_seekTargetGlobalIndex` with explicit branching in effect #6. |
| bufferOffset→0 guard fires during normal two-tier scrolling | Medium | Guard with `!twoTier`. |
| Extend triggers fire when viewport is outside buffer | Medium | Skip extends entirely when viewport outside buffer; only seek. |
| Wasted loadMore/extend calls (`resultsLength < total` always true) | Medium | Guard in handleScroll, scrollByPage, moveFocus. |
| Keyboard nav hits skeleton near buffer edge | Medium | `moveFocus` already skips up to 10 placeholders. |
| TanStack Virtual re-measures on content change → drift | Low | Skeleton dimensions verified identical. |

---

## Estimated Effort

| Session | Hours | Risk | Delivers |
|---------|-------|------|----------|
| 1 — Index mapping + scrubber switch | 3-4 | Medium | Core two-tier, scrubber direct-scroll |  ✅ Complete |
| 2 — Seek + compensation + verification | 3-4 | High | Skeleton→fill, all features verified | ✅ Complete |
| 3 — E2E + docs | 2-3 | Low | Full test coverage, documentation | ✅ Complete |
| **Total** | **8-11** | | |

