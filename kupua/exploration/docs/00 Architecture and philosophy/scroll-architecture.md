# Scroll Architecture — How Kupua Browses Millions

> **Audience:** Staff Engineers reviewing the approach, future agents, and
> anyone inheriting this codebase.
>
> **§0** frames why the architecture has this shape.
> **§1–§3** are accessible to anyone familiar with web UIs.
> **§4–§6** require understanding of React rendering, virtual scrolling, and
> Elasticsearch internals.

---

## §0 Why This Architecture Exists

Kupua presents a single ordered list of images. Table, grid, image detail,
and fullscreen preview are **different densities** of the same list — not
separate pages. Transitions between them feel like zooming, not navigating.
(See `frontend-philosophy.md` for the full design philosophy.)

This has an architectural consequence: **the user's context must survive
every transition.** We call this the "Never Lost" principle — focus,
selection, scroll position, and eventually edit state all persist across
density changes, sort changes, and filter changes. The scroll architecture
below exists to uphold that principle at the scale of millions.

The central constraint is the **buffer architecture.** We can hold at most
~1,000 images in memory (bounded by `BUFFER_CAPACITY`). For a result set
of 1.3M, that's 0.08% coverage. Every mechanism described below — the
windowed buffer, cursor-based pagination, the scrubber, seek strategies,
scroll compensation — follows from that single constraint: we can only see
a tiny window into a vast ordered list, and the user must never feel it.

---

## §1 The Problem

The Guardian's image library contains ~9 million documents in Elasticsearch.
Users need to scroll through filtered views that range from 50 images to the
full 9M. The browser's native scrollbar and `from/size` pagination cannot
serve this.

### Why the browser can't help

| Constraint | Limit | Impact |
|---|---|---|
| Browser max element height | ~33,554,432px (Chrome) | At 303px/row and 4 columns, ~9M images need ~680M px. 20× over the limit. |
| `from/size` pagination | Configurable `max_result_window` (101k on PROD) | ES must score + skip all preceding docs. O(n) to reach position n. At 500k it's multiple seconds. |
| Memory | ~5–10KB per image document | 9M × 8KB = 72GB. Can't hold the full set in memory. |

Even with aggressive virtualisation, the native scrollbar's pixel-to-position
mapping breaks above ~100k items. You need a different control for position.

### Why this is different from Google Photos, iCloud, immich

These services hold the **full ID list** in memory and use O(1) random
access to any position:

| Service | Strategy | Why it works |
|---|---|---|
| Google Photos | Server sends full position map | They control the backend; IDs are small (~20 bytes) |
| iCloud Photos | Core Data with pre-computed section indices | Local SQLite; full catalogue fits in RAM |
| immich | Full ID list in memory, client-side virtual scroll | Self-hosted; typical libraries are <1M items |

At 9M docs × ~40 bytes per sort key = **360MB** just for the position map.
At the historical peak of 57M (pre-deduplication), that's 2.3GB. We can't
hold a position map. We can't random-access by offset past 100k. We had to
invent a different approach.

---

## §2 The Architecture at a Glance

Kupua uses a **windowed buffer** with **cursor-based pagination** and a
**custom scrubber** that replaces the native scrollbar.

```
┌─────────────────────────────────────────────────────────┐
│                    9 million results                    │
│  ┌───────────┐                                          │
│  │ ← extend  │◄── reverse search_after (startCursor)    │
│  ├───────────┤                                          │
│  │           │                                          │
│  │  Buffer   │  1,000 items max (BUFFER_CAPACITY)       │
│  │           │  bufferOffset maps buffer[0] → global    │
│  │           │                                          │
│  ├───────────┤                                          │
│  │  extend → │──► forward search_after (endCursor)      │
│  └───────────┘                                          │
│                                                         │
│      Scrubber thumb ═══════════►  seek(globalOffset)    │
│      (proportional to total)      clears buffer,        │
│                                   refills at target     │
└─────────────────────────────────────────────────────────┘
```

**Three operations move through the data:**

1. **Extend forward/backward** — sequential browsing. `search_after` with
   a cursor. O(page_size), no depth limit. Appends or prepends to the
   buffer; evicts from the opposite end to stay within capacity.

2. **Seek** — random access. Scrubber click/drag. Clears the buffer and
   fills it at the target position. Uses `from/size` for shallow offsets
   (<10k), percentile estimation for deep date/numeric sorts, composite
   aggregation walk for deep keyword sorts.

3. **Sort-around-focus** — after a sort change, finds the focused image's
   new position and seeks to it. The user sees "Never Lost" — their image
   stays focused regardless of how it reorders.

**The Scrubber** replaces the native scrollbar. It's a vertical track with
a proportional thumb, position tooltip with sort-context labels (dates,
keywords), and tick marks that function as a density map. Two modes:
- **Scroll mode** (≤1000 results): all data in buffer; drag directly
  scrolls content.
- **Seek mode** (>1000 results): drag previews position via tooltip;
  release triggers seek.

---

## §3 The User Experience — What It Feels Like

### Normal scrolling

The user scrolls with mouse wheel or trackpad. TanStack Virtual renders
~15–30 visible rows from the buffer. When the viewport approaches the
buffer edge (within `EXTEND_THRESHOLD = 50` items), `reportVisibleRange`
triggers `extendForward` or `extendBackward`. The extend fetches
`PAGE_SIZE = 200` items via `search_after`, appends/prepends them, and
evicts from the opposite end if the buffer exceeds `BUFFER_CAPACITY = 1000`.

The user never sees loading states during normal scrolling. The 50-item
threshold means extends fire ~3–5 screenfuls before the viewport runs out
of data.

### Deep seek (scrubber click at 50% of 1.3M results)

1. User clicks the scrubber track at 50% → `seek(650000)`.
2. `seek()` sets `SEEK_COOLDOWN_MS = 100ms` — blocks all extends.
3. Deep path: ES `percentiles` aggregation estimates the `uploadTime` at
   the 50th percentile → e.g. `2024-08-15T14:22:00.000Z`.
4. Forward `search_after([estimated_date, ""])` fetches 200 items starting
   there. Then a backward `search_after` (reversed, halfBuffer ≈ 100 items)
   fetches items before the cursor. Combined buffer ≈ 300 items with the
   user's viewport in the middle (~100 items of headroom above).
5. `countBefore` query returns the exact global offset we landed at.
   `bufferOffset` adjusted for backward items: `actualOffset - backwardHits`.
6. Buffer is replaced. `_seekGeneration` increments.
7. `useScrollEffects` effect #6 fires: reverse-computes the local index
   that corresponds to the user's current `scrollTop` → typically delta
   <1 row → **no-op**. Zero visible flash.
8. At 150ms (`SEEK_DEFERRED_SCROLL_MS`), a synthetic scroll event triggers
   `reportVisibleRange`. With ~100 items of headroom, `startIndex > 50`
   (EXTEND_THRESHOLD) — **no immediate backward extend**. Forward extend
   fires if needed.
9. As the user scrolls up past the headroom, `extendBackward` fires and
   prepends to off-screen content — **invisible** by construction.
10. Post-extend cooldown (50ms) prevents cascading compensations.

Total time: ~250–600ms on real ES (one extra backward fetch, ~50-100ms).
Settle-window content shift: **0 items** (was ~3 items before bidirectional seek).

### Sort-around-focus ("Never Lost")

1. User changes sort from `uploadTime desc` to `credit asc`.
2. URL updates → `useUrlSearchSync` → `search("focused-image-id")`.
3. `search()` immediately fetches page 1 of the new sort order → user sees
   fresh results at position 0 within ~100ms.
4. In the background: `_findAndFocusImage` runs:
   a. Fetches the focused image with current sort → gets its `sort[]` values.
   b. `countBefore` → exact global offset (e.g. position 847,291).
   c. If offset is within the current buffer → just scroll to it. Done.
   d. If outside → `_loadBufferAroundImage` (bidirectional `search_after`
      from the cursor) → buffer centered on the image.
5. `sortAroundFocusGeneration` increments → `useScrollEffects` effect #9
   scrolls to the focused image, preserving its viewport-relative position
   (the ratio was saved synchronously before the async search).

The user sees: results appear at the top → brief "Finding image…" status →
view jumps to the focused image at its new position. The image is at the
same vertical position in the viewport as before the sort.

### Keep-position across density switches (table ↔ grid)

When switching from table to grid (or vice versa):

1. **Unmount save:** `useScrollEffects` cleanup captures the focused image's
   viewport-relative ratio: `(rowTop + headerOffset - scrollTop) / clientHeight`.
   Stored as module-level state (not React state — survives component swap).

2. **Mount restore:** New component's mount effect reads the saved ratio,
   waits two `requestAnimationFrame`s (for ResizeObserver + virtualizer
   measurement), computes `scrollTop = rowTop + headerOffset - ratio × clientHeight`,
   and applies it directly to the DOM.

3. **Edge clamping:** If the image would be partially off-screen (ratio puts
   it behind the sticky header or below the viewport), it snaps to the
   nearest edge — fully visible.

4. **Drift prevention:** `abortExtends()` sets a 2-second cooldown before
   the restore, preventing `extendBackward` → prepend compensation →
   browser scroll clamping → pixel loss on each cycle.

---

## §4 Swimming, Timing, and Limits

### The swimming problem

"Swimming" is when visible images shift position during buffer prepend
operations. It's the central engineering challenge of prepend-then-compensate
virtual scrolling.

When `extendBackward` prepends 200 items to the buffer:

1. React re-renders with 400 items (200 new + 200 existing).
2. The virtualiser grows — new rows appear above the viewport.
3. `useLayoutEffect` adjusts `scrollTop += prependedRows × rowHeight`
   (e.g. +8,787px for 29 grid rows × 303px).
4. **The contract of `useLayoutEffect`:** runs after DOM mutation, before
   browser paint. So the compensation should be invisible.

**But it's not always invisible.** TanStack Virtual may need its own
internal re-render before the correct row count is established. On fast
GPUs with high refresh rates, the browser may composite an intermediate
frame between React's DOM mutation and the `scrollTop` adjustment. This
is a **fundamental tension** in prepend-then-compensate strategies. Every
virtual scroll library that supports prepending has this problem.

### The fix: bidirectional seek

The problem was geometric, not temporal. After seek, the user sat at the
top of a 200-item buffer. The first `extendBackward` prepended directly
above visible content — the compensation was *almost* invisible but not
quite (~3 images shifting for one frame).

The fix changes **where the user sits in the buffer**, not when extends
fire. Deep seek paths now fetch backward items (halfBuffer ≈ 100) in
addition to the forward fetch (PAGE_SIZE = 200). Combined buffer ≈ 300
items. The user's viewport lands in the middle, with ~100 items of
headroom above. Both `extendBackward` and `extendForward` now operate on
off-screen content — swimming is eliminated by construction, not timing.

**Settle-window content shift: 0 items** (measured on both local and real
1.3M-doc data; was ~3 items before).

This is the insight that matters: no amount of cooldown tuning can make a
prepend-directly-above-the-viewport invisible on all hardware. But if the
prepend happens 100 items above the viewport, it doesn't need to be
invisible — it's literally off-screen.

### The timing chain

Bidirectional seek eliminated swimming, but the timing chain still serves
two purposes: (1) preventing extends from racing against the buffer
replacement during seek, and (2) spacing out consecutive prepends so each
`scrollTop` compensation settles before the next fires.

```
seek() called
  ├── _seekCooldownUntil = Date.now() + 100ms     ← blocks ALL extends
  ├── ES fetch (async, ~100–500ms)
  ├── set() — buffer replaced, _seekGeneration++
  │
  ├── Effect #6: reverse-compute scrollTarget       ← zero flash
  │     └── setTimeout(150ms) → synthetic scroll
  │
  ├── 100ms: cooldown expires
  ├── 150ms: deferred scroll fires
  │     ├── reportVisibleRange → extendForward
  │     └── reportVisibleRange → extendBackward     ← first prepend
  │           ├── ES fetch (async)
  │           ├── set() — buffer grows, _prependGeneration++
  │           ├── useLayoutEffect: scrollTop += compensation
  │           └── _seekCooldownUntil = Date.now() + 50ms   ← POST_EXTEND_COOLDOWN
  │
  └── 200ms+: next extend can fire (50ms after previous)
```

**Key constants** (in `tuning.ts`):

| Constant | Value | Purpose |
|---|---|---|
| `SEEK_COOLDOWN_MS` | 100ms | Post-arrival extend block — virtualiser settles |
| `SEEK_DEFERRED_SCROLL_MS` | 150ms | = cooldown + 50ms — first extends fire in stable state |
| `POST_EXTEND_COOLDOWN_MS` | 50ms | Spaces out consecutive backward extends |
| `SEARCH_FETCH_COOLDOWN_MS` | 2000ms | Blocks extends during in-flight search/abort |

The timing chain was tuned in April 2026 (see `worklog-testing-regime.md` Session 5).
Original values were 700 / 800 / 200 — reduced 5.3× with no stability regressions,
grid jank improved 50% at fast scroll speed.

### What didn't work (historical)

| Approach | Outcome |
|---|---|
| Increased cooldown 700→1500ms | Still not long enough; possibly caused freezes |
| Suppress prepend compensation | Catastrophic — visible images changed on every scroll |
| `_postSeekBackwardSuppress` flag | Prevented swimming but also prevented scrolling up |
| Flag + 200ms cooldown | Swimming returned at 200ms |
| `requestAnimationFrame` instead of `useLayoutEffect` | Worse |
| `overflow-anchor: none` | No effect |
| Remove flag + cooldowns only (no bidirectional seek) | 99% invisible, ~1% cosmetic swim remained |

### Cost model

Each seek path makes a different number of ES round-trips:

| Path | Round-trips | Typical latency | When |
|---|---|---|---|
| Shallow from/size | 1 | 20–50ms | offset < 10k |
| End key fast path | 1 | 50–100ms | offset + PAGE_SIZE ≥ total |
| Percentile (deep date/numeric) | 3–4 | 250–600ms | percentile + search_after + backward + countBefore |
| Keyword composite (deep keyword) | 4–15 | 200–800ms | composite pages + search_after + countBefore ± binary search |
| Null-zone seek | 3–4 | 250–600ms | distribution lookup + filtered search_after + backward + countBefore |

Normal scrolling (extend forward/backward) is always 1 round-trip, 10–50ms.
Sort-around-focus is 2–4 round-trips (getById + countBefore + optional
bidirectional search_after). First scrubber interaction pays 2 round-trips
for the sort distribution (stats + histogram, ~15–50ms for dates, ~200–500ms
for keywords); cached after that.

### When this architecture breaks

The approach has known limits. None are hit at current scale (1.3M–9M),
but they exist:

**TDigest percentile error at extremes.** ES's TDigest sketch has ~1–5%
error, worse at the 0th and 100th percentile tails. At 9M docs, 5%
error = 450k positions. This doesn't affect the user (we correct with
`countBefore`), but it means the initial buffer window might be far from
the target — requiring the backward fetch to cover more ground. If error
exceeds halfBuffer (100 items as headroom), the user sees content from the
wrong neighbourhood for one frame before the correction. Not observed in
practice, but the mechanism exists.

**`countBefore` on heavily skewed data.** `countBefore` is a single
`_count` query — fast regardless of depth. But the compound boolean query
it constructs (multi-clause range + term) can be slow if ES needs to
evaluate it against a very large number of tied values. With 400k docs
sharing the same credit "PA", the tiebreaker clause (`id < "abc..."`) is
doing work. Observed: ~5–10ms per query at 1.3M. Not profiled at 9M.

**Keyword composite walk at extreme cardinality.** `findKeywordSortValue`
pages through a composite aggregation (1000 buckets per page). At 100k+
unique values this is 100+ pages × ~50ms = 5 seconds. Current fields peak
at ~50k unique values (credit). A field with 1M+ unique values would need
a different strategy (e.g. terms aggregation with min_doc_count, or
percentile on the keyword's hash). Filename sort was removed as it took ~15s.

**`search_after` cursor invalidation.** If the underlying data changes
between the forward and backward fetches of a bidirectional seek (document
deleted, re-indexed with new sort values), the cursors can become
inconsistent. PIT provides snapshot isolation on non-local ES, but PIT
keepalive is only 1 minute. A user who leaves the tab for >1 minute and
then seeks will get a PIT expiration, fall back to non-PIT mode, and
potentially see a small cursor inconsistency. Graceful degradation, not
a crash — but the buffer might have a gap or duplicate near the cursor
boundary.

**The id tiebreaker assumes uniform distribution.** The binary search
refinement (§5) works because SHA-1 hashes are uniformly distributed in
hex space. If image IDs were ever changed to sequential integers or
UUIDs-v7 (time-sorted), the binary search would degenerate. The hex
interpolation would overshoot or undershoot systematically. Fix: detect
the ID format and switch to linear interpolation for sequential IDs.

### Buffer corruption defence

Five layers protect against stale data from racing extends:

1. `abortExtends()` before scroll reset (primary).
2. `search()` sets a 2-second extend cooldown.
3. Seek cooldown refreshed at data arrival.
4. Abort check before PIT-404 retry in `es-adapter.ts`.
5. `abortExtends()` exposed on the store for imperative callers.

All nine buffer-corruption regression tests (`buffer-corruption.spec.ts`)
must pass on every change.

### PIT lifecycle

Point In Time (PIT) provides consistent pagination on non-local ES:

- Opened on first search, reused for extends and seeks.
- 1-minute keepalive (reduced from 5m — see `es-audit.md`).
- Generation counter (`_pitGeneration`): seek/extend capture the
  generation at call start; if `search()` opened a new PIT mid-flight,
  they skip the stale PIT (avoids 404 round-trip).
- 404/410 fallback: retries without PIT. Graceful degradation at the
  cost of snapshot isolation for that single request.

### Image detail position restore

When the user reloads the page while viewing image detail at a deep offset,
the offset cache (`sessionStorage`) stores both the numeric offset AND the
`search_after` cursor. `restoreAroundCursor` uses the cursor for exact
restoration via bidirectional `search_after` — guaranteed to land the image
in the buffer regardless of depth.

---

## §5 Deep Seek — How We Random-Access Without Random Access

ES `search_after` is sequential — it can only go forward from a known
cursor. There is no "give me the document at position 500,000" API. We
use different strategies depending on the sort field type and depth.

### Decision tree

```
seek(globalOffset)
  │
  ├─ offset + PAGE_SIZE >= total?
  │   └── YES: End key fast path — reverse search_after, no cursor
  │
  ├─ offset < DEEP_SEEK_THRESHOLD (10k)?
  │   └── YES: Shallow seek — plain from/size
  │
  ├─ Position is in null zone? (docs missing the sort field)
  │   └── YES: Null-zone seek
  │         1. Use null-zone uploadTime distribution for position→date mapping
  │         2. Filtered search_after (must_not: exists: {field})
  │         3. countBefore with null-zone awareness
  │
  ├─ Sort field is date or numeric?
  │   └── YES: Percentile estimation path
  │         1. percentile = (offset / coveredCount) × 100  (adjusted for
  │            direction; uses coveredCount, not total — see below)
  │         2. ES percentiles agg → estimated sort value
  │         3. search_after([estimated_value, ""])
  │         4. countBefore → exact landed offset
  │
  └─ Sort field is keyword?
      └── YES: Composite aggregation walk
            1. findKeywordSortValue: walk composite agg pages
               to find the keyword bucket containing the target offset
            2. search_after([keyword_value, ""])
            3. countBefore → exact landed offset
            4. If drift > PAGE_SIZE (large bucket, e.g. 400k "PA" credits):
               Binary search on id tiebreaker (SHA-1 hex interpolation,
               ~11 countBefore queries, ~200ms total)
```

### Percentile estimation

For date-sorted views (the common case), ES's `percentiles` aggregation
can estimate the sort value at any percentile of the distribution in O(1)
— it uses a TDigest sketch, not a scan. We convert the target offset to a
percentile, ask ES for the value, and `search_after` from there.

**Accuracy:** Percentile estimation is approximate (TDigest has ~1–5% error
at extremes). We compensate with `countBefore` — a single `_count` query
that tells us exactly where we landed. The user never sees the estimation
error; it only affects which 200-item window we load.

**`coveredCount` correction:** The percentile denominator uses `coveredCount`
(docs *with* the sort field), not `total`. For fields where many docs have
null values (e.g. `dateTaken` — 80% null), using `total` would compress the
non-null distribution to a thin band. The sort distribution's `coveredCount`
is fetched (and cached) on first scrubber interaction.

### Binary search on SHA-1 hex

When sorting by keyword (e.g. Credit), a single bucket can contain 400k+
docs (all with credit "PA"). After landing at the bucket start via
composite aggregation, we need to refine within the bucket to reach the
target offset.

Image IDs are 40-character SHA-1 hashes — uniformly distributed in hex
space. We binary search on the first 12 hex characters (~48 bits):

```typescript
let loNum = 0;
let hiNum = 0xffffffffffff; // 12 hex f's
for (step 0..50) {
  midNum = floor((loNum + hiNum) / 2)
  mid = midNum.toString(16).padStart(12, "0")
  probeCursor = [keywordValue, ..., mid]  // tiebreaker is always last
  count = countBefore(params, probeCursor, sortClause)
  if (count <= target) loNum = midNum else hiNum = midNum
  if (|count - target| <= PAGE_SIZE) break  // close enough
}
```

Each iteration is a single `_count` query (~5–10ms). Convergence in ~11
steps. Total: ~100ms + network. Compared to the brute-force skip loop
that preceded it (5 × `search_after(size=100k)` = ~50MB transfer, ~46s
over SSH tunnel), this is a 99.99% network reduction.

### `countBefore` — the universal position finder

`countBefore(params, sortValues, sortClause)` answers: "how many documents
sort before this cursor?" It constructs a compound boolean query:

```
For sort [uploadTime desc, id asc]:
  cursor = [1711036800000, "abc123"]

  count = docs where:
    (uploadTime > 1711036800000)  ← strictly before in desc order
    OR (uploadTime == 1711036800000 AND id < "abc123")  ← same value, tiebreaker
```

This is a single `_count` query — O(1) regardless of depth. It's how we
convert any cursor into an exact global offset, and vice versa.

**Null-zone awareness:** When the sort field is missing (`null`), ES sorts
these docs to the end. `countBefore` adds an `exists` filter to count
non-null docs separately, then adds the within-null-zone count using the
uploadTime fallback sort. This is the `detectNullZoneCursor` /
`remapNullZoneSortValues` helper pair.

---

## §6 The Scrubber

The scrubber is a custom scrollbar that replaces the native one. It serves
as both a scroll position indicator and a random-access seek control.

### Coordinate system

Everything — thumb, ticks, tooltip, click-to-seek — uses the same mapping:

```
ratio  = position / maxPosition
pixel  = round(ratio × maxThumbTop)
```

Where `maxPosition = total − visibleCount` (native scrollbar semantics)
and `maxThumbTop = trackHeight − thumbHeight`. The reverse mapping
(`positionFromY`) uses the same denominator. This unification was the fix
for the original coordinate bug.

### Two modes

| | Scroll mode | Seek mode |
|---|---|---|
| **When** | `total ≤ SCROLL_MODE_THRESHOLD` (1000) | `total > threshold` |
| **Data coverage** | All results in buffer | Windowed buffer (~1000 of total) |
| **Drag interaction** | Directly scrolls content (real-time) | Moves thumb + tooltip only |
| **Release** | No-op (already scrolled) | `seek(position)` → buffer replaced |
| **Activation** | Immediate after two-phase fill | Immediate |
| **Latency** | 0ms (local scroll) | 200–500ms (ES round-trip) |

Scroll mode uses `_fillBufferForScrollMode()` — a two-phase fetch:

1. **Phase 1:** The initial `search()` fetches `PAGE_SIZE` (200) items as
   normal. Results appear on screen in ~100ms. At this point the scrubber
   is still in seek mode (buffer covers only 200 of, say, 800 items).
2. **Phase 2:** Immediately after phase 1, if `total ≤ SCROLL_MODE_THRESHOLD`
   (env-configurable, default 1000), the store eagerly fetches all remaining
   items in `PAGE_SIZE` chunks via `search_after`. When the buffer contains
   the full result set, `allDataInBuffer` flips true and the scrubber
   transitions to scroll mode — typically ~200–500ms after the initial
   search.

The user never waits for phase 2 — they see results instantly and gain
smooth scroll-mode interaction a fraction of a second later.

### Tick marks and density map

Ticks come from ES histogram distributions. For date sorts, the store
fetches a `date_histogram` aggregation with adaptive interval selection
(month / day / hour / 30m / 10m / 5m). Each bucket becomes a tick placed
at its **cumulative doc count position**, not at its time value.

This is a deliberate design decision: tick spacing functions as a **density
map**. Dense regions (many docs per time/keyword bucket) produce closely
packed ticks — the track is dominated by these regions. Sparse regions are
compressed into thin bands with few, widely-spaced ticks. The visual tick
density mirrors the data density, telling the user at a glance where
content is concentrated. The scrubber is simultaneously a position
indicator, a seek control, and a miniature density histogram of whichever
field the results are sorted by.

Label decimation prevents overcrowding: major labels shown first (≥18px
spacing), then minor labels fill remaining gaps. The result adapts
naturally to any track height or data distribution.

### Sort distribution cost

Tick data comes from ES aggregations (date histogram or composite terms).
Date histograms cost 10–50ms; keyword composites up to ~500ms for
high-cardinality fields. Distributions are lazily fetched on first
scrubber interaction, cached by query+sort key, and aborted on
supersession. Full guard details in `scrubber-ticks-and-labels.md`.

### Sort-context tooltip

The tooltip shows the sort field value at the hovered position plus a
human-readable `"X of Y"`. For date sorts, `formatSortDateAdaptive`
adapts granularity based on the total time span:

| Span | Format | Example |
|------|--------|---------|
| ≥28 days | Day Month Year | `1 Aug 2025` |
| <28 days | Day Month Time | `3 Apr 15:30` |
| Viewport >28 days | Month Year | `Aug 2024` |

For keyword sorts, an O(log n) binary search over the pre-fetched keyword
distribution resolves position → keyword value with zero network during
drag.

### Null zone

When sorting by a field with missing values (e.g. `dateTaken` — 80% of
1.3M docs lack it), docs without the field sort to the end. The region
past the last doc with a value is the **null zone**:

- **Red boundary tick** with a vertical "No {field}" label.
- **Red-tinted ticks** from a separate, universal fallback, uploadTime distribution (fetched
  with `must_not: exists: {field}` filter).
- **Italic tooltip**: "Uploaded: {date}" instead of "Taken: {date}".
- **Null-zone seek**: filtered `search_after` narrowed to missing-field
  docs, using the null-zone distribution for direct position→date mapping.

---


## File Map

| File | Lines | Role |
|---|---|---|
| `stores/search-store.ts` | ~2.5k | Buffer management, seek, extend, sort-around-focus, PIT lifecycle |
| `hooks/useScrollEffects.ts` | ~700 | All scroll effects: compensation, seek scroll-to-target, density-focus, sort-focus |
| `hooks/useDataWindow.ts` | ~250 | Buffer-aware view interface, edge detection, extend triggers |
| `components/Scrubber.tsx` | ~1.1k | Scroll/seek control, coordinate mapping, tick rendering |
| `lib/sort-context.ts` | ~1k | Tooltip labels, tick generation, distribution lookup |
| `constants/tuning.ts` | ~160 | All timing constants and buffer sizing |
| `constants/layout.ts` | ~30 | Pixel constants (row heights, cell widths) |
| `dal/es-adapter.ts` | ~1.1k | ES queries: searchAfter, countBefore, estimateSortValue, distributions |

---

## Glossary

| Term | Meaning |
|---|---|
| **Buffer** | Dense array of ~1000 `Image` objects. `buffer[0]` corresponds to global position `bufferOffset`. |
| **`BUFFER_CAPACITY`** | Max buffer size (1000). Eviction trims from the opposite end when exceeded. |
| **`countBefore`** | Single `_count` query that returns the exact global offset of any cursor. O(1). |
| **Cursor** | ES `search_after` sort values tuple. Stored at buffer start (`startCursor`) and end (`endCursor`). |
| **Density** | A viewing mode (table, grid, detail, fullscreen) — conceptually a zoom level of the same ordered list. |
| **Extend** | Fetch a page and append/prepend to the buffer. Forward = append + evict start. Backward = prepend + evict end. |
| **`EXTEND_THRESHOLD`** | How close to the buffer edge (50 items) before `reportVisibleRange` triggers an extend. |
| **"Never Lost"** | The principle that focus, scroll position, and context survive every transition. |
| **Null zone** | Region of results where the sort field is `null`. Sorted by `uploadTime` fallback. |
| **`PAGE_SIZE`** | Items per fetch (200). Used by seek, extend, and scroll-mode fill. One constant for all paths. |
| **PIT** | ES Point In Time — lightweight index snapshot for pagination consistency. |
| **Reverse-compute** | In seek: instead of setting `scrollTop` to the target, compute the target index that matches the user's *current* `scrollTop`. Eliminates flash. |
| **Seek** | Clear buffer, refill at target global offset. Triggered by scrubber or sort-around-focus. |
| **Swimming** | Visible content shift during prepend compensation. The central scroll engineering problem. |

