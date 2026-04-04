# Scrubber Ticks, Labels, and Tooltip — Reference

> How the scrubber's coordinate system, tick marks, tooltip, and null zone
> work together. Read this to understand the design; see `changelog.md`
> for how we got here.

## The Single Coordinate System

Everything on the scrubber — thumb, ticks, hover tooltip, click-to-seek —
uses the **same** coordinate mapping:

```
ratio  = position / maxPosition
pixel  = round(ratio × maxThumbTop)
```

Where:
- `position` = global result index (0-based)
- `maxPosition` = `total − visibleCount` (scrollbar semantics: the thumb
  represents a viewport, so the last valid position is `total − visibleCount`)
- `maxThumbTop` = `trackHeight − thumbHeight` (the thumb can't descend past
  this pixel)

**`positionFromY` (hover/click)** reverses the mapping: `position = round((clientY − rect.top) / maxThumbTop × maxPosition)`. Pixels below `maxThumbTop` clamp to `maxPosition`.

**`positionFromDragY` (drag)** uses the same `maxTop` denominator.

This unification was the fix for the original coordinate bug — `positionFromY`
previously used `trackHeight` as denominator while ticks used `maxThumbTop`,
causing hover at a tick's pixel to resolve to a different position.

## Tick Placement

Ticks come from `computeTrackTicks()` in `sort-context.ts`. For date sorts
with a distribution (the common case), each ES histogram bucket becomes a
tick:

```
tick.position = bucket.startPosition   (cumulative doc count)
tick.label    = formatted bucket key   (e.g. "2024", "Aug", "15:00")
tick.type     = "major" | "minor"      (controls visual weight)
```

Ticks are placed at **position** (doc count), not at **time**. This means:

- Dense periods (many uploads) → ticks spread wide on the track
- Sparse periods (few uploads) → ticks cluster together

This is an explicit **design decision** (locked in 4 Apr 2026): the tick
spacing functions as a **density map**. The visual compression of sparse
ticks and expansion of dense ticks tells the user at a glance where content
is concentrated. We never linearise ticks by time.

### Interval detection and label hierarchy

`computeTrackTicks` detects the histogram interval from the first two
bucket keys and applies different label strategies:

| Interval | Major ticks | Major label | Minor label |
|----------|-------------|-------------|-------------|
| Monthly, span < 15yr | January | `"2024"` | `"Aug"` |
| Monthly, span ≥ 15yr | Jan of `yr%5==0` | `"2020"` | `"Aug"` or `"2019"` |
| Daily | 1st of month | `"Aug"` | `"15"` |
| Hourly | Every 6 hours | `"18:00"`, midnight → `"3 Apr"` | `"14:00"` |
| Sub-hour (30m/10m/5m) | Full hours (`m==0`) | `"15:00"`, midnight → `"3 Apr"` | `"15:30"` |

### Label decimation

The Scrubber renders all ticks as horizontal lines but only shows labels
where there's enough space. The algorithm (in `Scrubber.tsx`):

1. Major labels first: show if ≥ `MIN_LABEL_GAP` (18px) from previous label
2. Minor labels second: show if ≥ 18px from any already-shown label
3. First tick's label skipped if < 13px from track top (would overflow)
4. Isolated minor year-ticks promoted to major if > 80px from nearest major

This means sparse overnight hours might show zero labels (all crammed into
30px) while dense daytime hours each get a readable label. This is correct —
the absence of labels is itself a density signal.

## Tooltip

The tooltip shows two things:

1. **Sort label** — the date/keyword at the hovered position
2. **Position text** — `"X of Y"` (1-based)

Both use the same `position` from `positionFromY(clientY)`.

### Sort label resolution

`getSortLabel(position)` calls `interpolateNullZoneSortLabel()`, which
delegates to either:

- **`lookupSortDistribution(dist, position)`** — O(log n) binary search
  of the histogram buckets. Returns the bucket key (ISO date) for the
  bucket containing `position`. Then `formatSortDateAdaptive()` formats it
  with adaptive granularity based on the total time span and local viewport
  span.

- **Buffer fallback** — linear interpolation from buffer edge dates when
  no distribution is loaded yet.

### Tick label vs tooltip label formatting

Tick labels and tooltip labels use **different formatters** deliberately:

| | Tick label | Tooltip label |
|---|---|---|
| Source | `computeTrackTicks` | `formatSortDateAdaptive` |
| Format | Short: `"Aug"`, `"2024"`, `"15:00"` | Full: `"1 Aug 2025"`, `"3 Apr 15:30"` |
| Purpose | Orientation landmark | Precise identification |

They both resolve from the same distribution buckets, so hovering at a
tick's pixel resolves to the same bucket — but the displayed text is
intentionally different in verbosity.

### Adaptive date granularity

`formatSortDateAdaptive(dateStr, totalSpanMs, localSpanMs)`:

| Condition | Format | Example |
|-----------|--------|---------|
| `localSpan > 28 days` | Mon Year | `Aug 2024` |
| `totalSpan < 28 days` | Day Mon Time | `3 Apr 15:30` |
| Default | Day Mon Year | `1 Aug 2025` |

The decision is based on `totalSpanMs` (not local) to prevent format
twitching when local density varies at distribution edges.

## Null Zone

When sorting by a field with missing values (e.g. `dateTaken`,
`lastModified`), docs without the field sort to the end. The region
after the last doc with a value is the **null zone**.

### How it works

1. `sortDistribution.coveredCount` = number of docs that HAVE the sort field
2. Positions `0..coveredCount-1` = covered zone (sorted by the primary field)
3. Positions `coveredCount..total-1` = null zone (sorted by `uploadTime` fallback)

### Null-zone ticks

`computeTrackTicksWithNullZone()` combines three sets:

1. **Covered-zone ticks** — from the primary sort distribution (normal ticks)
2. **Boundary tick** — at `position = coveredCount`, labeled `"No {field}"`,
   red colour (`rgba(255, 140, 140, 0.9)`), rendered as a vertical label
   edge-clamped to track bounds
3. **Null-zone ticks** — from the `nullZoneDistribution` (uploadTime
   histogram for docs missing the sort field), positions offset by
   `coveredCount`, red-tinted (`rgba(255, 140, 140, 0.55)`)

### Null-zone tooltip

When hovering in the null zone (`position >= coveredCount`):

- `interpolateNullZoneSortLabel()` uses the null-zone distribution
  (uploadTime) to look up the date
- Label is prefixed with italic `"Uploaded: "` to distinguish from the
  primary sort field
- Position text still shows the global position (`"850,000 of 1,300,000"`)

### Null-zone seek

Seeking into the null zone uses filtered `search_after` (narrowed to
docs missing the sort field, sorted by uploadTime). The null-zone
distribution provides direct position→date mapping with ~0.6% accuracy —
no percentile estimation needed.

## Pixel rounding

The forward path (position → pixel) and reverse path (pixel → position)
each use `Math.round()`, and the intermediate ratio is a float. The
round-trip can produce ±1 position drift:

```
position → float ratio → round(pixel) → float ratio' → round(position')
position' may be ±1 from position
```

This matters only when a ±1 drift crosses a bucket boundary — i.e. when
buckets are very small (10–50 docs). In practice this only affects tiny
tail-end buckets at the edges of large datasets. Not worth fixing — the
alternative (storing per-tick position maps or using floating-point pixels)
adds complexity for zero real-world UX improvement.

## ES Aggregation Internals

The tick/label system depends on **sort distributions** — histogram data
fetched from Elasticsearch via aggregation queries. This section documents
what we ask ES to do, how much it costs, and the guards preventing abuse.

### What gets fetched

| Distribution | ES agg type | Trigger | Typical query shape |
|---|---|---|---|
| **Date sort** (e.g. `uploadTime`, `dateTaken`) | Two queries: (1) `stats` agg to get min/max, then (2) `date_histogram` | First scrubber hover/click | `size:0, track_total_hits:false, aggs: { stats }` then `size:0, track_total_hits:false, aggs: { date_histogram }` |
| **Keyword sort** (e.g. `credit`) | `composite` agg (paginated) | First scrubber hover/click | `size:0, track_total_hits:false, aggs: { composite: { sources: [{ terms }], size: 10000 } }` |
| **Null-zone** (e.g. `dateTaken` nulls sorted by `uploadTime`) | Same as date sort, with an extra `must_not: { exists: { field } }` filter | Automatic when primary distribution reveals `coveredCount < total` | Same as date sort + extra filter clause |

### Query cost assessment

**Date distributions** are cheap. `date_histogram` is one of ES's most
optimised aggregations — it uses the BKD tree index on date fields. The
`stats` pre-query that determines the interval costs ~5ms. The histogram
itself costs 10–50ms on TEST (1.3M docs). Both queries use `size: 0`
(no document hits returned) and `track_total_hits: false` (no total count
computation).

Payload size depends only on bucket count, not doc count (~60 bytes/bucket).
The adaptive interval selection keeps bucket counts bounded:

| Time span | Interval | Typical buckets |
|-----------|----------|-----------------|
| > 2 years | `month` (calendar) | ~180 for 15 years |
| 2 days – 2 years | `day` (calendar) | ~60 for 2 months |
| 25h – 2 days | `hour` (calendar) | ~48 |
| 12h – 25h | `30m` (fixed) | ~48 |
| 3h – 12h | `10m` (fixed) | ~72 |
| < 3h | `5m` (fixed) | ~36 |

Worst case is ~180 buckets × 60 bytes ≈ **11KB**. In practice, `min_doc_count: 1`
(skip empty buckets) reduces this further for sparse datasets.

**Keyword distributions** are more expensive. The `composite` aggregation
walks the entire term dictionary for the field. Capped at 5 pages ×
10,000 buckets = **50,000 unique values max**. On TEST, `credit` (~3,500
unique values) completes in ~200ms. Fields with higher cardinality (e.g.
`source` with ~15,000 values) take ~500ms. The 5-page cap means extremely
high-cardinality fields return a partial distribution — still useful for
the covered range, but ticks won't extend to the tail.

**Null-zone distributions** are a third date query (same cost as the primary
date distribution) but filtered to docs missing the sort field. On TEST
with `dateTaken` (20% null, ~260k docs), this takes ~15ms.

### Guards

**1. Lazy fetch — no aggregation until user touches the scrubber.**
`search.tsx` passes `onFirstInteraction` to the Scrubber, which fires once
on the first hover, click, or keyboard event. Until then, zero distribution
queries are sent. Users who never hover the scrubber pay nothing.

**2. Cache key deduplication — same query + sort = skip.**
`sortDistCacheKey(params)` = `aggCacheKey(params) + "|" + orderBy`. If the
user scrubs back and forth without changing their search or sort, no new
queries fire. The cache is invalidated on any filter/query/sort change.

**3. Abort on supersession — stale requests are killed.**
Each `fetchSortDistribution` / `fetchNullZoneDistribution` call aborts the
previous in-flight request via `AbortController`. Rapid sort changes don't
pile up concurrent aggregation requests.

**4. Staleness guard — discard results if params changed.**
After `await`, the store re-checks `sortDistCacheKey(get().params) !== key`.
If the user changed their query while the agg was running, the result is
silently discarded.

**5. Null-zone auto-fetch — no extra user action.**
When the primary distribution arrives and `coveredCount < total`, the
null-zone distribution fetches automatically. No second scrubber interaction
needed. But it only fires if there IS a null zone — `uploadTime` sorts
(universal field, no nulls) skip it entirely.

**6. Seek-time fallback — distribution fetched if missing at seek.**
When the user clicks the scrubber to seek, `seek()` needs `coveredCount`
to detect whether the target is in the null zone. If `sortDistribution` is
null (user clicked before hovering), `seek()` awaits
`fetchSortDistribution()` synchronously — one extra round-trip on first
click only. After that it's cached.

**7. Facet aggregation circuit breaker (separate system).**
The facet-filter aggregations (`fetchAggregations`) have their own circuit
breaker: if a facet agg takes > 2s (`AGG_CIRCUIT_BREAKER_MS`), `aggCircuitOpen`
flips true and subsequent non-forced fetches are skipped. **This does NOT
apply to sort distributions** — they have no circuit breaker because they're
cheap (date) or capped (keyword), and blocking them would leave the
scrubber unusable.

### What the guards do NOT protect against

- **Very high cardinality keyword sorts** with > 50,000 unique values: the
  composite agg walks 5 pages and stops. Ticks cover only the first 50k
  values. Tooltip labels outside this range fall back to buffer-edge values.
  This is acceptable — fields with 50k+ unique values have tiny buckets
  that produce unusable tick density anyway.

- **Very expensive base queries** (e.g. `description:complex phrase`): the
  distribution agg inherits the base query's cost. A query that takes 2s to
  execute makes the distribution take 2s+ too. The lazy-fetch guard helps
  (user pays this only if they touch the scrubber), but there's no timeout
  or circuit breaker on individual distribution fetches. An AbortController
  signal exists for cancellation, but no proactive timeout.

- **Concurrent facet + distribution fetches**: if the user changes filters
  while the distribution is loading, both run concurrently. ES handles this
  fine (read-only, no locking), but it's double the cluster load for a
  moment. The abort guards mitigate this — the stale distribution request
  is aborted on the next `fetchSortDistribution` call.

## Files

| File | What |
|------|------|
| `src/components/Scrubber.tsx` | All coordinate mapping, hover/drag handlers, tick rendering, label decimation |
| `src/lib/sort-context.ts` | `lookupSortDistribution`, `interpolateSortLabel`, `formatSortDateAdaptive`, `computeTrackTicks`, `computeTrackTicksWithNullZone`, `interpolateNullZoneSortLabel` |
| `src/routes/search.tsx` | Wires `getSortLabel` callback and `trackTicks` to the Scrubber |
| `src/dal/es-adapter.ts` | `getDateDistribution` (stats + date_histogram), `getKeywordDistribution` (composite agg) |
| `src/stores/search-store.ts` | `fetchSortDistribution`, `fetchNullZoneDistribution`, cache keys, abort controllers |
| `src/constants/tuning.ts` | `AGG_CIRCUIT_BREAKER_MS` (2s), `AGG_DEBOUNCE_MS` (500ms) — facet aggs only, not distributions |


