# Kupua Performance Analysis — Scrolling & Image Traversal

> March 2026. Thorough review of every code path involved in scrolling (table
> infinite scroll, sparse gap loading, keyboard navigation) and image-to-image
> traversal (prev/next in ImageDetail, prefetch, focus management).

---

## Overall Assessment

The architecture is genuinely excellent. The overlay-not-route pattern, CSS-variable
column widths, memo'd table body during resize, O(1) image lookup, sparse array with
gap detection, result set freezing, and asymmetric prefetch are all strong choices.
Most apps of this complexity would have 5-10 performance problems by now; significantly
fewer were found.

---

## Findings

### 1. 🔴 `imagePositions` Map full rebuild on every `loadRange` result

**Location:** `useDataWindow.ts` (was line 173)

Every `loadRange` call does `set({ results: newResults, ... })` which creates a new
`results` array reference. Since `useDataWindow` subscribed to `results`, the
`imagePositions` `useMemo` recomputed — iterating all loaded entries via `for...in`.

At 50k loaded images (realistic after heavy scrolling), this is a `for...in` over a
sparse array with 50k defined keys on every single range load. During fast scrolling,
multiple `loadRange` calls can land in quick succession (gap detection fires chunked
requests of up to 200 rows), each one triggering a full Map rebuild.

**Severity:** Medium-high during deep scroll sessions. O(loaded) per range load, and
multiple range loads can overlap.

**Status: ✅ Fixed.** Moved `imagePositions` into the search store as a first-class
field maintained incrementally:
- `search()`: full rebuild from the first page (fresh Map, O(page size))
- `loadMore()`: extends existing Map with new appended hits (O(page size))
- `loadRange()`: extends existing Map with new range hits (O(page size))

Helper function `buildPositions()` in `search-store.ts` handles both full-rebuild and
incremental cases. `useDataWindow` now subscribes to `s.imagePositions` directly
instead of deriving it.

**Memory note:** The Map grows proportionally to loaded data (one string→number entry
per loaded image, ~2-4MB at 50k). This is tiny compared to the Image objects in
`results` (~5-10KB each, so 250-500MB at 50k). When page eviction is implemented
(sliding window of ~500-1000 rows), evicted images should be `.delete()`'d from the
Map in the same store update — no special handling needed.

**Measured impact (March 2026):** At ~500-3000 loaded entries (typical scrolling
session against TEST), the old full-rebuild cost was 0-7ms per range load with
occasional spikes to 14-25ms. The incremental approach registers as 0ms. The
improvement is architecturally correct (prevents O(n) degradation at scale) but
not perceptible at current usage depths. The fix will matter when users load
10k+ entries in a single session — the old approach would grow to 50-100ms per
range load while the incremental approach stays flat at ~0ms regardless of depth.

**Instrumentation removed** after verification — console logs no longer emitted.

### 2. 🟡 `visibleImages` recomputes on every `results` reference change

**Location:** `ImageTable.tsx:374-381`

```ts
const visibleImages = useMemo(() => {
  const images: Image[] = [];
  for (const vItem of virtualItems) {
    const img = vItem.index < results.length ? results[vItem.index] : undefined;
    if (img) images.push(img);
  }
  return images;
}, [virtualItems, results]);
```

Depends on `results` (from `useDataWindow`). Every `loadRange` creates a new array
reference → this useMemo re-runs → new `visibleImages` array → `useReactTable` gets
new `data` → `getCoreRowModel()` rebuilds. Since `visibleImages` is capped to ~60
visible rows, the rebuild is cheap, but it still triggers a full table re-render
including the header group loop and memo check on `TableBody`.

**Severity:** Low-medium. The work per rebuild is small (~60 rows), but it happens on
every scroll-triggered range load.

**Mitigation:** Compare the actual image IDs in the visible window before/after. If the
same images are visible (just at different offsets in a larger array), return the
previous reference. A shallow comparison of IDs would short-circuit most range loads
that fill data outside the current viewport.

### 3. 🟡 `handleScroll` callback recreated on `results.length` change

**Location:** `ImageTable.tsx:423-440`

```ts
const handleScroll = useCallback(() => { ... },
  [virtualizer, reportVisibleRange, results.length, total, loadMore]
);
```

Every `loadMore`/`loadRange` changes `results.length`, which recreates `handleScroll`,
which triggers the `useEffect` that removes/re-adds the scroll listener. This is a
micro-cost but violates the principle of stable scroll handlers.

**Mitigation:** Use refs for `results.length` and `total` inside the callback (the
pattern already exists elsewhere — `resultsRef` etc.), making the dependency array
`[virtualizer, reportVisibleRange, loadMore]` only — which are all stable.

### 4. 🟡 `computeFitWidth` iterates all loaded results via `for...in`

**Location:** `ImageTable.tsx:772-784`

```ts
for (const key in results) {
  const image = results[Number(key)];
  // ...measure text...
}
```

When the user right-clicks → "Resize all columns to fit data", this runs
`computeFitWidth` for every visible column. Each call iterates all loaded images with
`for...in`. At 10k loaded images × 15 visible columns = 150k iterations with
`measureText` calls.

**Severity:** Low (user-triggered, not on scroll path). But `measureText` is
synchronous and canvas context switches can be expensive. Could cause a visible freeze
with large datasets.

**Mitigation:** Cap the scan to the visible window (virtualItems) instead of all
loaded results. The fit width for 60 visible rows is a perfectly reasonable
approximation, and the UI could mention "based on visible rows".

### 5. 🟡 `goToPrev`/`goToNext` recreated on every image change

**Location:** `ImageDetail.tsx:110-116`

```ts
const goToPrev = useCallback(() => {
  if (prevImage) goToImage(prevImage.id);
}, [prevImage, goToImage]);
```

`prevImage` and `nextImage` are derived from `results[currentIndex ± 1]`. Since
`results` changes on every `loadRange`, and `currentIndex` is recalculated via
`findImageIndex` on every `imageId` change, these callbacks are recreated frequently.
They're used in the `useEffect` that registers keyboard listeners, causing unnecessary
listener churn.

**Mitigation:** Use refs for `prevImage`/`nextImage` in the keyboard handler instead
of depending on the callbacks directly.

### 6. 🟢 Prefetch effect fires on every `results` reference change

**Location:** `ImageDetail.tsx:199-218`

The prefetch `useEffect` depends on `[currentIndex, results, imgproxyOpts]`. When a
`loadRange` fills distant data (not near the current image), `results` gets a new
reference, but the nearby images haven't changed — yet the prefetch fires again,
creating 5 new `Image()` objects with the same URLs.

**Severity:** Very low (browser deduplicates identical fetches from cache). But it's
unnecessary work.

**Mitigation:** Compare the actual IDs of the 5 prefetch candidates. Use a ref to
track the last set of prefetched IDs and skip if unchanged.

### 7. 🟢 `imgproxyOpts` uses `window.innerWidth/Height` — not reactive

**Location:** `ImageDetail.tsx:172-175`

```ts
const imgproxyOpts = useMemo(
  () => ({ width: window.innerWidth, height: window.innerHeight }),
  [],
);
```

Empty deps means this is captured once at mount. If the user resizes the window (or
enters/exits fullscreen via `f` key), the imgproxy request still uses the original
viewport dimensions. Not a performance problem — but a correctness note: fullscreen
images might be requested at non-fullscreen resolution.

### 8. 🟢 No transition batching on `loadRange` state updates

**Location:** `search-store.ts:237-260`

Each `loadRange` call does its own `set()` which triggers its own Zustand
notification → React re-render. If 3 chunked range requests land within the same
frame (which is possible when gap detection fires multiple 200-row chunks), that's 3
separate re-renders with 3 `imagePositions` Map rebuilds.

**Mitigation:** React 18/19's automatic batching handles this for synchronous `set()`
calls, but these are in async `.then()` callbacks. They should be batched by React
19's async batching, but it's worth verifying empirically. If not,
`queueMicrotask` batching or collecting results into a single `set()` would help.

### 9. 🟢 `searchRange` doesn't use AbortController

**Location:** `es-adapter.ts:260-262`

By design, `searchRange` doesn't cancel in-flight requests. But when the user starts a
new search (typing in the search box), any in-flight range loads from the *previous*
search keep running and their results will be discarded by the offset guard — but the
network requests still complete. During a slow scroll → new search → scroll cycle, you
could have 5-10 orphaned range requests consuming bandwidth.

**Mitigation:** Give `loadRange` its own AbortController pool keyed by range. On new
`search()`, abort all pending range loads (clear `_inflight` + cancel signals).

### 10. 🟢 `pageFocus` may land in sparse gap

**Location:** `ImageTable.tsx:610-655`

`pageFocus` uses `Math.floor((el.scrollTop + ...) / ROW_HEIGHT)` to find the visible
row indices, then calls `getImage(idx)`. If the calculated index falls in a sparse
gap, the image will be undefined and no focus is set. The user presses PageDown, the
viewport scrolls, but no row is focused.

**Mitigation:** After computing the target index, scan a small neighbourhood (like
`moveFocus` does with MAX_SKIP=10) to find the nearest loaded row.

### 11. 🔴 Sorting while scrolled causes infinite pulsing loop

**Location:** `ImageTable.tsx` scroll-reset effect + `search-store.ts` search()

**Symptom:** Sorting when at the top of the table is fast. But if the user scrolls
down (even modestly), clicking a column header to sort causes the table to "pulse"
indefinitely — rows flash between placeholder skeletons and briefly-loaded data,
never settling.

**Root cause: state contradiction.** The scroll-reset effect had a `sortOnly`
exception that preserved scroll position when only `orderBy` changed. But `search()`
replaces `results` with a fresh first page (~50 images at offset 0). This creates
an impossible state: the viewport is at row 3000 but only rows 0–49 have data.

The resulting feedback loop:
1. `search()` wipes results to 50 entries. `virtualizerCount` stays large (total
   unchanged). Virtualizer renders rows 2960–3040 — all undefined.
2. `visibleImages` is empty → TanStack Table gets `data: []` → all rows render as
   `animate-pulse` placeholder skeletons.
3. Gap detection fires for rows 2910–3090 → `loadRange` fetches them.
4. `loadRange` response fills those rows → re-render → real data appears briefly.
5. But each `loadRange` response creates a new `results` reference → `handleScroll`
   callback is recreated (finding #3) → scroll listener churn → `reportVisibleRange`
   fires again → more gap detection → more `loadRange` calls for adjacent gaps.
6. Meanwhile, if the user sorts again or a concurrent state update lands, another
   `search()` wipes results back to 50 entries → cycle restarts.

The oscillation between "search wipes to 50" and "loadRange fills the viewport"
is what the user sees as pulsing.

**Why it's fast at the top:** When scrolled to row 0, the virtualizer renders rows
0–~40. After `search()` returns 50 entries, rows 0–40 are all present. No gaps,
no gap detection, no pulsing. The sort completes in a single render cycle.

**This is a logical bug, not a performance problem.** The `animate-pulse` animation
makes it *look* like a performance issue, but the root cause is a design
contradiction: preserving scroll position is incompatible with search() returning
only the first page.

**Status: ✅ Fixed.** Removed the `sortOnly` exception. Sort now always
scrolls to top, matching every major data table (Gmail, Sheets, Finder, Explorer).
The data at row 3000 in the new sort order is completely different data — preserving
the scroll position number doesn't preserve context. Horizontal scroll (`scrollLeft`)
is preserved on sort-only changes so the user doesn't lose the column they clicked.

**Sort-around-focus: attempted and deliberately reverted.** We tried to follow the
"Never Lost" principle by finding the focused image's new position via ES `_count`
(count docs with sort value before the anchor value) and scrolling there. ~340 lines
across 6 files. The approach hit three fundamental walls:

1. **`max_result_window` (100k)**: `_count` can return position 1,306,564 but
   `loadRange` can't fetch data beyond `from: 100000`. Most unfiltered sorts land
   well beyond this limit. The feature silently degrades to scroll-to-top for the
   majority of real-world use.

2. **Equal sort values**: When sorting by a field where most results share the same
   value (e.g. `credit:"Getty Images"` sorted by credit), `_count` returns 0 for
   all of them — it counts values before the anchor *value*, not the anchor *image*.
   Position is meaningless when thousands of images share the same sort key.

3. **Growing complexity for diminishing returns**: Every edge case (beyond window,
   equal values, no focus, verification failure) needed its own fallback path.
   The code grew to ~340 lines that mostly didn't work, with each fix revealing
   another case where the approach fundamentally couldn't succeed.

**Conclusion:** "Never Lost" on sort requires **`search_after` + windowed scroll**
(scrubber architecture). With `search_after`, ES returns a cursor — you can
paginate to any depth without the 100k cap. Combined with windowed scroll (scrubber
thumb = `windowStart / total`), the focused image's position can be resolved at
any depth. This is the correct infrastructure to build sort-around-focus on.
Until then, scroll-to-top is the right trade-off: simple, correct, matches user
expectations from every other data table.

---

## Things Done Right (no changes needed)

These are patterns specifically checked and found to be well-designed:

- **CSS-variable column widths** — single `<style>` tag, no per-cell JS during resize.
- **Memo'd TableBody during resize drag** — cached refs for rows/virtualItems. Avoids
  TanStack's own bug #6121.
- **Overlay architecture** — `opacity-0` not `display:none`, preserving scrollTop.
- **Fullscreen surviving between images** — stable DOM node + React reconciliation.
- **O(1) image lookup via Map** — fixed the 7-second `findIndex` stalls.
- **Bounded placeholder skipping** — MAX_SKIP=10 prevents O(100k) scans.
- **Result set freezing** — `frozenUntil` prevents offset shifts during scroll.
- **Asymmetric prefetch** — 2 back, 3 forward. Empirically sound.
- **Request coalescing** — AbortController on search, dedup on loadRange.
- **Source excludes** — stripping EXIF/XMP/embeddings. Critical for response size.
- **Visible-window table data** — TanStack Table only sees ~60 rows, not all loaded.
- **Passive scroll listener** — `{ passive: true }`.

---

## Bugs Found During Testing

### Bug: Logo from image detail shows empty table

**Symptom:** Clicking the Grid logo from the image detail view displays an empty
(or placeholder-only) table. Clicking the logo again from the now-visible list
page does nothing — the app is stuck until a manual scroll (mousewheel) or
browser reload.

**Root cause (two interacting issues):**

1. **Dedup prevents re-search.** `useUrlSearchSync` deduplicates search triggers
   by comparing serialized params. The `image` param is a display-only key,
   stripped before comparison. When the URL goes from `?image=X&nonFree=true` to
   `?nonFree=true`, the effective search params are identical — the hook skips
   `search()`. Second logo click is a complete no-op (same URL → TanStack Router
   does nothing).

2. **Virtualizer not notified of scroll reset.** Even when `scrollTop` is set to
   0 programmatically, TanStack Virtual doesn't know — it relies on a `scroll`
   event from the scroll container to update its internal offset. On hidden
   containers (`opacity-0`), browsers (Firefox especially) may not fire a native
   scroll event for programmatic `scrollTop` changes. The virtualizer stays at
   the old offset (e.g. row 48000) and renders items from the sparse region.
   The data IS in the store — a single mousewheel scroll fires the listener,
   the virtualizer recalculates, and rows appear immediately.

**Fix (three parts):**

1. `resetSearchSync()` — clears the dedup state in `useUrlSearchSync`. Both logo
   onClick handlers call it, ensuring the next sync cycle always fires a fresh
   `setParams()` + `search()`.

2. Synthetic `scrollContainer.dispatchEvent(new Event("scroll"))` — after setting
   `scrollTop = 0` in both logo onClick handlers. This guarantees the virtualizer's
   scroll listener fires regardless of browser behaviour on hidden containers.

3. `virtualizer.scrollToOffset(0)` — in the scroll-reset `useEffect` inside
   ImageTable (fires when searchParams change and it's not a sort-only or
   display-only change). Belt-and-suspenders: directly updates the virtualizer's
   internal state.

**Files changed:**
- `useUrlSearchSync.ts` — extracted dedup state to module-level `_prevParamsSerialized`;
  added `resetSearchSync()` export
- `SearchBar.tsx` — logo onClick calls `resetSearchSync()`, dispatches scroll event
- `ImageDetail.tsx` — logo onClick calls `resetSearchSync()`, dispatches scroll event,
  focuses search input
- `ImageTable.tsx` — scroll-reset effect calls `virtualizer.scrollToOffset(0)`

---

## Recommendations Summary (by priority)

| # | Severity | Finding | Effort | Status |
|---|---|---|---|---|
| 1 | 🔴 | `imagePositions` Map full rebuild on every range load | Medium | ✅ Fixed |
| 11 | 🔴 | Sorting while scrolled causes infinite pulsing loop | Low | ✅ Fixed (scroll-to-top); sort-around-focus needs `search_after` |
| 2 | 🟡 | `visibleImages` useMemo triggers unnecessary table re-renders | Low | Open |
| 3 | 🟡 | `handleScroll` listener churn on `results.length` change | Low | Open |
| 4 | 🟡 | `computeFitWidth` scans all loaded data | Low | Open |
| 5 | 🟡 | `goToPrev`/`goToNext` listener churn in ImageDetail | Low | Open |
| 6 | 🟢 | Prefetch fires on distant data loads | Very low | Open |
| 7 | 🟢 | `imgproxyOpts` not reactive to resize/fullscreen | Very low | Open |
| 8 | 🟢 | `loadRange` state updates may not batch | Low | Open |
| 9 | 🟢 | Orphaned range requests after new search | Low | Open |
| 10 | 🟢 | `pageFocus` may land in sparse gap | Very low | Open |

---

## Imgproxy Latency Benchmark (24 March 2026)

Benchmark script: `kupua/exploration/bench-imgproxy.mjs`

**Question:** How much does imgproxy contribute to image traversal latency?

**Setup:** 70 real images from TEST ES, fetched via local imgproxy (Docker,
`darthsim/imgproxy:latest`) → S3 (`media-service-test-imagebucket`). Measures
the full path: S3 download → resize → WebP encode → HTTP response.

**Window:** 2013×1176 CSS px @ 1.2x DPR. App currently requests 1200×1200
(no DPR scaling — finding #7).

### Results

#### Sequential (one at a time — pure per-image latency)

| Stat | 1200×1200 |
|------|-----------|
| Min | 135ms |
| P25 | 382ms |
| **Median** | **456ms** |
| P75 | 603ms |
| P95 | 803ms |
| Max | 917ms |
| Avg size | 81 KB |

**→ Max traversal rate: ~2 images/sec** (if no prefetching).

#### Prefetch batch of 5 (real app pattern)

Batches of 5 concurrent requests (matching the app's 2-back + 3-forward prefetch):

| Batch | Wall time | Slowest |
|-------|-----------|---------|
| 1 | 730ms | 730ms |
| 2 | 645ms | 644ms |
| 3 | 644ms | 644ms |
| 4 | 791ms | 790ms |
| 5 | 590ms | 590ms |

Key insight: **batching 5 is barely faster than sequential** — imgproxy processes
mostly sequentially (single-threaded image processing), so concurrent requests
just queue up. Total for 5 batches of 5 (25 images): 3.4s.

#### 60fps traversal simulation (1 request per 16.67ms frame)

Simulates the fastest possible traversal — a new image request every frame:

| Metric | 1200×1200 | 2416×1411 (DPR) |
|--------|-----------|-----------------|
| On time (≤1 frame) | **0/70 (0%)** | 0/70 (0%) |
| Slightly late (2-5 frames) | 0/70 | 0/70 |
| Late (6-30 frames) | 0/70 | 0/70 |
| **Very late (30+ frames)** | **70/70 (100%)** | **70/70 (100%)** |
| Median latency | 2,049ms | 3,536ms |
| P95 latency | 2,962ms | 5,107ms |

**Not a single image arrived within one frame.** Every image was 30+ frames
(500ms+) late. Under load, contention pushes median latency to 2+ seconds.

#### Vite proxy overhead

~170ms per request — significant but dwarfed by imgproxy processing time.

### Interpretation

1. **Imgproxy is absolutely the bottleneck for traversal.** At ~456ms per image
   (sequential) and ~2s under concurrent load, even aggressive prefetching can't
   make traversal feel instant.

2. **The current 3-ahead prefetch covers ~82 frames of key-repeat** (at 33ms
   key-repeat interval = ~2.7 seconds of holding arrow key). That's good for
   casual browsing but not fast flicking.

3. **DPR-scaled images (2416×1411) are ~70% slower** than current 1200×1200.
   If we add DPR-aware sizing, we'd need to weigh sharpness vs. traversal speed.

4. **Imgproxy's concurrency is limited.** 5 parallel requests don't finish 5x
   faster — they queue internally. Prefetch helps latency hiding, not throughput.

### What this means for the app

- **Prefetching is the right strategy** — we can't make imgproxy faster, but we
  can start fetching before the user needs the image.
- **Increasing prefetch depth** (e.g. 5-ahead instead of 3) would help sustained
  traversal at the cost of wasted bandwidth for images never viewed.
- **Thumbnail-first traversal** could show the S3 thumbnail (~instant) while
  the full-size image loads in background — a progressive disclosure pattern.
- **Browser caching** means revisiting images is instant (0ms) — only the first
  visit to each image pays the imgproxy cost.

---

## Broader Memory Concern: Unbounded `results` Growth

Users may keep the app open for hours without reloading. The `results` sparse array
only grows — pages are never evicted. At 50k loaded images × ~5-10KB each =
250-500MB of Image objects in memory. The `imagePositions` Map adds ~2-4MB on top
(string→number pairs), which is negligible by comparison.

**The fix is page eviction** — a sliding window of ~500-1000 rows. Scroll up → load
previous page, evict distant forward page. This bounds memory regardless of how far
the user scrolls. Already flagged in the kahuna scroll analysis (§4) and on the
roadmap. When implemented, `imagePositions` entries for evicted images should be
`.delete()`'d in the same store update.

---

## Future Benchmark Ideas

Things to test when time allows — not blocking current work, but would provide
useful data for optimisation decisions:

- **Image format comparison** — benchmark JPEG vs WebP vs AVIF output from
  imgproxy. AVIF is smaller but slower to encode; WebP is the current default.
  Measure the encode time vs. transfer size trade-off at different quality levels.
- **Quality sweep** — run the bench at quality 60, 70, 80, 90, 95 to find the
  knee of the diminishing-returns curve (quality vs. encode time vs. file size).
- **Viewport dimension matrix** — test at common viewport sizes (1920×1080,
  2560×1440, 3840×2160, MacBook 13" vs 16") to understand how resize target
  affects latency. Important for DPR-scaling decisions (finding #7).
- **Thumbnail-first progressive loading** — measure the latency of showing the
  S3 thumbnail (~instant, already cached) while the full imgproxy image loads
  in the background. Would establish whether the UX improvement justifies the
  implementation complexity.
- **imgproxy caching** — test with imgproxy's built-in response caching enabled
  (e.g. `IMGPROXY_RESULT_STORAGE_LIFETIME`) to measure the hit rate during
  back-and-forth traversal (user looks at images 1→5 then goes back to 1).
- **Concurrent request limit** — vary the number of parallel prefetch requests
  (current: 5) to find the sweet spot. Too many may saturate imgproxy; too few
  under-utilise the connection.
