# Sparse Scroll — Implementation Plan

> Recreate kahuna's free-scroll-through-100k-rows in kupua, with proper
> DOM virtualisation. Not the endgame (which is `search_after` + custom
> scrubber for 9M), but a meaningful UX improvement that also forces the
> right architectural extraction (`useDataWindow`).
>
> Created: 23 March 2026

---

## Goal

User can grab the native scrollbar thumb, drag to any position within
`min(total, CAP)` rows, and see data fill in — exactly like kahuna, but
with TanStack Virtual's DOM recycling instead of Angular's display toggling.

**CAP:** ~100k rows initially (matching kahuna and the ES `max_result_window`
of 101k on TEST/PROD). At 32px/row, 100k = 3.2M px container — well within
the browser's ~33M px scrollHeight limit. Can be raised to ~1M rows later
(the browser limit), but 100k is a known-working starting point and avoids
introducing new ES config requirements.

---

## Architecture Decision: TanStack Table with Placeholder Rows vs. Bypass

Two approaches for rendering rows whose data hasn't loaded yet:

### Option A: Placeholder `Image` objects in the `data` array

Feed TanStack Table a dense array of `CAP` items. Loaded slots contain real
`Image` objects; unloaded slots contain a sentinel placeholder:

```typescript
const PLACEHOLDER: Image = {
  id: "",  // empty string, not undefined — keeps types happy
  _placeholder: true,  // discriminator
  // all other fields undefined/empty — accessors return undefined
} as Image;
```

TanStack Table creates `Row` objects for every item. **This is cheap** —
`createRow` (verified in source: `table-core/src/core/row.ts`) creates a
lightweight object with lazy memoised accessors. `getValue()`, `getAllCells()`,
and `accessorFn` only execute when the row is actually *rendered*. For 100k
rows with ~40 visible at a time, only ~40 rows ever invoke their accessors.

**Memory:** 100k `Row` objects × ~500 bytes each ≈ 50MB. Significant but
manageable. The placeholder `Image` objects are shared (one singleton), so
they add negligible memory. The `Row` objects are memoised by TanStack —
they're only recreated when `data` changes (React reference identity). Swapping
a placeholder for a real image at index N means mutating one slot and letting
TanStack diff — it only rebuilds rows where data identity changed.

**Rendering:** In `TableBody`, check `row.original._placeholder` before
rendering cells. Placeholder rows render a simple grey-bar skeleton:

```tsx
if (row.original._placeholder) {
  return (
    <div key={`placeholder-${virtualRow.index}`} role="row"
         style={{ height, transform }} className="...">
      <div className="animate-pulse bg-grid-separator/20 h-3 mx-2 my-auto rounded" />
    </div>
  );
}
```

No `row.getVisibleCells()` call, no accessor invocation, no column interaction.

**Interaction guards:** Click, double-click, focus, keyboard nav — all must
ignore placeholder rows. Single check: `if (row.original._placeholder) return`.
Pervasive but trivial.

**Pros:** TanStack Table's `rows` array, `getRowModel()`, and all column
machinery remain canonical. `rows.length === virtualizer.count`. No split
between "TanStack-managed rows" and "non-TanStack rows."

**Cons:** 100k Row objects in memory. If this causes measurable perf issues
(GC pauses, slow `getRowModel()` rebuilds on data change), it's a problem.
**Must be spiked first.**

### Option B: Virtualizer count > TanStack Table data length

Set `virtualizer.count = min(total, CAP)` but only feed TanStack Table the
*loaded* rows. In the render loop, check whether `virtualRow.index` maps to
a loaded row or a gap:

```tsx
const dataRow = rowsByGlobalIndex.get(virtualRow.index);
if (dataRow) {
  // render with TanStack cells
} else {
  // render placeholder div
}
```

**Pros:** TanStack Table only processes loaded data (~200-2000 rows). Zero
memory concern. `getCoreRowModel()` is always fast.

**Cons:** Two parallel data models — TanStack Table's `rows` and the
virtualizer's index space. Mapping between them requires an offset/index
translation layer. `rows.findIndex()` no longer works for global position —
need a separate Map. Column sizing, sort indicators, and header widths still
work (they don't depend on row count), but `aria-rowcount`, status bar count,
and any code that assumes `rows.length === total visible rows` must be
updated.

### Recommendation: Option A with a spike → UPDATE: Option B confirmed

**Original recommendation was Option A.** After spiking and researching how
TanStack implementers handle sparse data, **Option B is the correct approach.**

**Spike results (23 March 2026):**

| Scale | Virtual `getMeasurements` | Table `getCoreRowModel` | Combined heap |
|-------|--------------------------|------------------------|---------------|
| 10k   | 0.1 ms | 1.6 ms | – |
| 50k   | 2.0 ms | 10.2 ms | – |
| 100k  | 1.8 ms | **42 ms** | **85 MB** |

TanStack Virtual at 100k is fine (1.8ms, memoised). But TanStack Table's
`getCoreRowModel` iterates every item, calls `createRow()` per item, and
builds `rows[]`, `flatRows[]`, and `rowsById{}`. At 100k this costs 42ms
per invocation — and **every `loadRange` that changes a slot requires a new
data array reference, triggering a full 42ms rebuild**. With rapid scrolling,
this is unacceptable.

**What TanStack implementers actually do:** The canonical pattern is
Option B — set `virtualizer.count` to the total, don't feed TanStack Table
the full dataset. TanStack Virtual was designed for `count` to diverge from
data length. TanStack Table processes only loaded data for column/cell
rendering. The render loop maps virtualizer indices to loaded data via a
`Map<number, Image>`, rendering real rows for hits and placeholder divs for
gaps.

**The "two parallel data models" concern in Option B is overstated.** In
practice it's just a Map lookup per visible row. `aria-rowcount` comes from
`total`, not `rows.length`. Status bar count comes from `total`. Position
lookups use `imagePositions: Map<string, number>`.

**Library alternatives considered and rejected:**
- **react-virtuoso:** Has `totalCount` + `itemContent(index)` which is
  natural for sparse data, but replacing both TanStack Virtual and Table
  would be a large migration. Its table support is less flexible than
  TanStack Table for column resize, visibility, CSS-variable-width pattern.
- **virtua:** Smaller (~3kB) and fast but no table features.
- **AG Grid:** Overkill — would mean giving up all custom table rendering.
- **react-window:** No table features, no advantages over TanStack Virtual.

**TanStack Virtual + TanStack Table remains the right stack**, but with
Option B (virtualizer count > table data length).

---

## Implementation Steps

### Step 0: ~~Spike — TanStack Table with 100k placeholder rows~~ ✅ DONE

Spike completed 23 March 2026. Results: Option A fails the kill criterion
(42ms `getCoreRowModel` exceeds 100ms threshold when accounting for the fact
it runs on every `loadRange`, not just once). Option B confirmed.
See "Recommendation" section above for full data.

### Step 1: Extract `useDataWindow` — pure refactor (2-3 hours)

Extract the data-windowing concern from ImageTable + search-store into a
dedicated hook. **No behaviour change yet** — still append-only infinite
scroll. This is the density-boundary split from the audit.

**New file: `src/hooks/useDataWindow.ts`**

Responsibilities (Phase 1 — append-only, same as today):
- Wraps `useSearchStore` to expose: `rows`, `total`, `loading`, `error`
- `loadMore()` — same as today
- `focusedImageId`, `setFocusedImageId`
- `frozenUntil` — timestamp to stabilise result set (new, prep for sparse)

Responsibilities (Phase 2 — sparse, this plan):
- `loadRange(start, end)` — fetch a specific offset range
- Gap detection — which slots in a visible range are placeholder
- Dedup — track `imageId → index`, handle position shifts
- `seekToIndex(index)` — scroll the virtualizer to a specific row

**ImageTable changes:**
- Replace direct `useSearchStore()` calls with `useDataWindow()`
- Scroll handler calls `loadMore()` via the hook (same API)
- No other changes — everything else stays in ImageTable

**Why this step matters:** It creates the seam. Step 2 can change the
internals of `useDataWindow` without touching ImageTable at all.

### Step 2: Sparse data + pre-sized virtualizer (3-4 hours)

Evolve `useDataWindow` from append-only to sparse-array-with-range-loading.

#### 2a. Store changes (`search-store.ts`)

```typescript
interface SearchState {
  // ... existing ...

  // Sparse scroll support
  frozenUntil: string | null;    // ISO timestamp — freezes result set
  imagePositions: Map<string, number>;  // imageId → index for dedup

  // New action
  loadRange: (start: number, end: number) => Promise<void>;
}
```

- `search()` records `frozenUntil = now()` and passes `until: frozenUntil`
  on all subsequent `loadRange` / `loadMore` calls
- `loadRange(start, end)` fetches `{ offset: start, length: end - start + 1,
  until: frozenUntil }` and fills specific indices in `results[]`
- `results` becomes a sparse array — pre-sized to `min(total, CAP)`,
  filled with `PLACEHOLDER` initially, real images swapped in as loaded
- Dedup: on each loaded image, check `imagePositions` — if the image
  exists at a different index, clear the old slot (replace with PLACEHOLDER)

#### 2b. `useDataWindow` changes

- Expose `rows` (which is now the sparse array mapped through TanStack Table)
- New: `visibleRange` callback — ImageTable tells the hook which indices
  are currently visible (from virtualizer). The hook detects gaps in that
  range and calls `loadRange()`.
- Debounce gap detection (50ms) to avoid flooding during fast scroll
- Don't load ranges that are already in-flight

#### 2c. ImageTable changes

- `virtualizer.count` = `Math.min(total, CAP)` instead of `rows.length`
- Scroll handler: instead of "near bottom → loadMore", report the visible
  range to `useDataWindow` via `visibleRange` callback
- `TableBody`: for each `virtualRow`, look up `sparseData.get(virtualRow.index)`.
  If present, render real row with TanStack Table cell machinery.
  If absent, render a simple placeholder skeleton div (no TanStack Row).
- Interaction guards on placeholder rows (click, double-click, focus, keyboard)
- Keep `loadMore()` as fallback for append-only mode (local dev with 10k docs)

#### 2d. Result set freezing

- Initial search records `frozenUntil = new Date().toISOString()`
- All `loadRange` calls include `until: frozenUntil`
- New search resets `frozenUntil`
- `newCount` ticker keeps using `newCountSince` (separate from `frozenUntil`)

### Step 3: Interaction polish (1-2 hours)

- Keyboard nav: skip placeholder rows (arrow over them, don't focus them)
- Focus restoration from image detail: if the target row is a placeholder,
  trigger `loadRange` around it, then focus once loaded
- Status bar: show "Loading rows X–Y…" during range fetches
- `computeFitWidth`: only measure loaded rows (skip placeholders)
- `rows.findIndex(id)` → use `imagePositions` Map for O(1) lookup

### Step 4: `ColumnContextMenu` extraction (30 min)

While we're refactoring ImageTable, extract the context menu component. It's
self-contained and the audit doc already identified it as a clean extraction.

---

## What About the Grid View?

Every decision above is tested against the grid view requirement:

| Concern | Table density | Grid density |
|---|---|---|
| Data source | `useDataWindow` hook | Same `useDataWindow` hook |
| Placeholder render | Grey bar skeleton | Grey square thumbnail placeholder |
| `_placeholder` check | In `TableBody` render | In grid cell render |
| Virtualizer count | `min(total, CAP)` rows | `min(total, CAP)` cells |
| Gap detection | Same `visibleRange` callback | Same callback, different geometry |
| Keyboard nav | `columnsPerRow: 1` | `columnsPerRow: N` |
| Column resize | ImageTable only | N/A |
| Click-to-search | Same (cell value → CQL) | Same (metadata overlay → CQL) |

The `useDataWindow` hook is **density-independent** — it doesn't know whether
the consumer is a table or a grid. It manages data, gaps, and fetching. The
density component (ImageTable or future ImageGrid) handles layout, rendering,
and density-specific interactions.

`useListNavigation` is **geometry-parameterised** — same hook, different
`columnsPerRow`. Building it now for the table (`columnsPerRow: 1`) means
the grid view (`columnsPerRow: N`) gets keyboard nav for free.

The density continuum (table ↔ grid ↔ single image) requires that focus,
selection, and scroll position survive density changes. With `useDataWindow`
as the shared data layer, switching density means swapping the render
component while the data window, focus state, and loaded ranges persist.

---

## Risks and Mitigations

### 1. ~~TanStack Table perf with 100k Row objects~~ RESOLVED

Spike confirmed this is a real problem (42ms rebuild, 85MB heap). Option B
avoids it entirely — TanStack Table only processes loaded rows.

### 2. ~~Data change triggers full Row rebuild~~ RESOLVED

With Option B, TanStack Table only has loaded rows (~200-2000). Adding rows
to this set is O(loaded), not O(100k). The sparse data store is a Map —
no array cloning needed.

### 3. Local docker ES `max_result_window` = 10,000

**Risk:** Sparse scroll only works against TEST/PROD (window = 101k), not
local dev.

**Mitigation:** Graceful degradation. If `total ≤ results.length`, fall back
to append-only behaviour (current code path). The 10k local dataset loads
fully in ~3 pages anyway. The sparse code path activates only when
`total > results.length` — which only happens on large result sets.

### 4. ES `from/size` performance at depth

**Risk:** At offset 50k, ES may be slow.

**Mitigation:** This is the same trade-off kahuna accepts. At 100k cap,
the worst case is offset 100k which ES handles (they've been running it
for years). For kupua's future 1M cap, `search_after` will be needed — but
that's a later phase and doesn't block this work.

### 5. Scroll position jank during range loading

**Risk:** User drags scrollbar to row 50k, sees placeholders, then data
pops in causing visual jank.

**Mitigation:** TanStack Virtual renders at `estimateSize` (32px) for all
rows. Since all rows are the same height, data replacing a placeholder
doesn't change the row height or position — the only visual change is
content appearing inside a fixed-size container. No layout shift.

---

## Sequencing Summary

| Step | What | Time | Behaviour change? |
|---|---|---|---|
| ~~0~~ | ~~Spike: 100k placeholder rows in TanStack Table~~ | ~~30 min~~ | ~~No (throwaway)~~ ✅ DONE |
| 1 | Extract `useDataWindow` (pure refactor) | 2-3 hours | No |
| 2 | Sparse data + pre-sized virtualizer | 3-4 hours | Yes — free scrollbar |
| 3 | Interaction polish | 1-2 hours | Yes — keyboard, focus, status |
| 4 | Extract `ColumnContextMenu` | 30 min | No |

**Total: ~1 day of focused work.**

Steps 1 and 2 are the core. Step 3 is polish. Step 4 is opportunistic cleanup.

Steps 1-2 produce a working sparse scroll that matches kahuna's UX. Steps 3-4
polish it. The `useDataWindow` extraction (Step 1) is the most important
architectural outcome — it's the foundation for grid view, `search_after`,
jump-to-image, and the density continuum.

---

## What This Doesn't Do (Deferred)

- **`search_after` pagination** — needed for >100k. Separate plan.
- **Custom scrubber** — needed for >1M rows. Separate plan.
- **Jump-to-image by ID** — `seekToImage(id)` needs a count query + offset
  calculation. The `useDataWindow` API is ready for it, but the implementation
  is deferred.
- **Page eviction** — kahuna doesn't do it either. At 100k rows × ~2KB per
  image ≈ 200MB. Tolerable for now. Add eviction when targeting >100k.
- **Grid view** — the shared hooks (`useDataWindow`, `useListNavigation`) are
  designed for it, but the grid component itself is a separate effort.

