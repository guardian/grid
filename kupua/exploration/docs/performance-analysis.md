# Kupua Performance Analysis

> **March 2026.** Combined analysis covering every performance-relevant code path:
> render pipeline, scroll, state management, network/data, layout/paint, keyboard
> navigation, memory, CSS, accessibility. Includes future-facing analysis for scrubber,
> infinite scroll at 9M scale, density slider, filmstrip, and "Never Lost".

---

## Overall Assessment

The architecture is genuinely excellent. CSS-variable column widths, memo'd table body
during resize, overlay-not-route, O(1) image lookup, sparse array with gap detection,
result set freezing, asymmetric prefetch, configRef-pattern keyboard listeners,
density-focus bridge — all strong choices. Most apps of this complexity would have
5–10 performance problems by now; significantly fewer exist here.

The two main structural risks are both already on the roadmap: **unbounded memory
growth** (no page eviction) and **`from/size` pagination ceiling** (blocks scrubber
and "Never Lost" on sort). Everything else is polish-level.

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
| 3 | 🔴 | Unbounded `results` growth — no page eviction | Memory | High | 📋 | Open — needs scrubber |
| 4 | 🔴 | `from/size` unusable beyond 100k — blocks scrubber | Arch | High | 📋 | Open — needs `search_after` |
| 5 | 🔴 | "Never Lost" sort-around-focus blocked by `from/size` cap | Arch | High | 📋 | Open — blocked by #4 |
| 6 | 🟡 | `visibleImages` useMemo triggers unnecessary re-renders | Render | Low | 🔧 | Open |
| 7 | 🟡 | `handleScroll` recreated on `results.length` change | Scroll | Low | 🔧 | Open |
| 8 | 🟡 | `goToPrev`/`goToNext` listener churn in ImageDetail | Render | Low | 🔧 | Open |
| 9 | 🟡 | Orphaned `loadRange` requests survive new search | Network | Med | 🔧 | Open |
| 10 | 🟡 | `computeFitWidth` iterates all loaded results | Render | Low | 🔧 | Open |
| 11 | 🟡 | `results` array spreading copies entire array per `loadRange` | State | — | 📋 | Mitigated by #3 |
| 12 | 🟡 | Density switch mounts/unmounts entire view tree | Render | — | 📋 | Acceptable now; risk for density slider |
| 13 | 🟡 | Gap detection 80ms debounce delays scrubber seeks | Scroll | Low | 📋 | Future — scrubber prereq |
| 14 | 🟡 | `search_after` needs `_id` tiebreaker for determinism | Arch | Trivial | 📋 | Future — when implementing `search_after` |
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

### #3 🔴📋 Unbounded `results` growth — no page eviction

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

**Fix:** Page eviction — sliding window of ~500–1000 entries. Evict results beyond
±500 rows from the viewport. Delete corresponding `imagePositions` entries. Clear
evicted ranges from `_failedRanges`. This bounds memory regardless of scroll depth.

**When:** Implement alongside scrubber (#4). The scrubber's windowed buffer model
inherently solves this — the sparse array is replaced by a fixed-capacity buffer.

---

### #4 🔴📋 `from/size` unusable beyond 100k — blocks scrubber

**Location:** `search-store.ts`, `es-adapter.ts`

ES `from/size` performance degrades linearly with offset and is capped at
`max_result_window` (100k on TEST/PROD). For a scrubber at 50% of 9M images
(position 4.5M), `from/size` is completely unusable.

Current defensive measures:
- `loadRange()` clamps to `MAX_RESULT_WINDOW` and records failed ranges
- Virtualizer count capped at `min(total, 100k)`
- Grid at 303px/row: 100k rows = 30.3M px — approaching the ~33M browser cap

**Architectural change for scrubber:**
1. Replace sparse `results` array with windowed buffer (fixed ~1000 entries)
2. Introduce `windowOffset` mapping buffer[0] to a logical global position
3. Scrubber thumb = `windowOffset / total` (not `scrollTop / scrollHeight`)
4. Seeking = clear buffer, set `windowOffset`, fetch via `search_after` (sequential)
   or `from/size` (within 100k window)
5. Virtualizer count = buffer capacity (not total)

The `useDataWindow` API (`getImage`, `findImageIndex`, `reportVisibleRange`) can stay
stable while the underlying storage changes.

---

### #5 🔴📋 "Never Lost" sort-around-focus blocked by `from/size` cap

**Location:** Architectural — see #2 for the failed attempt

The frontend-philosophy's "Never Lost" principle requires finding the focused image's
new position after a sort change. Blocked by the 100k `from/size` cap.

With `search_after` + tiebreaker sort (#14):
1. After sort change, `_count` query: "how many docs have sort value < X OR
   (sort value == X AND _id < Y)?" → deterministic unique position
2. If position > window capacity, seek via `search_after` pagination
3. Focus the image in the new window

**Performance concern:** The `_count` positioning query runs alongside the search.
Consider making it async — show results immediately at the top, animate focus to
the found position once count returns.

---

### #6 🟡🔧 `visibleImages` useMemo triggers unnecessary re-renders

**Location:** `ImageTable.tsx:498-506`

```ts
const visibleImages = useMemo(() => { ... }, [virtualItems, results]);
```

Depends on `results`. Every `loadRange` creates a new array reference — even for
off-screen ranges — triggering recomputation → new `visibleImages` → `useReactTable`
gets new `data` → `getCoreRowModel()` rebuilds → full reconciliation check on
`TableBody`. The work per rebuild is small (~60 rows) but multiplied by every
off-screen range response (3–5 per debounce window).

**Fix (easy):** Compare the resolved image IDs in the visible window before/after.
If the same IDs in the same order → return the cached reference. Short-circuits all
reconciliation from off-screen loads.

---

### #7 🟡🔧 `handleScroll` recreated on `results.length` change

**Location:** `ImageTable.tsx:582-598`, `ImageGrid.tsx:272-287`

Both `handleScroll` callbacks include `results.length` in their dependency arrays.
Every data load changes `results.length` → callback recreated → `useEffect` removes
and re-adds the scroll listener. Creates a tiny window where scroll events might be
missed, and runs listener setup synchronously during React's commit phase.

**Fix (easy):** Use refs for `results.length` and `total` inside the callback. The
dependency array becomes `[virtualizer, reportVisibleRange, loadMore]` — all stable.

---

### #8 🟡🔧 `goToPrev`/`goToNext` listener churn in ImageDetail

**Location:** `ImageDetail.tsx:110-116`

`goToPrev`/`goToNext` are recreated whenever `prevImage`/`nextImage` change (which
happens on every `results` reference change). They're dependencies of the `useEffect`
that registers keyboard listeners — causing unnecessary listener removal and
re-registration.

**Fix (easy):** Use refs for `prevImage`/`nextImage` in the keyboard handler.

---

### #9 🟡🔧 Orphaned `loadRange` requests survive new search

**Location:** `es-adapter.ts` — `searchRange` has no AbortController

When the user types a new query, `search()` aborts its own request but in-flight
`loadRange` requests from the previous search continue. Their responses are discarded
by the store updater, but the network requests waste bandwidth. During fast typing:
3–5 concurrent ranges × 3–4 searches/second = 9–20 orphaned requests.

**Fix:** Store `AbortController` instances per range key in `_inflight`. On
`search()`, abort all pending range controllers and clear the set.

---

### #10 🟡🔧 `computeFitWidth` iterates all loaded results

**Location:** `ImageTable.tsx:772-784`

"Resize all columns to fit data" runs `computeFitWidth` for every visible column.
Each call iterates all loaded images via `for...in` with `measureText`. At 10k loaded
images × 15 columns = 150k `measureText` calls. `measureText` is synchronous and
canvas context switches are expensive — could freeze the UI.

**Fix (easy):** Cap the scan to the virtualizer's visible window (~60 rows). The fit
width for visible rows is a perfectly good approximation.

---

### #11 🟡📋 `results` array spreading copies entire array per `loadRange`

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

### #13 🟡📋 Gap detection 80ms debounce delays scrubber seeks

**Location:** `useDataWindow.ts:47` — `GAP_DETECT_DELAY = 80`

For continuous scroll, 80ms debounce is correct (fires every ~5th frame, overscan
hides the delay). For scrubber seeks (jumping thousands of rows), 80ms of latency
before any data request fires means 80ms + ES round-trip + render of blank
placeholders.

**Future fix:** Two-tier detection. Immediate `loadRange` for jumps > N rows
(scrubber seek, keyboard End). Debounced for continuous scroll.

---

### #14 🟡📋 `search_after` needs `_id` tiebreaker for determinism

**Location:** `es-adapter.ts:buildSortClause()`

`search_after` with duplicate sort values (e.g. thousands of `credit: "Getty Images"`)
produces ambiguous page boundaries. The fix: always append `{ "_id": "asc" }` as the
final sort clause. This gives every document a unique sort position.

**Impact on current code:** `buildSortClause()` doesn't add a tiebreaker. For
`from/size` this causes slight page overlap at boundaries (harmless). For
`search_after` it's essential correctness.

**When:** Implement when adding `search_after` support. Document as a deviation from
kahuna (which uses `from/size` only).

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

### Fix Now (🔧) — easy wins, directly improve current UX

All five are low-effort ref/memo fixes. Could be done in a single session.

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| 6 | `visibleImages` useMemo | Compare resolved IDs before returning new array | ~15 min |
| 7 | `handleScroll` listener churn | Use refs for `results.length` and `total` | ~10 min |
| 8 | `goToPrev`/`goToNext` churn | Use refs for prev/next image in keyboard handler | ~10 min |
| 10 | `computeFitWidth` full scan | Cap scan to virtualizer visible window | ~10 min |
| 9 | Orphaned `loadRange` on search | AbortController pool keyed by range; abort all on `search()` | ~30 min |

**Total:** ~75 minutes. All are safe, isolated changes. No architectural risk.

### Fix Later (📋) — blocked by future work or only matters at scale

| # | Issue | Blocked by | When |
|---|-------|------------|------|
| 3 | Unbounded `results` growth | Scrubber / windowed buffer | Phase 2: scrubber |
| 4 | `from/size` 100k cap | `search_after` + PIT implementation | Phase 2: scrubber |
| 5 | Sort-around-focus | #4 + tiebreaker (#14) | Phase 2: after scrubber |
| 11 | Array spreading at depth | Solved by #3 (page eviction) | Phase 2: scrubber |
| 12 | Density switch mount cost | Density slider design | Phase 6: density slider |
| 13 | Debounce vs scrubber seeks | Scrubber implementation | Phase 2: scrubber |
| 14 | `search_after` tiebreaker | `search_after` implementation | Phase 2: scrubber |
| 15 | Histogram agg for scrubber | Scrubber polish | Phase 6: scrubber polish |
| 20 | Image objects not compact | DAL projection redesign | Phase 3+: when memory is measured as problem |

### Watch (🧊) — no action now, revisit if context changes

Issues #16–19, #21–26. All very low severity. Document and move on.

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

Script: `kupua/exploration/bench-imgproxy.mjs`. 70 real images from TEST ES via local
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

### Performance prerequisites for scrubber implementation

These items from the issue table are all scrubber-blocking or scrubber-related:

1. **#4 — `search_after` + PIT.** Hybrid pagination: `search_after` for sequential
   browsing, `from/size` for random jumps within the 100k window.
2. **#3 — Windowed buffer.** Replace sparse array with fixed-capacity buffer
   (~1000 entries). Scrubber thumb = `windowOffset / total`.
3. **#14 — Tiebreaker sort.** Append `{ "_id": "asc" }` to all sort clauses for
   deterministic `search_after` pagination.
4. **#13 — Two-tier gap detection.** Immediate for seeks (scrubber drag, End key),
   debounced for continuous scroll.
5. **#15 — Histogram aggregation.** Non-linear scrubber mapping for bursty data.
   Cache results; refresh on search change.

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

## Future Benchmark Ideas

- **Image format comparison** — JPEG vs WebP vs AVIF (encode time vs size)
- **Quality sweep** — 60/70/80/90/95 (diminishing returns curve)
- **Viewport dimension matrix** — common sizes for DPR decisions
- **Thumbnail-first progressive loading** — UX improvement vs complexity
- **imgproxy caching** — `IMGPROXY_RESULT_STORAGE_LIFETIME` hit rate
- **Grid overscan + `loading="lazy"` interaction** — Chrome DevTools during
  fast scroll to verify thumbnail fetch timing
- **Concurrent prefetch limit** — vary from 3 to 7 to find sweet spot

