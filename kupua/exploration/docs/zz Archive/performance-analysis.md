# Kupua Performance Analysis

> **March 2026.** Combined analysis covering every performance-relevant code path:
> render pipeline, scroll, state management, network/data, layout/paint, keyboard
> navigation, memory, CSS, accessibility. Includes future-facing analysis for scrubber,
> infinite scroll at 9M scale, density slider, filmstrip, and "Never Lost".
>
> **Update (late March 2026):** The two main structural risks identified below —
> unbounded memory growth (#3) and `from/size` pagination ceiling (#4) — are now
> resolved by the windowed scroll + scrubber work. Sort-around-focus (#5) is also
> implemented. Issues #3, #4, #5, #11, #13, #14 are all ✅ Fixed.
>
> **Lighthouse audit (28 March 2026):** Performance score 61 (dev mode), dragged
> down entirely by LCP/FCP from unminified dev bundles. TBT = 8ms (perfect), CLS = 0
> (perfect), DOM = 462 elements. Main-thread total = 645ms. A production build would
> score 85-95. Three a11y fixes identified (#29 contrast, #30 `<main>` landmark,
> #32 label mismatch). See §Lighthouse Audit below.

---

## Overall Assessment

The architecture is genuinely excellent. CSS-variable column widths, memo'd table body
during resize, overlay-not-route, O(1) image lookup, windowed buffer with eviction,
result set freezing, search_after + PIT pagination, configRef-pattern keyboard listeners,
density-focus bridge — all strong choices. Most apps of this complexity would have
5–10 performance problems by now; significantly fewer exist here.

~~The two main structural risks are both already on the roadmap: **unbounded memory
growth** (no page eviction) and **`from/size` pagination ceiling** (blocks scrubber
and "Never Lost" on sort). Everything else is polish-level.~~

**Update:** Both structural risks are resolved. The remaining open items are all
polish-level: histogram-based non-linear scrubber mapping (#15), density slider mount
cost (#12), and image object compaction (#20).

---

## Master Issue Table

### Key

| Symbol | Meaning |
|--------|---------|
| ✅ | Fixed |
| 🔧 | **Fix now** — easy win, improves current UX |
| 📋 | **Fix later** — blocked by future work, or low severity now |
| 🧊 | **Watch** — no action needed today, revisit when context changes |

### Issues sorted by severity

| # | Sev | Issue | Subsystem | Effort | When | Status |
|---|-----|-------|-----------|--------|------|--------|
| 1 | 🔴 | `imagePositions` Map full rebuild per range load | State | Med | — | ✅ Fixed |
| 2 | 🔴 | Sort-while-scrolled infinite pulsing loop | Logic | Low | — | ✅ Fixed |
| 3 | 🔴 | Unbounded `results` growth — no page eviction | Memory | High | — | ✅ Fixed — windowed buffer (BUFFER_CAPACITY=1000) |
| 4 | 🔴 | `from/size` unusable beyond 100k — blocks scrubber | Arch | High | — | ✅ Fixed — `search_after` + PIT + scrubber |
| 5 | 🔴 | "Never Lost" sort-around-focus blocked by `from/size` cap | Arch | High | — | ✅ Fixed — `_findAndFocusImage` + `countBefore` |
| 6 | 🟡 | `visibleImages` useMemo triggers unnecessary re-renders | Render | Low | — | ✅ Fixed |
| 7 | 🟡 | `handleScroll` recreated on `results.length` change | Scroll | Low | — | ✅ Fixed |
| 8 | 🟡 | `goToPrev`/`goToNext` listener churn in ImageDetail | Render | Low | — | ✅ Fixed |
| 9 | 🟡 | Orphaned `loadRange` requests survive new search | Network | Med | — | ✅ Fixed |
| 10 | 🟡 | `computeFitWidth` iterates all loaded results | Render | Low | — | ✅ Fixed |
| 11 | 🟡 | `results` array spreading copies entire array per `loadRange` | State | — | — | ✅ Solved by #3 — buffer capped at 1000 |
| 12 | 🟡 | Density switch mounts/unmounts entire view tree | Render | — | 📋 | Acceptable now; risk for density slider |
| 13 | 🟡 | Gap detection 80ms debounce delays scrubber seeks | Scroll | Low | — | ✅ Fixed — scrubber click/drag seeks directly; `reportVisibleRange` triggers extends |
| 14 | 🟡 | `search_after` needs `_id` tiebreaker for determinism | Arch | Trivial | — | ✅ Fixed — `buildSortClause` appends `{ id: "asc" }` tiebreaker |
| 15 | 🟡 | Distribution-aware scrubber needs histogram agg data | Arch | Med | 📋 | Future — scrubber polish |
| 16 | 🟡 | `frozenUntil` timestamp becomes stale in long sessions | State | — | 🧊 | Matches kahuna; revisit for UX |
| 17 | 🟡 | `transition-shadow` on every grid cell — compositor layers | Paint | Trivial | 🧊 | Very low; revisit if jank observed |
| 18 | 🟡 | Scroll listeners active while view hidden by overlay | Scroll | Trivial | 🧊 | Wasted work, very rare |
| 19 | 🟡 | GridCell memo shallow-compares `image` object reference | Render | — | 🧊 | Very low; watch as cell complexity grows |
| 20 | 🟡 | Image objects not compact (~5-10KB each) | Memory | — | 📋 | Future — projection approach |
| 21 | 🟢 | Prefetch effect fires on distant data loads | Render | Trivial | 🧊 | Browser deduplicates; negligible |
| 22 | 🟢 | `imgproxyOpts` not reactive to resize/fullscreen | Correctness | Low | 🧊 | Not perf — resolution mismatch |
| 23 | 🟢 | `loadRange` state updates may not batch across chunks | State | Low | 🧊 | React 19 should batch; verify |
| 24 | 🟢 | `pageFocus` may land in sparse gap | Navigation | Trivial | 🧊 | Rare; scan neighbourhood like `moveFocus` |
| 25 | 🟢 | `aria-live` on result count may spam screen readers | A11y | Trivial | 🧊 | Debounce announcement |
| 26 | 🟢 | `pageFocus` grid view may miscalculate during resize | Navigation | — | 🧊 | Extremely unlikely |
| 27 | 🟡 | LCP blocked by lazy-loaded, undiscoverable image | Load | Low | 📋 | Lighthouse LCP = 5.3s; needs `fetchpriority` + eager first row |
| 28 | 🟡 | All grid/table images lack explicit `width`/`height` | Layout | Trivial | 📋 | CLS is 0 (fixed cells), but Lighthouse flags unsized `<img>` |
| 29 | 🟡 | `text-grid-text-dim` (#8a8a8a) fails WCAG AA on panel bg (#444) | A11y | Trivial | 🔧 | Contrast 2.82:1 — needs ≥4.5:1 for normal text |
| 30 | 🟡 | No `<main>` landmark — a11y navigation failure | A11y | Trivial | 🔧 | Easy fix: wrap content area in `<main>` |
| 31 | 🟡 | Forced reflow 30ms from Scrubber tooltip `setTimeout` path | Layout | — | 🧊 | React-DOM commit; only during tooltip show/hide |
| 32 | 🟡 | DateFilter `aria-label` doesn't include visible text | A11y | Trivial | 🔧 | `label-content-name-mismatch`: label should include button text |
| 33 | 🟢 | No `<meta name="description">` / no `robots.txt` | SEO | Trivial | 🧊 | Internal tool — SEO irrelevant |
| 34 | 🟢 | Thumbnail cache lifetime only 10 min (600s) | Network | — | 🧊 | Could extend; low impact on real-world UX |
| 35 | 🟢 | 7× 404 errors from Chrome extensions requesting `/assets/js/...` | Console | — | 🧊 | Not kupua's fault — extensions probing localhost |
| 36 | 🟢 | BF cache blocked by WebSocket (Vite HMR) | Load | — | 🧊 | Dev-only; production build won't have Vite HMR |

---

## Detailed Analysis

Each item references its `#` from the table above.

---

### #1 ✅ `imagePositions` Map full rebuild per range load

**Location:** `useDataWindow.ts` (old), now `search-store.ts`

Every `loadRange` response created a new `results` reference → the `imagePositions`
`useMemo` in `useDataWindow` iterated all loaded entries via `for...in`. At 50k
loaded images, this was O(50k) per range load. During fast scroll, multiple range
loads compound.

**Fixed.** Moved `imagePositions` into the search store as a first-class field
maintained incrementally: `search()` rebuilds from page 1 (fresh Map, O(page size));
`loadMore()` and `loadRange()` extend the existing Map (O(page size)). The helper
`buildPositions()` handles both cases.

**Measured:** At 500-3000 loaded entries, the old rebuild cost 0–7ms with spikes to
14–25ms. The incremental approach registers as 0ms. The fix prevents O(n) degradation
at depth — at 50k entries the old approach would cost 50–100ms per load while the new
stays flat.

---

### #2 ✅ Sort-while-scrolled infinite pulsing loop

**Location:** `ImageTable.tsx` scroll-reset effect + `search-store.ts` search()

Sorting while scrolled away from the top caused infinite placeholder pulsing. Root
cause: a `sortOnly` exception preserved scroll position but `search()` replaced
`results` with a fresh first page (~50 entries at offset 0) — creating a state
contradiction (viewport at row 3000, data at rows 0–49). Gap detection → loadRange →
re-render → gap detection, ad infinitum.

**Fixed.** Sort always scrolls to top. Horizontal scroll preserved on sort-only
changes so the user doesn't lose the column they clicked. Matches Gmail, Sheets,
Finder, Explorer.

**Sort-around-focus: attempted and reverted (~340 lines).** Used ES `_count` to find
the focused image's new position. Hit three walls:
1. `max_result_window` (100k) — most unfiltered sorts land beyond this.
2. Equal sort values — `_count` returns 0 for all images sharing the same value.
3. Complexity/diminishing-returns spiral.

**Conclusion:** Requires `search_after` + windowed scroll (see #4, #5).

---

### #3 ✅ Unbounded `results` growth — no page eviction

**Location:** `search-store.ts` — results array only grows

The `results` sparse array and `imagePositions` Map grow without bound:

| Loaded images | Image objects | `imagePositions` Map | Total |
|---|---|---|---|
| 1k | 5–10 MB | ~0.1 MB | ~10 MB |
| 10k | 50–100 MB | ~0.5 MB | ~100 MB |
| 50k | 250–500 MB | ~2–4 MB | ~500 MB |

At 500MB, V8 GC pauses reach 20–50ms — a full frame budget. Each `loadRange` also
copies the entire array via spread (see #11), compounding the per-operation cost.
Editorial users may keep the app open for hours during triage.

**Fixed.** Replaced the unbounded sparse array with a fixed-capacity windowed buffer
(`BUFFER_CAPACITY = 1000`). Buffer eviction in `extendForward` (evicts from start)
and `extendBackward` (evicts from end) keeps the buffer bounded. `evictPositions`
keeps `imagePositions` consistent during eviction. Memory is bounded at ~5-10MB
regardless of scroll depth.

---

### #4 ✅ `from/size` unusable beyond 100k — blocks scrubber

**Location:** `search-store.ts`, `es-adapter.ts`

ES `from/size` performance degrades linearly with offset and is capped at
`max_result_window` (100k on TEST/PROD). For a scrubber at 50% of 9M images
(position 4.5M), `from/size` is completely unusable.

**Fixed.** Replaced `from/size` with hybrid pagination:
- **`search_after`** for all sequential operations (extend forward/backward) — no depth limit.
- **`from/size`** for shallow seeks (offset < `DEEP_SEEK_THRESHOLD`, default 10k) — fast.
- **Percentile estimation + `search_after`** for deep seeks on numeric/date fields —
  TDigest `percentiles` agg estimates the sort value at the target position,
  `search_after` fetches from there, `countBefore` verifies exact offset.
- **Composite aggregation** for deep seeks on keyword fields (`findKeywordSortValue`) —
  walks unique values to find the value at the target position.
- ~~**Iterative `search_after`** for script sorts~~ — **Removed.** Dimensions script
  sort replaced with plain Width/Height field sorts using percentile estimation.

The scrubber represents `bufferOffset / total` (not `scrollTop / scrollHeight`),
decoupled from browser scroll limits. Virtualizer count = buffer size (~200-1000),
not total.

PIT (Point In Time) provides snapshot isolation on non-local ES. Skipped on local
docker ES (stable 10k dataset — not needed).

---

### #5 ✅ "Never Lost" sort-around-focus blocked by `from/size` cap

**Location:** `search-store.ts` — `_findAndFocusImage()`, `search()` with `sortAroundFocusId`

The frontend-philosophy's "Never Lost" principle requires finding the focused image's
new position after a sort change. Was blocked by the 100k `from/size` cap.

**Fixed.** `search()` accepts an optional `sortAroundFocusId`. The URL sync hook
(`useUrlSearchSync`) detects sort-only changes and passes `focusedImageId`. Algorithm:
1. Run new search immediately — show results at top (non-blocking).
2. Async `_findAndFocusImage()`: fetch image by ID → get sort values →
   `countBefore` → exact global offset → if outside buffer, seek using the image's
   own sort values as the `search_after` cursor (NOT percentile estimation — exact).
3. Focus the image + scroll to it. `sortAroundFocusGeneration` counter triggers
   scroll-to-focused in views.
4. 8-second timeout for graceful degradation. Status indicator in StatusBar.

**Performance:** The `countBefore` query is O(1) against ES (range + terms filter,
~10-50ms). Total sort-around-focus latency: 2-5 ES requests, <500ms typical.
Non-blocking — user sees fresh results immediately while the background work runs.

---

### #6 ✅ `visibleImages` useMemo triggers unnecessary re-renders

**Location:** `ImageTable.tsx:498-506`

```ts
const visibleImages = useMemo(() => { ... }, [virtualItems, results]);
```

Depends on `results`. Every `loadRange` creates a new array reference — even for
off-screen ranges — triggering recomputation → new `visibleImages` → `useReactTable`
gets new `data` → `getCoreRowModel()` rebuilds → full reconciliation check on
`TableBody`. The work per rebuild is small (~60 rows) but multiplied by every
off-screen range response (3–5 per debounce window).

**Fixed.** The useMemo now compares resolved image IDs (joined as a comma-separated
string) before/after. If the same IDs in the same order → returns the cached array
reference. Short-circuits all downstream reconciliation from off-screen loads.
Two refs (`prevVisibleImagesRef`, `prevVisibleKeyRef`) track the cache.

---

### #7 ✅ `handleScroll` recreated on `results.length` change

**Location:** `ImageTable.tsx:582-598`, `ImageGrid.tsx:272-287`

Both `handleScroll` callbacks included `results.length` in their dependency arrays.
Every data load changed `results.length` → callback recreated → `useEffect` removed
and re-added the scroll listener.

**Fixed.** `results.length` and `total` read from refs (`resultsLengthRef`, `totalRef`)
inside the callback. Dependency arrays reduced to stable values only:
`[virtualizer, reportVisibleRange, loadMore]` (table) and
`[virtualizer, reportVisibleRange, columns, loadMore]` (grid).

---

### #8 ✅ `goToPrev`/`goToNext` listener churn in ImageDetail

**Location:** `ImageDetail.tsx:110-116`

`goToPrev`/`goToNext` were recreated whenever `prevImage`/`nextImage` changed (which
happened on every `results` reference change). They were dependencies of the
`useEffect` that registers keyboard listeners.

**Fixed.** `prevImage`/`nextImage` stored in refs (`prevImageRef`, `nextImageRef`).
`goToPrev`/`goToNext` depend only on `goToImage` (stable). Keyboard `useEffect`
dependency array reduced to `[toggleFullscreen, closeDetail, goToPrev, goToNext]` —
all stable.

---

### #9 ✅ Orphaned `loadRange` requests survive new search

**Location:** `es-adapter.ts` — `searchRange` had no AbortController

When the user typed a new query, `search()` aborted its own request but in-flight
`loadRange` requests from the previous search continued. Their responses were
discarded by the store updater, but the network requests wasted bandwidth. During fast
typing: 3–5 concurrent ranges × 3–4 searches/second = 9–20 orphaned requests.

**Fixed.** Generation-based abort: module-level `_rangeAbortController` in
`search-store.ts`. `search()` aborts the current controller (killing all in-flight
ranges from the previous search) and creates a fresh one. `loadRange()` passes the
controller's signal via `searchRange(params, signal)`. AbortError handled gracefully
— just cleans up inflight tracking, not recorded as a failed range. Simpler than
per-range controllers and matches the mental model (all ranges from search N are stale
when search N+1 starts).

---

### #10 ✅ `computeFitWidth` scans only visible window

**Location:** `ImageTable.tsx:772-784`

"Resize all columns to fit data" ran `computeFitWidth` for every visible column.
Each call iterated all loaded images via `for...in` with `measureText`. At 10k loaded
images × 15 columns = 150k `measureText` calls.

**Fixed.** Scan capped to the virtualizer's visible window (~60 rows). Also better
UX — fits to what you can actually see, not distant off-screen data.

---

### #11 ✅ `results` array spreading copies entire array per `loadRange`

**Location:** `search-store.ts:289`

```ts
const newResults = [...state.results];
```

Every `loadRange` creates a full copy via spread. At 50k entries: ~1–3ms per copy.
With 3 concurrent responses per frame: 3–9ms of pure array copying. The spread is
necessary (Zustand requires immutable updates; React uses reference equality).

**Mitigated by #3** — page eviction bounds the array to ~1000 entries, making the
spread trivial regardless of scroll depth.

---

### #12 🟡📋 Density switch mounts/unmounts entire view tree

**Location:** `search.tsx:56`

```tsx
{isGrid ? <ImageGrid /> : <ImageTable />}
```

Switching density destroys and rebuilds all virtualizer state, TanStack Table state,
effects, and DOM. Currently ~5–10ms of JS + first paint — acceptable for a discrete
toggle.

**Risk:** The frontend-philosophy describes 8+ density stops with a slider. Rapid
slider drags or keyboard shortcut holds would stutter with mount/unmount on every
step.

**Future mitigation:** Render both views (one hidden via `opacity: 0`), or design a
single unified virtualizer that adapts its cell rendering to density without
unmounting. The `density-focus.ts` bridge already solves the state-transfer problem;
the open question is whether the mount cost matters at slider speeds.

---

### #13 ✅ Gap detection 80ms debounce delays scrubber seeks

**Location:** `useDataWindow.ts` — `reportVisibleRange`, `search-store.ts` — `seek()`

For continuous scroll, 80ms debounce was correct (fires every ~5th frame, overscan
hides the delay). For scrubber seeks (jumping thousands of rows), 80ms of latency
before any data request fires means 80ms + ES round-trip + render of blank
placeholders.

**Fixed.** The architecture changed fundamentally: the scrubber calls `seek()` directly
(no debounce — one seek per click/pointer-up). Buffer extension uses `reportVisibleRange`
which fires on every scroll event (via passive listener), checking proximity to buffer
edges and triggering `extendForward`/`extendBackward` immediately. The old debounced
gap detection system was removed entirely along with `loadRange`/sparse arrays.

---

### #14 ✅ `search_after` needs `_id` tiebreaker for determinism

**Location:** `es-adapter.ts:buildSortClause()`

`search_after` with duplicate sort values (e.g. thousands of `credit: "Getty Images"`)
produces ambiguous page boundaries. The fix: always append a unique tiebreaker as the
final sort clause. This gives every document a unique sort position.

**Fixed.** `buildSortClause()` now appends `{ id: "asc" }` as the last sort clause.
Uses the `id` keyword field (not `_id` which requires fielddata in ES 8.x). Since
`id` always equals `_id` in Grid's index, every document gets a unique sort position.
See deviations.md §18.

---

### #15 🟡📋 Distribution-aware scrubber needs histogram aggregation data

A linear scrubber (position = row / total) is unusable for bursty upload data (60k
images on a busy news day, 100 on a quiet weekend). The scrubber must use a non-linear
mapping built from ES `date_histogram` aggregation data.

**Performance concern:** Monthly buckets over 9M images: ~10–50ms. Finer granularity
(daily for recent, monthly for old) may require composite aggregation — slower. Cache
the result and refresh only on search change.

**When:** Scrubber polish phase. See migration-plan.md → "Scrollbar & Infinite Scroll
— Design Notes" for the full design.

---

### #16 🟡🧊 `frozenUntil` timestamp staleness in long sessions

**Location:** `search-store.ts:64`

`frozenUntil` is set once by `search()`. If a user scrolls for 30 minutes, all
pagination requests include `until: <30-minutes-ago>`. ES returns correct data but the
user never sees recently uploaded images without re-searching. The "N new" ticker shows
the count, but clicking it resets scroll position.

Matches kahuna's behaviour. Acceptable trade-off for result set consistency.

---

### #17 🟡🧊 `transition-shadow` on every grid cell — compositor layers

**Location:** `ImageGrid.tsx:117`

`transition-shadow` triggers compositor-layer promotion for every visible grid cell
(~40). During scroll, the compositor must composite all layers. Typically fast on
modern GPUs; may cause frame drops on integrated graphics.

**If jank observed:** Restrict the transition to only the focused cell, or remove it.

---

### #18 🟡🧊 Scroll listeners active while view hidden by overlay

**Location:** `ImageTable.tsx:599-604`, `ImageGrid.tsx:290-295`

When the image detail overlay is showing, the view is hidden via `opacity: 0;
pointer-events: none` but stays mounted with active scroll listeners. Programmatic
`scrollTop = 0` (logo click) triggers `handleScroll` → `reportVisibleRange` →
potentially gap detection on the hidden view.

**Fix (if desired):** Guard `handleScroll` with `if (searchParams.image) return`.

---

### #19 🟡🧊 GridCell memo shallow-compares `image` object reference

**Location:** `ImageGrid.tsx:96-128`

`GridCell` is `React.memo`, but `image` is an object. If `loadRange()` replaces a slot
with a fresh object for the same image (same data, new reference), the memo fails and
the cell re-renders. Currently trivial; watch as cell complexity grows (status icons,
hover overlays, selection checkboxes).

---

### #20 🟡📋 Image objects not compact (~5-10KB each)

Each Image object from ES includes nested metadata, rights, file metadata, exports,
usages. Even with `_source` excludes, each is ~5-10KB. At 50k loaded: 250–500MB of
structured objects V8 must trace during GC.

**Future mitigation:** Store only display-needed fields in `results` (ID +
description + credit + dates + dimensions + thumbnail URL → ~500 bytes each). Fetch
full documents on demand for metadata panel and editing. This "projection" approach
reduces memory ~10-20×.

---

### #21 🟢🧊 Prefetch effect fires on distant data loads

Prefetch `useEffect` depends on `results`. Off-screen `loadRange` results create new
references → effect re-fires with same nearby images → 5 redundant `Image()` objects.
Browser deduplicates from cache. Negligible.

**If desired:** Ref-track the last set of prefetched IDs; skip if unchanged.

---

### #22 🟢🧊 `imgproxyOpts` not reactive to resize/fullscreen

`useMemo(() => ({ width: window.innerWidth, height: window.innerHeight }), [])`

Captured once at mount. Fullscreen images may be requested at non-fullscreen
resolution. Not a performance issue — a resolution-correctness note.

---

### #23 🟢🧊 `loadRange` state updates may not batch across chunks

Multiple concurrent `loadRange` responses each call `set()` independently. React 19's
automatic batching should handle async callbacks, but worth verifying empirically. If
not batching: `queueMicrotask` coalescing or collecting results before a single
`set()`.

---

### #24 🟢🧊 `pageFocus` may land in sparse gap

**Location:** `useListNavigation.ts:195-228`

If the computed target index falls in a sparse gap, no focus is set. The user presses
PageDown, the viewport scrolls, but nothing is highlighted.

**Fix (if desired):** Scan a small neighbourhood (like `moveFocus` with MAX_SKIP=10)
to find the nearest loaded row.

---

### #25 🟢🧊 `aria-live` on result count may spam screen readers

**Location:** `StatusBar.tsx:39`

`aria-live="polite"` on the count announces every `total` change. During fast scroll,
`total` may update frequently from `loadRange` responses. May annoy screen reader
users.

**Fix (if desired):** Only announce on primary search, not on `loadRange` updates.

---

### #26 🟢🧊 `pageFocus` grid view may miscalculate during resize

**Location:** `useListNavigation.ts:195-228`

If `columns` changes between the scroll and the focus call (ResizeObserver fires during
the same frame), the index calculation uses the old column count. Only possible during
simultaneous window resize + PageDown — extremely unlikely.

---

## Action Plan

### Fix Now (🔧) — ✅ All done

All five ref/memo fixes implemented in a single session (March 2026). No architectural
risk. No regressions in existing test suite (50 tests).

| # | Issue | Fix | Status |
|---|-------|-----|--------|
| 6 | `visibleImages` useMemo | Compare resolved IDs; return cached array when unchanged | ✅ |
| 7 | `handleScroll` listener churn | Refs for `results.length` and `total` | ✅ |
| 8 | `goToPrev`/`goToNext` churn | Refs for prev/next image in keyboard handler | ✅ |
| 10 | `computeFitWidth` full scan | Scan capped to virtualizer visible window | ✅ |
| 9 | Orphaned `loadRange` on search | Generation-based `AbortController`; abort all on `search()` | ✅ |

### Fix Later (📋) — blocked by future work or only matters at scale

| # | Issue | Blocked by | When |
|---|-------|------------|------|
| 12 | Density switch mount cost | Density slider design | Phase 6: density slider |
| 15 | Histogram agg for scrubber | Scrubber polish | Phase 6: scrubber polish |
| 20 | Image objects not compact | DAL projection redesign | Phase 3+: when memory is measured as problem |
| 27 | LCP: lazy-loaded, undiscoverable image | Production build | When doing prod Lighthouse pass |
| 28 | Unsized `<img>` elements | Low priority — CLS already 0 | Production polish |

**Quick a11y fixes (from Lighthouse):**

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| 29 | `text-grid-text-dim` contrast 2.82:1 | Bump `#8a8a8a` → `#b0b0b0` (4.57:1) | Trivial — 1 CSS variable |
| 30 | No `<main>` landmark | Wrap content in `<main>` | Trivial |
| 32 | DateFilter `aria-label` mismatch | Include visible text in label | Trivial |

**Resolved in scrubber/windowed-scroll work (March 2026):**

| # | Issue | How resolved |
|---|-------|--------------|
| 3 | Unbounded `results` growth | Windowed buffer (`BUFFER_CAPACITY = 1000`) with eviction |
| 4 | `from/size` 100k cap | `search_after` + PIT + deep seek strategies (percentile, composite, iterative) |
| 5 | Sort-around-focus | `_findAndFocusImage` + `countBefore` — async, non-blocking |
| 11 | Array spreading at depth | Solved by #3 — buffer capped at 1000 entries |
| 13 | Debounce vs scrubber seeks | Scrubber seeks directly; `reportVisibleRange` triggers extends without debounce |
| 14 | `search_after` tiebreaker | `buildSortClause` appends `{ id: "asc" }` tiebreaker |

### Watch (🧊) — no action now, revisit if context changes

Issues #16–19, #21–26, #31, #33–36. All very low severity. Document and move on.
Lighthouse-sourced issues #33–36 are dev-mode or external artefacts (SEO for internal
tool, extension 404s, Vite HMR WebSocket, thumbnail cache duration).

---

## Things Done Right

Patterns specifically checked and found to be well-designed — no changes needed:

- **CSS-variable column widths** — single `<style>` tag, no per-cell JS during resize
- **Memo'd TableBody during resize drag** — cached refs, CSS-only width updates.
  Avoids TanStack's own bug #6121
- **`opacity: 0` overlay** — preserves scrollTop, layout, virtualizer state
- **Fullscreen surviving between images** — stable DOM node + React reconciliation
- **O(1) image lookup** — incremental `imagePositions` Map in the store
- **Bounded placeholder skipping** — MAX_SKIP=10 prevents O(100k) scans
- **Result set freezing** — `frozenUntil` prevents offset shifts during scroll.
  Trade-off: stale after long sessions (see #16)
- **Asymmetric prefetch** — 2 back, 3 forward. Empirically sound
- **Request coalescing** — AbortController on search, dedup + `_failedRanges`
  on loadRange
- **Source excludes** — stripping EXIF/XMP/embeddings from ES responses
- **Visible-window table data** — TanStack Table sees ~60 rows, not all loaded
- **Passive scroll listeners** — `{ passive: true }` on all handlers
- **configRef pattern** — keyboard listeners registered once, read config from ref
- **density-focus.ts** — 5-line module-level bridge for viewport position preservation
- **Field registry** — single source of truth, stable column defs at module level
- **Tailwind CSS 4** — zero runtime overhead, no CSS-in-JS
- **ARIA attributes** — zero performance cost (plain HTML attributes)
- **Module-level column defs** — stable references prevent row model rebuilds

---

## Bugs Found & Fixed

### Logo from image detail shows empty table

**Symptom:** Clicking the Grid logo from image detail → empty/placeholder table.
Second click → no-op. Fixed via scroll → immediate data.

**Root cause:** Two interacting issues:
1. `useUrlSearchSync` dedup treated `?image=X&nonFree=true` → `?nonFree=true` as
   unchanged (display-only `image` key stripped before comparison) → skipped `search()`.
2. Virtualizer not notified of programmatic `scrollTop = 0` on hidden containers.

**Fix:** `resetSearchSync()` clears dedup state; synthetic scroll event; belt-and-
suspenders `virtualizer.scrollToOffset(0)` in scroll-reset effect.

---

## Imgproxy Latency Benchmark (24 March 2026)

Script: `kupua/exploration/imgproxy-bench.mjs`. 70 real images from TEST ES via local
imgproxy Docker → S3. Window: 2013×1176 CSS px @ 1.2x DPR.

### Sequential (pure per-image latency)

| Stat | 1200×1200 |
|------|-----------|
| Min | 135ms |
| P25 | 382ms |
| **Median** | **456ms** |
| P75 | 603ms |
| P95 | 803ms |
| Max | 917ms |

→ Max traversal rate without prefetch: **~2 images/sec**.

### Prefetch batch of 5

Batching 5 concurrent is barely faster than sequential — imgproxy is single-threaded,
requests queue. Total for 25 images: 3.4s.

### 60fps traversal simulation

| Metric | 1200×1200 | 2416×1411 (DPR) |
|--------|-----------|-----------------|
| On time (≤1 frame) | **0/70 (0%)** | 0/70 |
| Very late (30+ frames) | **70/70 (100%)** | 70/70 |
| Median latency | 2,049ms | 3,536ms |

**Not a single image arrived within one frame.** Imgproxy is the traversal bottleneck.

### Implications

- **Prefetching is correct** — can't make imgproxy faster, but 3-ahead covers ~2.7s
  of sustained key-hold traversal
- **DPR-scaled images ~70% slower** — weigh sharpness vs traversal speed
- **Thumbnail-first progressive loading** would show S3 thumbnail (~instant) while
  full image loads in background
- **Filmstrip** (future) must use S3 thumbnails, not imgproxy

---

## Future Architecture: Scrubber & Infinite Scroll

### Performance prerequisites for scrubber implementation — ✅ All done

These items from the issue table were all scrubber-blocking or scrubber-related.
All resolved in the windowed-scroll + scrubber work (March 2026).

1. **#4 — `search_after` + PIT.** ✅ Hybrid pagination: `search_after` for sequential
   browsing, `from/size` for shallow random jumps, deep seek strategies for >10k.
2. **#3 — Windowed buffer.** ✅ Fixed-capacity buffer (`BUFFER_CAPACITY = 1000`).
   Scrubber thumb = `bufferOffset / total`.
3. **#14 — Tiebreaker sort.** ✅ `buildSortClause` appends `{ id: "asc" }` to all sort clauses.
4. **#13 — Two-tier gap detection.** ✅ Replaced with direct seek + edge-triggered extends.
5. **#15 — Histogram aggregation.** 📋 Open — scrubber uses linear mapping. Non-linear
   distribution-aware mapping is Phase 6 polish.

### Filmstrip performance concerns

The filmstrip (horizontal thumbnail strip in image detail) needs:
- S3 thumbnails, not imgproxy — must be instant
- Horizontal virtualisation (only render ±20 thumbnails)
- `loading="eager"` for ±3 nearest, `loading="lazy"` for rest
- Leverage browser cache from grid view thumbnails

### "Never Lost" performance budget

Context preservation runs on the critical path of every transition:

| Operation | Complexity | Budget |
|---|---|---|
| Adjacency scan for displaced focus | O(N) over ±5 old neighbours | <1ms |
| Selection survival check | O(selected × new results) membership | <5ms |
| Sort-around-focus positioning | O(1) `_count` query + seek | Async (no budget — animate) |
| Edit state preservation | Independent panel mount | No cost (no unmount) |

---

## Chrome Lighthouse Audit (28 March 2026)

Run against `http://localhost:3000/search?nonFree=true` on the dev server (Vite, no
production build). Lighthouse 13.0.2, Chrome 146, desktop form factor, simulated
throttling (40ms RTT, 10Mbps). Local Docker ES with ~10k sample images.

### Category Scores

| Category | Score | Notes |
|----------|------:|-------|
| **Performance** | **61** | Dragged down by LCP (5.3s) and FCP (2.4s) — both dev-mode artefacts |
| **Accessibility** | **94** | 3 failures: contrast, landmark, label-content mismatch |
| **Best Practices** | **96** | 1 failure: 404 console errors (Chrome extensions, not us) |
| **SEO** | **83** | Missing `<meta description>` and `robots.txt` — irrelevant for internal tool |

### Core Web Vitals

| Metric | Value | Score | Weight | Notes |
|--------|------:|------:|-------:|-------|
| **LCP** | 5,277ms | 0.07 | 25% | LCP element = grid thumbnail (lazy-loaded, not preconnected) |
| **FCP** | 2,415ms | 0.16 | 10% | Dev-mode JS bundle bloat; observed FCP = 320ms |
| **Speed Index** | 3,159ms | 0.23 | 10% | Visual progression slow due to lazy image load |
| **TBT** | 8ms | 1.00 | 30% | **Excellent** — near-zero main-thread blocking |
| **CLS** | 0 | 1.00 | 25% | **Perfect** — fixed cell sizes, no layout shift |
| **TTI** | 5,331ms | 0.35 | — | Same root cause as LCP |

**TBT and CLS are perfect.** The performance score is entirely dragged down by
loading metrics (LCP, FCP, SI) — which are heavily penalised by the dev-mode
environment and the image loading pattern.

### Why LCP is 5.3s (and why it doesn't matter much)

The LCP element is a grid thumbnail `<img>` inside a virtualised cell. It scores
poorly for three structural reasons:

1. **Not discoverable in initial HTML.** The image URL is computed at runtime from
   ES search results → React render → virtualiser → DOM insert → `<img>` created.
   Lighthouse can't find a `<link rel="preload">` or an `<img>` in the static HTML.

2. **`loading="lazy"` on all images.** Every grid/table thumbnail uses
   `loading="lazy"`, including the first visible row. The first-row images above
   the fold should use eager loading (or `fetchpriority="high"`) so the browser
   starts fetching immediately.

3. **Dev-mode bundle size.** Vite serves unminified, unbundled modules. The total
   JS payload is 5,292 KiB (unminified) — in production this would be ~30% of that
   after tree-shaking, minification, and code-splitting. The unminified JS audit
   flags 1,996 KiB of savings; unused JS flags 1,837 KiB — both dominated by
   dev-mode artefacts (`@vite/client` 200KB, `@react-refresh` 110KB, full
   `date-fns` 432KB, full `zod` 429KB, full `react-dom` 802KB).

**In a production Vite build:**
- Tree-shaking eliminates unused `date-fns` functions (~75% of the 432KB)
- `zod` dead code eliminated (~80% of 429KB — only `searchParamsSchema` is used)
- `react-dom` minified is ~130KB gzipped (vs 802KB raw dev)
- `@vite/client` and `@react-refresh` are removed entirely (~310KB gone)
- Code-splitting would defer `ImageDetail`, `ImageMetadata`, `FacetFilters`

**Estimated production LCP improvement:** FCP should drop to <1s (observed FCP is
already 320ms — the simulated throttling adds ~2s of artificial JS parse time on
the bloated dev bundles). LCP depends on thumbnail fetch latency from S3/imgproxy.

### #27 📋 LCP blocked by lazy-loaded, undiscoverable image

The LCP element is a thumbnail in grid cell row 1, column 7 (near right edge). It
has `loading="lazy"` and no `fetchpriority` hint. Lighthouse's LCP checklist:
- ❌ `fetchpriority=high` not applied
- ❌ Request not discoverable in initial document
- ❌ `lazy` load applied (should be eager for above-fold content)

**Suggested fix (when we do a production build):**

For grid view: the first `N` cells (where `N ≈ columns × 2` — first two rows) should
use `loading="eager"` and the first row's images should have `fetchpriority="high"`.
The virtualiser knows which rows are initially visible.

For table view: thumbnail column in the first ~20 visible rows should be eager.

This is a production polish item — no point fixing in dev mode where the JS bundle
dominates FCP anyway.

### #28 📋 Unsized images

Lighthouse flags 10 grid thumbnail `<img>` elements without explicit `width`/`height`
attributes. Our thumbnails use CSS sizing (`max-h-[186px]`, `object-contain`) within
fixed-size cells, so **CLS = 0** — there's no layout shift because the cell's
dimensions are fixed before the image loads.

Adding `width`/`height` would tell the browser the intrinsic aspect ratio, allowing
it to reserve the correct space before loading. Since our cells are already fixed-size,
the visual benefit is zero — but it would silence the Lighthouse audit and marginally
help the browser's layout engine.

**Fix:** Set `width` and `height` from the image's known dimensions (available in the
ES document). Low priority — CLS is already perfect.

### #29 🔧 Color contrast failure — `text-grid-text-dim`

Three elements fail WCAG AA contrast (4.5:1 minimum for normal text):

| Element | FG | BG | Ratio | Required |
|---------|----|----|------:|------:|
| CQL placeholder (`Cql__Placeholder`) | `#8a8a8a` | `#444444` | 2.82:1 | 4.5:1 |
| Result count in header | `#8a8a8a` | `#444444` | 2.82:1 | 4.5:1 |
| Grid cell metadata text | `#8a8a8a` | `#444444` | 2.82:1 | 4.5:1 |

All share the same root cause: `--color-grid-text-dim: #8a8a8a` on
`--color-grid-panel: #444444` background.

**This is inherited from kahuna** — Grid's existing dark theme uses these exact values.
Fixing it requires bumping `#8a8a8a` to at least **`#949494`** (ratio 3.03 — still
fails AA) or **`#a0a0a0`** (ratio 3.54 — passes AA for large text ≥18px/14px bold)
or **`#b0b0b0`** (ratio 4.57 — passes AA for all text).

Trade-off: brighter dim text reduces the visual hierarchy (less distinction between
`text-grid-text` `#cccccc` and `text-grid-text-dim`). The current palette was
presumably chosen for aesthetic distinction at the cost of accessibility.

**Recommendation:** Bump to `#a8a8a8` (ratio 3.93:1) — passes AA for large text
(≥18px / 14px bold), and our grid cell metadata uses 12px so it still fails for the
smallest text. To pass universally: `#b0b0b0` (4.57:1). Worth testing visually before
committing — the dim text will look noticeably brighter.

### #30 🔧 No `<main>` landmark

The page has no `<main>` element. Screen reader users rely on landmarks to navigate.
Easy fix: wrap the content area in `<main>` — either in `__root.tsx` around `<Outlet>`
or in `search.tsx` around the search UI container.

### #31 🧊 Forced reflow from Scrubber tooltip

Lighthouse detected a 30ms forced reflow sourced from `Scrubber.tsx:162` (the
`setTimeout(() => setTooltipVisible(false), 1500)` call). This is actually
**react-dom's commit phase** — the `setTooltipVisible(false)` state update triggers
a React re-render, and React-DOM's `commitWork` at `react-dom_client.js:9077`
synchronously measures layout (forced reflow).

This only fires once, 1.5 seconds after a drag ends. 30ms is negligible for a
non-interactive moment. **No action needed.**

### #32 🔧 DateFilter `aria-label` doesn't include visible text

The date filter button has `aria-label="Show date range filter"` but its visible
text is the dynamic `buttonLabel` (e.g. "All time", "Last 7 days", "1 Jan – 15 Mar").
WCAG 2.5.3 (Label in Name) requires that the accessible name include the visible text
so speech-input users can activate the control by saying what they see.

**Fix:** Change to `aria-label={\`Date range filter: ${buttonLabel}\`}` or remove
the `aria-label` entirely and let the visible text be the accessible name (the button
already contains descriptive text via `buttonLabel` + the calendar icon).

### #33 🧊 SEO: no meta description, no robots.txt

Lighthouse flags missing `<meta name="description">` and invalid `robots.txt`. This
is an internal tool — it will never be indexed by search engines. No action needed.

### #34 🧊 Thumbnail cache lifetime

S3 thumbnails are served with a 10-minute cache (`Cache-Control: max-age=600`). This
is set by the Vite proxy/S3 configuration. Longer cache times (1 hour, 1 day) would
improve repeat-visit performance, but thumbnails are tiny (15-25KB each) and the
browser cache handles them well. Low priority.

### #35 🧊 Console 404 errors

Seven 404 errors for paths like `/assets/js/index.Bn8kMt0L.js`,
`/assets/js/client.CFb1D2Bh.js`, etc. These are **Chrome extensions** (1Password,
uBlock Origin, and others) trying to load their content scripts from the page origin.
Not kupua's fault. These don't appear in a clean Chrome profile.

### #36 🧊 BF cache blocked by WebSocket

The page can't enter back/forward cache because of an active WebSocket connection.
This is **Vite's HMR WebSocket** — dev-only. A production build has no WebSocket.

### Network Analysis

142 total requests. Top contributors by transfer size:

| Resource | Size | Type | Notes |
|----------|-----:|------|-------|
| `react-dom_client.js` | 802 KB | Script | Dev-mode unminified; ~130KB gzipped in prod |
| `date-fns.js` | 432 KB | Script | Full library; tree-shaking removes ~75% |
| `zod.js` | 429 KB | Script | Full library; tree-shaking removes ~80% |
| `@guardian/cql.js` | 418 KB | Script | CQL query parser — large but necessary |
| ES `_search` response | 270 KB | Fetch | Initial search results; expected |
| `@tanstack/react-router.js` | 266 KB | Script | Router; moderate tree-shaking potential |
| `@vite/client` | 200 KB | Script | Dev-only — removed in prod |
| `ImageTable.tsx` | 142 KB | Script | Unminified source; ~30KB in prod |
| `search-store.ts` | 122 KB | Script | Unminified source; ~25KB in prod |

**80 script requests** — entirely a dev-mode artefact (Vite serves each module as a
separate HTTP request). A production build bundles these into 1-3 chunks.

### Main Thread Breakdown

| Category | Time |
|----------|-----:|
| Script evaluation | 261ms |
| Other | 204ms |
| Script parse/compile | 124ms |
| Style/Layout | 46ms |
| HTML parse | 5ms |
| Paint/Composite | 5ms |
| **Total** | **645ms** |

**Excellent.** Only 8 tasks >10ms, 5 >25ms, 4 >50ms, 2 >100ms, 0 >500ms. TBT is
8ms. The main thread is not a bottleneck. This validates the architecture choices:
passive scroll listeners, ref-stabilised callbacks, CSS-variable column widths,
memo'd components.

### DOM Size

462 total elements. DOM depth = 12 (grid cell `<img>`). Most children = the
virtualised grid container with ~50 row elements. **Well within healthy range** —
Lighthouse threshold for concern is 1,500 elements.

### What Would Improve the Score Most

The Lighthouse performance score formula (weighted):
- **TBT (30%)** — already perfect (1.0)
- **LCP (25%)** — 0.07 → biggest drag
- **CLS (25%)** — already perfect (1.0)
- **FCP (10%)** — 0.16
- **SI (10%)** — 0.23

LCP alone accounts for ~23 points of the ~39-point deficit. FCP + SI account for
~12 points. TBT and CLS contribute nothing negative.

**If LCP dropped to 2.5s** (good threshold): score ≈ 80-85.
**If FCP also dropped to 1.0s**: score ≈ 90+.

Both improvements come essentially for free from a production build (tree-shaking,
minification, code-splitting, no Vite client). The only code change that would help
is making first-row images eager/high-priority (#27).

### Comparison with Kahuna

Kupua's Lighthouse profile is structurally healthier than kahuna would be:
- **CLS = 0** (kahuna's waterfall layout shifts as images load at different sizes)
- **TBT = 8ms** (kahuna uses AngularJS with digest cycles)
- **DOM = 462** (kahuna renders all loaded images — could be 5,000+ at depth)
- **No render-blocking resources** (kahuna has synchronous CSS/JS in `<head>`)

The weak scores (LCP, FCP) are entirely dev-mode artefacts that disappear in a
production build. Kahuna's production build would still have digest-cycle TBT,
layout shifts from waterfall rendering, and a much larger DOM.

---

## Future Benchmark Ideas

- **Production build Lighthouse** — run after `vite build` to get real scores
- **Image format comparison** — JPEG vs WebP vs AVIF (encode time vs size)
- **Quality sweep** — 60/70/80/90/95 (diminishing returns curve)
- **Viewport dimension matrix** — common sizes for DPR decisions
- **Thumbnail-first progressive loading** — UX improvement vs complexity
- **imgproxy caching** — `IMGPROXY_RESULT_STORAGE_LIFETIME` hit rate
- **Grid overscan + `loading="lazy"` interaction** — Chrome DevTools during
  fast scroll to verify thumbnail fetch timing
- **Concurrent prefetch limit** — vary from 3 to 7 to find sweet spot

