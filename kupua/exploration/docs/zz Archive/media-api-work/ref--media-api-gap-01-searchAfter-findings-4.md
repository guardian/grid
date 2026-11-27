# media-api gap inventory — complete call-pattern audit

**Date:** 2026-05-31  
**Status:** Read-only research. No files modified.  
**Sources:**
- `kupua/src/dal/types.ts` — `ImageDataSource` interface (20 methods as of this audit)
- `kupua/src/dal/es-adapter.ts` — ES adapter implementation
- `kupua/src/dal/null-zone.ts` — `detectNullZoneCursor` + `remapNullZoneSortValues`
- `kupua/src/stores/search-store.ts` — all production call sites
- `kupua/src/stores/selection-store.ts` — `getByIds` call sites
- `kupua/src/hooks/useRangeSelection.ts` — `getIdRange` call sites
- `kupua/src/components/ImageDetail.tsx` — `getById` call site
- `kupua/src/lib/typeahead-fields.ts` — `getAggregation`, `getAggregations`, `getFilterAggregations` call sites
- `kupua/src/stores/collection-store.ts` — `getAggregations` call site
- `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-gap-closure-feasibility.md`
- `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-gap-01-searchAfter-workplan.md`

---

## Section 0 — Interface size correction

The feasibility assessment (`media-api-gap-closure-feasibility.md §0.5`) recorded 17 methods.
The current `ImageDataSource` interface contains **20 methods**. Three were added since:

| Method | Added when | Production call sites |
|--------|------------|----------------------|
| `countWithTickers` | New-images ticker feature | 3 |
| `getFilterAggregations` | `is:` filter counts | 2 |
| `searchByAi?` | AI/KNN search | 1 |

`countWithTickers` and `getFilterAggregations` are absent from the 15-gap plan and
flagged below with `GAP MISSING`.

`searchByAi?` is NOT a gap — media-api already has `GET /images?useAISearch=true`
which implements the identical hybrid KNN algorithm (`hybridSearch()` in
`ElasticSearch.scala`). Kupua's standalone implementation is a dev-mode shortcut
(direct ES + Vite Bedrock proxy). `GridApiDataSource` should delegate to the existing
media-api endpoint. No server work needed.

---

## Part 1 — `searchAfter` call-site inventory

Every `dataSource.searchAfter(...)` call in `kupua/src/stores/search-store.ts`, plus
internal calls within `es-adapter.ts` (which reach `this.searchAfter(...)` indirectly
through `getIdRange`). Tests excluded.

### Call-site table

| # | File:line | Operation | sortOverride passed? | extraFilter passed? | reverse | missingFirst | noSource |
|---|-----------|-----------|---------------------|---------------------|---------|--------------|----------|
| A1 | search-store.ts:1987 | Initial search — first page | No | No | No | No | No |
| A2 | search-store.ts:1286 | Sort-around-focus — find image by ID (step 1) | No | No | No | No | No |
| A3 | search-store.ts:1305 | Sort-around-focus — batch neighbour check | No | No | No | No | No |
| A4 | search-store.ts:3702 | restoreAroundCursor — find image by ID | No | No | No | No | No |
| B1 | search-store.ts:1089 | `_loadBufferAroundImage` — forward half | nz.sortOverride | nz.extraFilter | false | false | No |
| B2 | search-store.ts:1100 | `_loadBufferAroundImage` — backward half | nz.sortOverride | nz.extraFilter | **true** | false | No |
| B3 | search-store.ts:912 | `_fillBufferForScrollMode` — chunk loop | nz?.sortOverride | nz?.extraFilter | false | false | No |
| B4 | search-store.ts:2250 | `extendForward` | nz?.sortOverride | nz?.extraFilter | false | false | No |
| B5 | search-store.ts:2397 | `extendBackward` | nz?.sortOverride | nz?.extraFilter | **true** | false | No |
| B6 | search-store.ts:2672 | `seek()` — pos-map backward parallel | bwdNz?.sortOverride | bwdNz?.extraFilter | **true** | false | No |
| B7 | search-store.ts:2696 | `seek()` — pos-map forward (nz path) | fwdNz.sortOverride | fwdNz.extraFilter | false | false | No |
| C1 | search-store.ts:2647 | `seek()` — pos-map position 0 (no cursor) | No | No | No | No | No |
| C2 | search-store.ts:2713 | `seek()` — pos-map forward (no nz) | No | No | No | No | No |
| C3 | search-store.ts:3048 | `seek()` — percentile-based | No | No | No | No | No |
| C4 | search-store.ts:3103 | `seek()` — keyword-based | No | No | No | No | No |
| C5 | search-store.ts:3208 | `seek()` — binary search refinement | No | No | No | No | No |
| C6 | search-store.ts:3267 | `seek()` — keyword capped fallback (1) | No | No | No | No | No |
| C7 | search-store.ts:3278 | `seek()` — keyword capped fallback (2) | No | No | No | No | No |
| D1 | search-store.ts:2597 | `seek()` — End key (reverse from last) | No | No | **true** | **true** | No |
| D2 | search-store.ts:2617 | `seek()` — shallow from/size (<10k) | No | No | No | No | No |
| D3 | search-store.ts:3248 | `seek()` — reverse from end (keyword miss) | No | No | **true** | **true** | No |
| D4 | search-store.ts:3326 | `seek()` — bidirectional backward | nz?.sortOverride | nz?.extraFilter | **true** | false | No |
| E1 | search-store.ts:2950 | `seek()` — **deep null-zone, direct construction** | **YES — direct** | **YES — direct** | false | false | No |
| INT | es-adapter.ts:2132 | `getIdRange` internal loop | nz?.sortOverride | nz?.extraFilter | false | false | **true** |

**Groups:**
- **A** — Simple ID lookups. No overrides.
- **B** — Extension/buffer paths. `sortOverride`/`extraFilter` come exclusively from `detectNullZoneCursor()` — only non-null when the cursor has `null` at position 0 (primary sort field missing).
- **C** — Deep seek paths. No overrides; cursor built via `buildSeekCursorAnchors`.
- **D** — Reverse-from-end paths. `reverse=true`, `missingFirst=true`, no other overrides.
- **E1** — The one anomalous case (see Part 2).
- **INT** — Internal to `es-adapter.getIdRange`; not exposed as a DAL contract call.

---

## Part 2 — What does `extraFilter` contain?

All `extraFilter` values in production code fit exactly **one shape**:

```json
{ "bool": { "must_not": { "exists": { "field": "<primaryField>" } } } }
```

`<primaryField>` is always the primary sort field derived from `params.orderBy` via
`buildSortClause()`. Examples:
- `orderBy: "-taken"` → primaryField = `"metadata.dateTaken"`
- `orderBy: "dateAddedToCollection"` → primaryField = `"dateAddedToCollection"`
- `orderBy: "-uploadTime"` → primaryField = `"uploadTime"` (rarely null-zones)

**Semantic meaning:** "restrict this query to documents where the primary sort field
is missing (null zone)". Not expressible via any existing `SearchParams` field.

### The E1 anomaly — direct construction at seek-deep-null-zone

`search-store.ts:2940–2975` constructs the filter **directly** (not via
`detectNullZoneCursor`) and pairs it with a manually constructed 2-element cursor:

```typescript
// seek() — null-zone deep seek
const nullZoneSort: Record<string, unknown>[] = [
  { uploadTime: nullZoneUploadDir },
  { id: "asc" },
];
const nullZoneFilter: Record<string, unknown> = {
  bool: { must_not: { exists: { field: primaryField! } } },
};
const nullZoneCursor: SortValues = [uploadTimeEstimate, ""];  // 2-element, no null prefix

result = await dataSource.searchAfter(
  { ...params, length: PAGE_SIZE },
  nullZoneCursor,         // ← NOT null at position 0
  effectivePitId,
  signal,
  false, false, false,
  nullZoneSort,           // ← explicit sortOverride
  nullZoneFilter,         // ← explicit extraFilter
);
```

This is different from the B/D4 cases where `detectNullZoneCursor([null, ...])` strips the
null prefix. Here the cursor is already stripped and has only 2 elements.

**Consequence for Gap 10's "transparent server-side null-zone detection":**
Gap 10's planned design says the server detects null at `sortValues[0]` and applies
null-zone logic transparently. That works for cases B1–B7 and D4 (where the cursor
could be sent as full-form `[null, uploadTimeVal, idVal]`), but E1 sends
`[uploadTimeEstimate, ""]` with no null. The server cannot distinguish this from a
normal 2-field sort cursor. See Part 3 for resolution options.

---

## Part 3 — What does `sortOverride` contain?

All `sortOverride` values in production code fit exactly **one shape**:

```json
[{ "uploadTime": "<direction>" }, { "id": "asc" }]
```

`<direction>` is always `"asc"` or `"desc"`, derived from `buildSortClause(params.orderBy)`:
specifically, the direction of the `uploadTime` field in the fallback sort clause.

**Semantic meaning:** "sort by uploadTime in the same direction as the primary sort's
fallback, then by id". This is always a standard sort that `sorts.createSort(orderBy)`
can produce for upload-time sorts. For non-upload-time primary sorts, `sortOverride`
recycles the secondary `uploadTime` direction that `buildSortClause` already computed.

**Key conclusion:** `sortOverride` is 100% derivable from `params.orderBy`. It adds no
information that the server doesn't already have. It never contains raw ES DSL that
isn't expressible as a named sort.

---

## Part 4 — Full method-by-method audit

### Methods with 0 production call sites

| Method | Notes |
|--------|-------|
| `search` | Interface method. Kupua's store uses `searchAfter` for all pages; `search` is never called on `dataSource` in production. Only in DAL contract tests. Map to Gap 1 internally in `GridApiDataSource`. |
| `searchRange` | Interface method. Same as above — 0 production calls. Used only in mock + tests. Gap 1 equivalent. |
| `count` | Interface method. 0 production calls (only `dal-contract.test.ts`). Map to Gap 17 in `GridApiDataSource`. |

### Methods with standard (no raw-ES) params

| Method | Production call sites | Params | Gap | Contract fits? |
|--------|----------------------|--------|-----|----------------|
| `getById` | ImageDetail.tsx:235 | `id: string` | Existing `GET /images/:id` | Yes |
| `openPit` | search-store.ts:1983 | `"1m"` (keepAlive string) | Gap 2 | Yes |
| `closePit` | search-store.ts:1861 | `pitId: string` | Gap 2 | Yes |
| `estimateSortValue` | ss:2909, ss:3033 | `params, primaryField (from orderBy), percentile` | Gap 4 | Yes |
| `findKeywordSortValue?` | ss:3081 | `params, field (from orderBy), targetPosition, direction` | Gap 5 | Yes |
| `getKeywordDistribution?` | ss:3972 | `params, kwInfo.field, kwInfo.direction` | Gap 6 | Yes |
| `fetchPositionIndex?` | ss:1015 | `params, signal` | Gap 8 | Yes |
| `getByIds` | sel-store:635, sel-store:673 | `ids: string[]` (up to thousands) | Gap 12 | Yes |
| `getIdRange` | useRange:225, useRange:252 | `params, fromCursor, toCursor, signal` | Gap 13 | Yes |

### `countBefore` — 7 call sites

All 7 calls pass `sortClause = buildSortClause(params.orderBy)` as the third argument.
The sort clause is always derivable from `params.orderBy` — the API contract (`orderBy`
string) covers all cases. Null values in `sortValues` (null-zone docs) are passed on
two call sites (ss:2985 when landing in null-zone during deep seek, ss:1414/1434 via
sort-around-focus on null-zone images). Gap 3's contract handles this via the null
handling described in its feasibility entry.

**All 7 call sites: Gap 3 covers them. Contract fits.**

### `getAggregation` — 1 call site

`typeahead-fields.ts:207`: `dataSource.getAggregation(field, undefined, size)` —
no SearchParams filter, no current-query context. Maps to existing
`GET /images/metadata/:field`. The field passed is a dynamic typeahead field path
(e.g. `"metadata.credit"`). No raw ES params.

**Gap: existing route. Contract fits.**

### `getAggregations` — 4 call sites

| Call site | Params | Notes |
|-----------|--------|-------|
| collection-store.ts:140 | `{}, [{field: "collections.pathId", size: 6000}]` | Empty SearchParams = no filter (all docs). Valid. |
| search-store.ts:3868 | `callParams, AGG_FIELDS` | Standard SearchParams |
| search-store.ts:3908 | `params, [{field,size}]` | Standard SearchParams |
| typeahead-fields.ts:203 | `adjustedParams, [{field, size}]` | Standard SearchParams |

**All 4 call sites: Gap 18 covers them. Contract fits. Empty SearchParams (collection-store) is a valid degenerate case (no filter = match all).**

### `searchAfter` — see Parts 1–3 above

| Group | Contract fits with Gap 1 + Gap 9 + Gap 10? | Issue |
|-------|-------------------------------------------|-------|
| A (ID lookups) | Yes | None |
| B (null-zone extensions via detectNullZoneCursor) | **Conditional** | Requires client change (E1-style) OR Gap 1 must accept explicit params |
| C (standard deep seek) | Yes | None |
| D (reverse/missingFirst) | Yes — Gap 9 covers these | None |
| E1 (deep null-zone direct) | **No — current contract** | Cursor is 2-element; server cannot detect null-zone |
| INT (getIdRange internal) | N/A | Handled by Gap 13 server-side; noSource never in client contract |

---

## Part 5 — Gap coverage matrix

### `searchAfter` call sites

| Method | Call site | Operation | Covered by Gap | Contract fits? | Issue |
|--------|-----------|-----------|----------------|----------------|-------|
| searchAfter | ss:1987 | Initial first page (trackTotalHits=true) | Gap 1 | Yes | — |
| searchAfter | ss:1286 | SAF: find image by ID, get sortValues | Gap 1 | Yes | — |
| searchAfter | ss:1305 | SAF: batch neighbour check | Gap 1 | Yes | — |
| searchAfter | ss:3702 | restoreAroundCursor: find by ID | Gap 1 | Yes | — |
| searchAfter | ss:1089 | _loadBufferAroundImage fwd (null-zone) | Gap 1 + Gap 10 | **Conditional** | See Note 1 |
| searchAfter | ss:1100 | _loadBufferAroundImage bwd (null-zone) | Gap 1 + Gap 9 + Gap 10 | **Conditional** | See Note 1 |
| searchAfter | ss:912 | _fillBufferForScrollMode chunk (null-zone) | Gap 1 + Gap 10 | **Conditional** | See Note 1 |
| searchAfter | ss:2250 | extendForward (null-zone) | Gap 1 + Gap 10 | **Conditional** | See Note 1 |
| searchAfter | ss:2397 | extendBackward (null-zone, reverse) | Gap 1 + Gap 9 + Gap 10 | **Conditional** | See Note 1 |
| searchAfter | ss:2672 | seek pos-map backward parallel (null-zone) | Gap 1 + Gap 9 + Gap 10 | **Conditional** | See Note 1 |
| searchAfter | ss:2696 | seek pos-map forward (null-zone) | Gap 1 + Gap 10 | **Conditional** | See Note 1 |
| searchAfter | ss:2647 | seek pos-map from position 0 | Gap 1 | Yes | — |
| searchAfter | ss:2713 | seek pos-map forward (no nz) | Gap 1 | Yes | — |
| searchAfter | ss:3048 | seek percentile-based | Gap 1 | Yes | — |
| searchAfter | ss:3103 | seek keyword-based | Gap 1 | Yes | — |
| searchAfter | ss:3208 | seek binary search refinement | Gap 1 | Yes | — |
| searchAfter | ss:3267 | seek capped fallback (offset) | Gap 1 | Yes | — |
| searchAfter | ss:3278 | seek capped fallback (offset) | Gap 1 | Yes | — |
| searchAfter | ss:2597 | seek End key (reverse, missingFirst) | Gap 1 + Gap 9 | Yes | — |
| searchAfter | ss:2617 | seek shallow from/size | Gap 1 | Yes | — |
| searchAfter | ss:3248 | seek reverse end (keyword miss) | Gap 1 + Gap 9 | Yes | — |
| searchAfter | ss:3326 | seek bidirectional backward (null-zone) | Gap 1 + Gap 9 + Gap 10 | **Conditional** | See Note 1 |
| searchAfter | ss:2950 | **seek deep null-zone DIRECT** | Gap 1 + Gap 10 | **No** | See Note 2 |

### All other methods

| Method | Call site | Operation | Covered by Gap | Contract fits? | Issue |
|--------|-----------|-----------|----------------|----------------|-------|
| search | (tests only) | — | Gap 1 (GridApiDataSource impl) | Yes | — |
| searchRange | (tests only) | — | Gap 1 (GridApiDataSource impl) | Yes | — |
| count | (tests only) | — | Gap 17 | Yes | — |
| **countWithTickers** | ss:616 | New-images poll tick | **GAP MISSING** | **No** | Note 3 |
| **countWithTickers** | ss:1943 | Ticker refresh post-metadata save | **GAP MISSING** | **No** | Note 3 |
| **countWithTickers** | ss:1997 | Initial search ticker parallel fetch | **GAP MISSING** | **No** | Note 3 |
| getById | ImageDetail.tsx:235 | Load image in detail view | Existing GET /images/:id | Yes | — |
| getAggregation | typeahead:207 | Typeahead (no search context) | Existing GET /images/metadata/:field | Yes | — |
| getAggregations | coll-store:140 | All collections (empty params) | Gap 18 | Yes | — |
| getAggregations | ss:3868 | Facet panel counts | Gap 18 | Yes | — |
| getAggregations | ss:3908 | Expanded facet agg | Gap 18 | Yes | — |
| getAggregations | typeahead:203 | Typeahead with context | Gap 18 | Yes | — |
| **getFilterAggregations** | ss:3869 | `is:` counts (deleted, under-quota) | **GAP MISSING** | **No** | Note 4 |
| **getFilterAggregations** | typeahead:376 | `is:` counts in typeahead | **GAP MISSING** | **No** | Note 4 |
| openPit | ss:1983 | Open PIT for consistent pagination | Gap 2 | Yes | — |
| closePit | ss:1861 | Close old PIT on new search | Gap 2 | Yes | — |
| countBefore | ss:1414 | SAF: offset lookup (two-tier) | Gap 3 | Yes | — |
| countBefore | ss:1434 | SAF: offset lookup (pos-map miss) | Gap 3 | Yes | — |
| countBefore | ss:1592 | SAF: deep seek async correction | Gap 3 | Yes | — |
| countBefore | ss:2985 | seek deep null-zone landing | Gap 3 | Yes | — |
| countBefore | ss:3061 | seek percentile landing | Gap 3 | Yes | — |
| countBefore | ss:3114 | seek keyword landing | Gap 3 | Yes | — |
| countBefore | ss:3169 | seek binary search step | Gap 3 | Yes | — |
| countBefore | ss:3701 | restoreAroundCursor | Gap 3 | Yes | — |
| estimateSortValue | ss:2909 | seek deep null-zone uploadTime pct | Gap 4 | Yes | — |
| estimateSortValue | ss:3033 | seek percentile estimation | Gap 4 | Yes | — |
| findKeywordSortValue? | ss:3081 | seek keyword sort field | Gap 5 | Yes | — |
| getKeywordDistribution? | ss:3972 | Scrubber tick / tooltip | Gap 6 | Yes | — |
| getDateDistribution? | ss:3977 | Scrubber date sort | Gap 7 | Yes | — |
| **getDateDistribution?** | **ss:4030** | **Null-zone uploadTime distribution** | Gap 7 | **No** | **Note 5** |
| fetchPositionIndex? | ss:1015 | Background position map fetch | Gap 8 | Yes | — |
| getByIds | sel-store:635 | Load images after metadata fetch | Gap 12 | Yes | — |
| getByIds | sel-store:673 | Load all selected images | Gap 12 | Yes | — |
| getIdRange | useRange:225 | Shift-click range selection walk | Gap 13 | Yes | — |
| getIdRange | useRange:252 | Shift-click swap-and-retry | Gap 13 | Yes | — |
| **searchByAi?** | ss:1881 | AI/KNN semantic search | **NOT A GAP** | **Yes** | Note 6 |

---

## Summary: Gaps in the gap plan

Three types of issue found:

### A — Three methods added since the feasibility study, not in any gap

**Note 3 — `countWithTickers` (3 call sites)**

Returns `{ count: number, tickerCounts: Record<string, TickerCountResult> }` in a
single ES request (size=0 `_search` with filter aggs for ticker definitions). The
ticker filter queries come from `gridConfig.tickerDefinitions` (CQL strings compiled
to ES DSL at module load). Media-api already has the equivalent: `ElasticSearch.scala`
has `aggregationsNameToSearchClauseMap` for ticker aggs, and `imageSearch()` fires them
on every search. **Recommended gap:** Extend Gap 17 (count endpoint) to also return
ticker counts, or fold into a new Gap 19. The server-side ticker definitions already
exist — this is primarily an endpoint design decision. Contract extension: the response
must include `tickerCounts: Record<string, TickerCountResult>`.

**Note 4 — `getFilterAggregations` (2 call sites)**

Takes `FilterAggRequest[]` where each entry has `{ name: string, query: Record<string, unknown> }` — raw ES filter agg DSL.
Always called with queries produced by `parseCql("is:deleted").must[0]` and
`parseCql("is:under-quota").must[0]` (and occasionally `is:${org}-owned-photo`, etc.).
These `is:` filters are ES-DSL opaque objects that cannot be expressed through existing
`SearchParams` fields.

The raw ES query objects cannot be forwarded through media-api — that would expose the
ES query language directly through the API. The server already knows how to handle
`is:deleted`, `is:under-quota` (they're part of the media-api CQL parser). **Recommended
contract extension:** a named-filter endpoint, e.g. add to Gap 18 as `isFilters: string[]`
— the server resolves each name server-side (same CQL parser it already uses). Recommended
gap slot: extend Gap 18 body to accept `isFilters: ["deleted", "under-quota", ...]`.

**Note 6 — `searchByAi?` (1 call site, ss:1881) — NOT A GAP**

Optional interface method. Called only when `params.aiQuery` is set. Kupua currently
reimplements this client-side (fetches vector from Vite Bedrock proxy plugin, sends
KNN query directly to ES). However, **media-api already has the identical capability**:
`GET /images?useAISearch=true&q=...&vecWeight=0.7` calls `hybridSearch()` in
`ElasticSearch.scala` — same Cohere Embed V4 model, same ES field
(`embedding.cohereEmbedV4.image`), same BM25+KNN blend algorithm with max-score probe.
Also supports `q=similar:<imageId>` for image→image KNN (which kupua doesn't use yet).

When `GridApiDataSource` is implemented, `searchByAi` simply calls the existing
`/images?useAISearch=true` endpoint. **No server gap, no new endpoint needed.** The
`?` optional marking remains appropriate since the method may not be available in all
data-source configurations, but media-api can already serve it.

---

### B — Contract extension needed for existing gap

**Note 5 — `getDateDistribution?` with `extraFilter` (ss:4030)**

`fetchNullZoneDistribution` in search-store passes a raw ES filter to `getDateDistribution`:

```typescript
const nullZoneFilter = primaryField
  ? { bool: { must_not: { exists: { field: primaryField } } } }
  : undefined;

const dist = await dataSource.getDateDistribution(
  params, "uploadTime", direction,
  _nullZoneDistAbortController.signal,
  nullZoneFilter,   // ← Gap 7 does not plan for this
);
```

Gap 7's planned `GET /images/aggregations/date/:field` endpoint accepts `direction` and
`adaptive`, but no filter parameter. This call requires the distribution to be scoped
to docs **missing** the primary sort field. Without this, bucket positions are wrong
(null-zone docs have a different uploadTime distribution than non-null docs — see comment
at ss:4006–4018).

**Contract extension needed:** Add `missingField?: string` to Gap 7's endpoint. When
present, the server adds `must_not: { exists: { field: missingField } }` to the base
query. This single named parameter covers the only non-null extraFilter shape this
method ever receives.

---

### C — Conditional fit: null-zone sortOverride/extraFilter in Gap 1

**Note 1 — B group calls (B1–B7, D4) — conditional fit**

These calls reach `detectNullZoneCursor(cursor, params.orderBy)` which returns non-null
only when `cursor[0] === null` (primary sort field is null). When non-null:
- The cursor is **stripped** (null at position 0 removed) before passing to `searchAfter`
- `sortOverride` and `extraFilter` are passed explicitly

Gap 10's planned design handles this **transparently**: client sends the full
`[null, uploadTimeVal, idVal]` cursor; server detects null at position 0 and applies
null-zone logic internally.

For the B group to fit Gap 10's contract without explicit `sortOverride`/`extraFilter`
params, the client code must be changed: instead of stripping the cursor and passing
explicit overrides, send the null-prefixed full cursor and omit the overrides. This is
a client refactor (~6 call sites in search-store + 1 in es-adapter). The logic change
is mechanical: `detectNullZoneCursor` already computes the strippedCursor from the
full cursor; the inverse (prepend null) is trivial.

**Note 2 — E1 (ss:2950) — contract does NOT fit without client change**

The deep-seek null-zone path constructs a 2-element cursor `[uploadTimeEstimate, ""]`
and passes explicit `sortOverride`/`extraFilter`. The server cannot distinguish this
from a normal 2-field sorted request — there is no null at position 0.

Two options:

**Option A (recommended): client refactor.**
Change ss:2950 to prepend `null` at the primary-field position:
```typescript
// Before:
const nullZoneCursor: SortValues = [uploadTimeEstimate, ""];
// After:
const nullZoneCursor: SortValues = [null, uploadTimeEstimate, ""];
```
Do not pass `sortOverride`/`extraFilter`. Server Gap 10 detects `null` at `cursor[0]`
and applies null-zone logic. `detectNullZoneCursor([null, uploadTimeEstimate, ""], orderBy)`
produces the same override values as the current manual construction.

**Option B (not recommended): explicit params in contract.**
Add `sortOverride?: Seq[JsValue]` and `extraFilter?: JsValue` to the Gap 1 endpoint body.
This leaks ES query DSL into the API contract, creates a client-driven ES injection
surface, and couples the API to kupua's internal null-zone implementation detail.

---

## Consolidated list of contract extensions needed

| Gap | Extension | Required for | Priority |
|-----|-----------|-------------|----------|
| Gap 7 | Add `missingField?: string` to date histogram endpoint | `fetchNullZoneDistribution` (scrubber accuracy on non-upload-time sorts) | Medium |
| Gap 10 | Server-side null-zone detection (already planned) | All B-group and E1 `searchAfter` calls after client refactor | High — blocks Gap 1 correctness for non-upload-time sorts |
| Gap 17/new | `countWithTickers` — count + ticker deltas in one request | New-images ticker + initial search ticker | High — 3 call sites, runs on every poll tick |
| Gap 18 extension | Add `isFilters: string[]` to aggregations endpoint | `is:deleted` / `is:under-quota` counts in facet panel + typeahead | Medium |
| New Gap 20 | AI/KNN search endpoint | `searchByAi?` | Low — optional, graceful absence |

---

## Recommendations

1. **Client refactor before implementing Gap 1:** Change all B-group + E1 `searchAfter`
   calls to send full null-prefixed cursors (`[null, uploadTimeVal, idVal]`) and remove
   `sortOverride`/`extraFilter` from the Gap 1 API contract. This isolates null-zone
   handling to Gap 10 (server) and eliminates raw ES DSL from the client-server boundary.
   Scope: ~7 call sites in search-store.ts + 1 in es-adapter.ts (`getIdRange` loop).

2. **`sortOverride` and `extraFilter` should NOT be in the Gap 1 API contract.** Both
   are always derivable server-side (`sortOverride` = standard sort from `orderBy`;
   `extraFilter` = Gap 10 null detection). Exposing them would create an ES injection
   surface.

3. **`noSource` does NOT belong in the Gap 1 API contract.** It is only ever passed
   internally within `es-adapter.getIdRange()` (calling `this.searchAfter()`). Gap 13
   and Gap 8 each have dedicated endpoints; neither requires the gap-1 route to support
   `noSource`.

4. **New gap needed for `countWithTickers`.** This is called on every new-images poll
   tick and at initial search time. Deferring it means the ticker feature degrades to
   non-functional in media-api mode. Add as Gap 19 or extend Gap 17.

5. **Gap 18 needs `isFilters` extension.** The `getFilterAggregations` call sites are
   used for the `is:deleted` / `is:under-quota` counts in the facet panel. Without this,
   those counts will be absent in media-api mode.

6. **Gap 7 needs `missingField` extension.** The null-zone uploadTime distribution is
   used for scrubber accuracy (bucket positions for null-zone docs). Without it, the
   null-zone ticks and tooltip will be inaccurate on non-upload-time sorts.
