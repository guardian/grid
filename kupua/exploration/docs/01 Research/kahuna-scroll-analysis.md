# Kahuna Scroll Architecture — Analysis & Lessons for Kupua

> Deep read of kahuna's infinite scroll implementation (March 2026).
> Source files: `kahuna/public/js/search/results.js` (875 lines),
> `kahuna/public/js/components/gu-lazy-table/gu-lazy-table.js` (358 lines),
> `gu-lazy-table-cell.js`, `gu-lazy-table-placeholder.js`, `observable-utils.js`,
> `kahuna/public/js/services/scroll-position.js`.

---

## How It Works

### 1. Sparse array + pre-sized container = instant scrollbar

On initial search, kahuna creates a **sparse array** pre-sized to the full result count:

```javascript
const totalLength = Math.min(images.total, ctrl.maxResults);  // cap at 100,000
ctrl.imagesAll = [];
ctrl.imagesAll.length = totalLength;  // 100k slots, all undefined
```

The container height is set immediately to `totalRows × cellHeight` (303px per cell).
The browser's **native scrollbar** reflects the full dataset from the start — grab the
thumb, drag to 50%, and you're at row 50,000. No custom scrubber.

### 2. On-demand range loading

When the viewport scrolls to a region with `undefined` slots, `loadRange(start, end)`
fires and fetches that page via the media-api:

```javascript
ctrl.loadRange = function(start, end) {
    const length = end - start + 1;
    search({offset: start, length: length, countAll: false}).then(images => {
        images.data.forEach((image, index) => {
            ctrl.imagesAll[index + start] = image;
        });
        ctrl.images = compact(ctrl.imagesAll);  // dense copy for ng-repeat
    });
};
```

Max page size is **200** (enforced both client-side and in `ElasticSearchModel.scala`).

### 3. RxJS reactive scroll pipeline

The lazy table computes the visible range reactively:

- `viewportTop$` — scroll position (debounced 80ms)
- `containerWidth$` → `columns$` = `floor(containerWidth / cellMinWidth)` → responsive grid
- `currentRowTop$` / `currentRowBottom$` — which rows are in the viewport
- `loadedRowTop$` / `loadedRowBottom$` — viewport ± `preloadedRows` (4 rows)
- `rangeToLoad$` — scans the sparse array for `undefined` slots in the loaded range

The chain: scroll → viewport position → row range → find gaps → fire `loadRange()` →
fill sparse array → Angular re-renders.

### 4. Visibility toggling, not virtualisation

Each cell is `position: absolute` with computed coordinates. Cells outside a generous
viewport band get `display: none` — but their Angular scope stays alive. This is NOT
true DOM virtualisation (no recycling). At 100k items with heavy scrolling, this is
why kahuna gets sluggish — 100k Angular scopes in the digest cycle.

### 5. Result set freezing

On first search, kahuna records the `uploadTime` of the newest result. All subsequent
pagination requests include `until: lastSearchFirstResultTime`, so new uploads don't
shift offsets while the user scrolls. The "N new" ticker polls separately.

### 6. Duplicate detection

A `Map<imageId, position>` tracks where each image lives. If a re-fetch returns an
image at a different position (result set shifted due to deletions), the old position
is cleared. This is important — result sets DO shift in practice.

---

## The Limits

| Limit | Detail |
|---|---|
| **100k cap** | `ctrl.maxResults = 100000`. ES `max_result_window` bumped to 101k. ~1.1% of PROD's 9M images. |
| **`from/size` at depth** | At offset 50k, ES must score and skip 50k docs. Progressively slower. The Scala source acknowledges this: *"consider scrolling by datetime offsets."* |
| **No DOM recycling** | Every cell that's ever been visible keeps its Angular scope. Heavy scrolling → sluggish digest cycles. |
| **`compact()` is O(n)** | Creates a dense array from the 100k sparse array on every `loadRange` callback. |
| **Browser scrollHeight** | At 100k / 5 columns = 20k rows × 303px ≈ 6M px. Fine. At 9M images → 545M px. Impossible. |
| **No `search_after`** | Uses plain `from/size` with the ES limit bumped. Works for 100k. Would not work for 9M. |

---

## What Kupua Should Take From This

### Take: sparse-array-with-pre-sized-virtualizer

The core insight is powerful: **pre-size the container to `total` items, load pages on
demand**. TanStack Virtual already supports `count` > loaded data (it calls
`estimateSize` for all rows). The missing piece is gap detection: when the user scrolls
to row 50,000, detect the empty window and fetch it.

This could be the **Phase 2 first step** — before building a custom scrubber. Set
`virtualizer.count = Math.min(total, ~1M)`, use `from/size` for jumps up to the cap.
The native scrollbar works immediately.

**Browser scrollHeight budget:** at 32px/row, ~1M rows before hitting the ~33M px
browser cap. That's 10× kahuna's 100k limit and covers the vast majority of filtered
queries. Only the "all 9M images, no filter" case needs the custom scrubber.

### Take: result set freezing with `until` timestamp

Kupua's `newCountSince` serves a similar purpose for the ticker but isn't used to
freeze the result set for pagination. When windowed/sparse scroll arrives, add
`until: frozenTimestamp` to all pagination requests so new uploads don't shift offsets.

### Take: duplicate detection for sparse loading

Kahuna's `imagesPositions` Map exists because real result sets shift (deletions,
re-indexing). Kupua's current `loadMore` offset guard handles double-calls but not
the "same image at two different offsets" case. The sparse approach will need a
similar dedup mechanism.

### Take: reactive grid layout computation

The RxJS pipeline that computes `columns$`, `cellWidth$` from container width is
elegant. Kupua's table doesn't need this (fixed columns), but the future **grid view**
will need exactly this pattern — responsive column count from container width. Worth
noting for `useListNavigation` geometry callbacks.

---

## Where Kupua Must Surpass Kahuna

### 1. True DOM virtualisation (already done)

Kahuna toggles `display: none` on 100k Angular scopes. Kupua uses TanStack Virtual —
only ~20-40 DOM rows exist at any time, recycled as the user scrolls. This is strictly
better and already implemented.

### 2. Beyond 100k — `search_after` for deep pagination

Kahuna caps at 100k. Kupua should handle the full 9M dataset. The plan:

- **Up to ~1M rows:** sparse array + native scrollbar + `from/size` (kahuna's
  approach, but 10× the cap thanks to table's smaller row height)
- **Beyond ~1M rows:** custom scrubber + `search_after` with PIT for sequential
  pages + `from/size` for random jumps within the ES window

### 3. Jump-to-image by ID

Kahuna can't do this at all. Kupua's `useDataWindow.seekToImage(id)` will:
1. Count query: "how many docs before this image in the current sort?"
2. Fetch the target window
3. Scroll the virtualizer to that offset

This enables: return-from-detail focus on any image, paste-ID-then-locate, and
bookmark deep positions.

### 4. Bidirectional window sliding

Kahuna's sparse array only grows — pages are never evicted. At 100k × (thumbnail +
metadata), this consumes significant memory. Kupua should evict distant pages,
keeping a sliding window of ~500-1000 rows. Scroll up → load previous page, evict
distant forward page. This bounds memory regardless of how far the user scrolls.

### 5. No digest cycle tax

Kahuna's 80ms scroll debounce exists because Angular's digest cycle is expensive
with 100k scopes. React + RAF-based virtualisation doesn't need it. Kupua's scroll
response will be smoother.

### 6. Density-independent data window

Kahuna's `gu-lazy-table` is tightly coupled to the grid layout (cells with absolute
positioning). Kupua's `useDataWindow` will be density-independent — the same hook
serves table, grid, and single-image views. Kahuna would need a separate
implementation for each layout.

---

## Implementation Implications for `useDataWindow`

The kahuna analysis confirms that `useDataWindow` should manage:

1. **A sparse/windowed data structure** — not a simple dense array
2. **Gap detection** — "which slots in the visible range are empty?"
3. **On-demand fetching** — `loadRange(start, end)` triggered by gap detection
4. **Result set freezing** — `until` timestamp to stabilise offsets during scrolling
5. **Dedup** — track image positions, handle shifts from deletions
6. **Page eviction** — bound memory by dropping distant pages (kahuna doesn't do this)
7. **`seekToImage(id)`** — count query → offset → fetch window (kahuna can't do this)

The virtualizer's `count` should be set to `Math.min(total, ~1M)` for the native-
scrollbar tier, or `total` with a virtual-position-to-real-offset mapping for the
custom-scrubber tier.

---

## Summary

Kahuna's approach is simpler than expected: **sparse array + native scrollbar + plain
`from/size`**. No `search_after`, no custom scrubber, no sliding window. It works
because they accept a 100k cap and the browser scrollHeight limit isn't hit at 303px
cells.

Kupua can start with the same pattern (sparse array, native scrollbar) and go much
further: 10× the row cap via smaller row height, `search_after` for deep pagination,
jump-to-image, bidirectional window eviction, and density-independent data access.
The key architectural enabler is the `useDataWindow` extraction from ImageTable.

