# Phase 2 — Kupua DAL Needs at the DAL Boundary

**Date:** 2026-05-31
**Status:** Read-only research. No files modified.
**Primary inputs:**
- `kupua/src/dal/types.ts` — `ImageDataSource` interface (20 methods)
- `kupua/src/dal/es-adapter.ts` — ES adapter implementation (signatures + result shapes)
- `kupua/src/dal/null-zone.ts` — null-zone cursor helpers
- `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-gap-01-searchAfter-findings-4.md`
  — call-site matrix (primary input, not reproduced here)

---

## Section 1 — DAL boundary verification

**grep result for `fetch(` in `kupua/src/**/*.ts` outside `kupua/src/dal/`:**

| File | Line | Target | In DAL chain? |
|------|------|--------|---------------|
| `kupua/src/lib/bedrock-proxy-client.ts` | 19, 33 | `/bedrock/embed`, `/bedrock/health` | Yes — called only from `es-adapter.ts:searchByAi` |
| `kupua/src/stores/collection-store.ts` | 190 | Grid collections service (`/collections`) | No — distinct backend |
| `kupua/src/lib/cost/quota-store.ts` | 43 | `/api/usage/quotas` | No — distinct backend |

**Verdict: the DAL boundary premise holds for image data.** All image search, retrieval,
aggregation, and position operations pass through the 20-method `ImageDataSource`
interface. No store or component calls ES or media-api for image data outside the DAL.

The two out-of-boundary fetches (`collection-store` and `quota-store`) are distinct,
supplementary data concerns:

- **`collection-store.ts:190`** fetches the collection tree from Grid's collections
  service — a separate backend that serves navigation structure, not image documents.
  Its one DAL call is `getAggregations` (to count images per collection), which passes
  through the interface normally.

- **`quota-store.ts:43`** fetches supplier quota data from media-api's
  `GET /api/usage/quotas` once at app startup. It enriches the cost classification of
  images already in the buffer — it does not retrieve image documents. Purely additive.

- **`bedrock-proxy-client.ts`** is a helper called exclusively from within
  `es-adapter.ts:searchByAi`. It lives in `lib/` for import-graph reasons but is
  functionally inside the ES adapter chain, not in UI code.

Neither out-of-boundary fetch affects the Phase 3 gap surface for image data. They are
noted as known scope gaps for Phase 3 planning (collection tree and quota enrichment
will need their own integration paths, but those are not `ImageDataSource` concerns).

---

## Section 2 — Method-by-method need catalogue

### `search` — Execute a cancellable primary search and return the first result page

**Method signature:**
```typescript
search(params: SearchParams): Promise<SearchResult>;
```

**Abstract need:** Perform a full-text / filtered image search and return the first page
of results with a total count and per-hit position cursors. Any previous in-flight search
is cancelled — only the most recent call's result matters to the UI. The initial search
also returns aggregate counts for the saved-filter groups (tickers) in the same response.

**UI features enabled:**
- Main grid initial population on search submission (0 production call sites on `dataSource`
  directly — in production the store calls `searchAfter` for the first page;
  `search` is reserved for DAL-contract tests only and for the eventual `GridApiDataSource`
  where it will map to the `/images` search endpoint)

**Input vocabulary:**
- `query?: string` — free-text CQL expression (field chips + operators)
- `aiQuery?: string` — natural-language AI/semantic text (separate from CQL)
- `ids?: string` — comma-separated ID list (Share-button mode)
- `since?, until?` — upload-time ISO date range
- `takenSince?, takenUntil?` — date-taken ISO range
- `modifiedSince?, modifiedUntil?` — last-modified ISO range
- `nonFree?, payType?` — cost/rights filter
- `uploadedBy?` — uploader email
- `orderBy?` — named sort order (see Section 3)
- `syndicationStatus?` — syndication workflow state
- `persisted?, hasRightsAcquired?, hasCrops?` — boolean attribute filters
- `expandPinboard?, pinboardId?, pinboardItemId?` — pinboard integration params (passed through)
- `offset?, length?` — page offset and size
- `trackTotalHits?: boolean` — flag requesting an exact total count (expensive scan)

No ES-shape inputs in the domain-visible `search` signature.

**Output vocabulary:** Callers read from `SearchResult`:
- `.hits: Image[]` — the page of image objects
- `.total: number` — total matching documents
- `.sortValues: SortValues[][]` — per-hit cursors used for subsequent pagination
- `.tickerCounts?: Record<string, TickerCountResult>` — named filter group counts
- `.took?, .fetchDuration?` — timing (telemetry only)

**Cursor / pagination semantics:** `search` returns sort cursors that are opaque to the
UI. The store treats them as handles to "page N position" — to get the next page, the
cursor from the last hit of page N is passed to `searchAfter`.

**Optional?** No.

**Implementation accidents to flag:**
- `trackTotalHits: boolean` in `SearchParams` is an ES execution-cost knob, not a
  business concern. The abstract need is "return a reliable total count" — the mechanism
  is an implementation detail.
- `tickerCounts` is bundled into `SearchResult` even though it is logically a separate
  concern from search results. The coupling is a performance optimisation (one round
  trip), not a logical coupling.

---

### `searchRange` — Fetch an additional result page without cancelling active searches

**Method signature:**
```typescript
searchRange(params: SearchParams, signal?: AbortSignal): Promise<SearchResult>;
```

**Abstract need:** Fetch a page of images using the same filter/sort context as the
current search, but without cancelling any in-flight primary search request. Used for
additive background loads (e.g. preloading a visible range of images that isn't
adjacent to the cursor). The caller can cancel via `signal`.

**UI features enabled:**
- Background range fills to populate non-contiguous viewport sections without
  disrupting active scroll-driven loads (0 production `dataSource` call sites — the store
  uses `searchAfter` for all production fills; `searchRange` exists for a specific
  non-cancelling contract needed by `GridApiDataSource`)

**Input vocabulary:** Identical to `search`. No additional ES-shape inputs.

**Output vocabulary:** Identical to `SearchResult` minus `tickerCounts` (range loads
never request ticker aggs — they are additive, not initial).

**Cursor / pagination semantics:** Same as `search`.

**Optional?** No.

**Implementation accidents to flag:** None. The only distinction from `search` is the
absence of request cancellation and ticker aggs — both are expressible without
ES-specific params.

---

### `count` — Count matching documents without returning hits

**Method signature:**
```typescript
count(params: SearchParams): Promise<number>;
```

**Abstract need:** Return the total number of images matching the current filter and
query context, without fetching any image data. Lightweight check.

**UI features enabled:**
- No production call sites in the current store (0 on `dataSource`). Present in
  DAL-contract tests (`dal-contract.test.ts`). Used internally in `GridApiDataSource`
  for `search` implementation.

**Input vocabulary:** Standard `SearchParams` (query, filters). No ES-shape inputs.

**Output vocabulary:** `number` — the count.

**Optional?** No.

**Implementation accidents to flag:** None.

---

### `countWithTickers` — Count new images and return ticker deltas in one round-trip

**Method signature:**
```typescript
countWithTickers(params: SearchParams): Promise<CountWithTickersResult>;
```

**Abstract need:** Determine how many images were added since a given upload-time
boundary AND simultaneously return aggregate counts for each named saved-filter group
(ticker), in a single request. The counts are used additively: the caller receives both
"N new images arrived" and "the ticker for [group X] now has Y members" without issuing
two separate requests.

**UI features enabled:**
- New-images poll — periodic background check for newly uploaded images since last
  seen (`search-store.ts:616`)
- Ticker count refresh after the user saves metadata changes to an image
  (`search-store.ts:1943`)
- Initial ticker population in parallel with the first-page search
  (`search-store.ts:1997`)

**Input vocabulary:**
- `params.since` — upload-time ISO lower bound (the polling window boundary)
- All other `SearchParams` filters — same filter context as the current search
- No ES-shape inputs in the domain signature

**Output vocabulary:** `CountWithTickersResult`:
- `.count: number` — images matching the filter (new-images count)
- `.tickerCounts: Record<string, TickerCountResult>` — per-ticker counts where
  `TickerCountResult = { value: number, subCounts?: Record<string, number> }`

The ticker names are keys defined in `gridConfig.tickerDefinitions` (e.g. "GNM-owned",
"agency picks"). The UI reads `.count` for the banner ("N new images") and
`.tickerCounts` to update the per-ticker badges (`search-store.ts:616–640`).

**Optional?** No.

**Implementation accidents to flag:**
- The ticker definitions (`gridConfig.tickerDefinitions`) are CQL search clauses that
  the adapter compiles to ES DSL at module load. The abstract need requires that the
  server understand these named filter groups — the server already has equivalent named
  aggregations (`ElasticSearch.scala:aggregationsNameToSearchClauseMap`). The client
  should not need to send DSL; it should request named tickers by name.
- **GAP MISSING from the original feasibility study.** Not in any of Gaps 1–18. Needs
  a dedicated gap (Gap 19 or Gap 17 extension). This method is called on every poll
  tick — it cannot be absent in media-api mode.

---

### `getById` — Fetch a single image by identifier

**Method signature:**
```typescript
getById(id: string): Promise<Image | undefined>;
```

**Abstract need:** Retrieve the complete image document for a single known identifier.
Returns `undefined` if the image does not exist (deleted, never ingested, wrong ID).

**UI features enabled:**
- Image detail panel — load full image data when the user opens an image
  (`kupua/src/components/ImageDetail.tsx:235`)

**Input vocabulary:** `id: string` — the image's unique identifier.

**Output vocabulary:** `Image | undefined`. The `Image` type is the full image
document shape. `ImageDetail.tsx:235` uses the entire returned `Image` object.

**Optional?** No.

**Implementation accidents to flag:** None. This is the cleanest method in the interface —
directly maps to the existing `GET /images/:id` media-api endpoint.

---

### `getAggregation` — Get top values for a single field (no search context)

**Method signature:**
```typescript
getAggregation(
  field: string,
  query?: string,
  size?: number
): Promise<AggregationResult>;
```

**Abstract need:** Return the N most common values for a metadata field across the
**entire** image corpus (not filtered by the current search context). Optionally
filtered by a search string to support prefix/substring matching for typeahead. Used
to populate filter-value dropdowns and typeahead suggestions.

**UI features enabled:**
- Typeahead suggestions for metadata fields in the filter panel (field, not query,
  context — `kupua/src/lib/typeahead-fields.ts:207`)

**Input vocabulary:**
- `field: string` — ES field path (e.g. `"metadata.credit"`, `"usageRights.category"`)
- `query?: string` — optional typeahead prefix/substring filter
- `size?: number` — max buckets (default 50)

Neither `field` nor `query` carries ES-shape meaning — `field` is a domain-level field
identifier; `query` is a plain text string.

**Output vocabulary:** `AggregationResult`:
- `.buckets: Array<{ key: string, count: number }>` — value + frequency pairs
- `.total: number` — total documents (all images)

Callers read `.buckets` to render typeahead options (`typeahead-fields.ts:207`).

**Optional?** No.

**Implementation accidents to flag:**
- `query` is implemented as a `multi_match` on `metadata.englishAnalysedCatchAll` —
  a field-specific search behaviour detail. The abstract contract is "filter buckets
  by a text hint"; the server can choose whatever matching strategy is appropriate.

---

### `getAggregations` — Batched multi-field aggregations scoped to current search

**Method signature:**
```typescript
getAggregations(
  params: SearchParams,
  fields: AggregationRequest[],
  signal?: AbortSignal,
): Promise<AggregationsResult>;
```

**Abstract need:** Return document-count distributions for multiple metadata fields
simultaneously, restricted to the images matching the current search context (same
filters and query as the main search). A single round-trip for N field distributions.
Used to populate facet filter counts and typeahead results in context.

**UI features enabled:**
- Facet filter panel — show how many images match each available field value within
  the current search (`search-store.ts:3868`)
- Expanded facet bucket load (load more values for a single field while filtering
  remains active) (`search-store.ts:3908`)
- Context-aware typeahead — show only field values present in the current filtered
  result set (`kupua/src/lib/typeahead-fields.ts:203`)
- Collection image counts — count images per collection across all images
  (`kupua/src/stores/collection-store.ts:140`, with empty `SearchParams`)

**Input vocabulary:**
- `params: SearchParams` — current search context (filters + query). Empty `SearchParams`
  is a valid degenerate case meaning "all images" (no filter).
- `fields: AggregationRequest[]` — array of `{ field: string, size?: number }`. `field`
  is a metadata field path; `size` is max buckets.

No ES-shape inputs.

**Output vocabulary:** `AggregationsResult`:
- `.fields: Record<string, AggregationResult>` — keyed by field path, each entry is
  `{ buckets: Array<{key, count}>, total }`. Callers read the buckets array to render
  filter option counts.
- `.took?, .fetchDuration?` — timing (telemetry only)

**Optional?** No.

**Implementation accidents to flag:**
- `AggregationRequest.field` is a raw ES field path (dot-notation). This is the intended
  abstraction level for this method — field paths are part of the Grid data model,
  not ES-specific (they appear in `SearchParams` too).

---

### `getFilterAggregations` — Count images matching named filter queries

**Method signature:**
```typescript
getFilterAggregations(
  params: SearchParams,
  filters: FilterAggRequest[],
  signal?: AbortSignal,
): Promise<Record<string, number>>;
```

**Abstract need:** For each of a set of named boolean conditions, count how many images
in the current search context satisfy that condition. Returns a map of condition name to
count. Used for `is:` filter badge counts (e.g. "how many deleted images are in this
search?", "how many are under-quota?").

**UI features enabled:**
- `is:` value count badges in the facet filter panel (`search-store.ts:3869`)
- `is:` value counts in CQL typeahead suggestions (`kupua/src/lib/typeahead-fields.ts:376`)

**Input vocabulary:**
- `params: SearchParams` — current search context
- `filters: FilterAggRequest[]` — array of `{ name: string, query: Record<string, unknown> }`

**⚠ ES-SHAPE LEAK:** `FilterAggRequest.query` is a raw ES filter clause. In production,
callers always pass `parseCql("is:deleted").must[0]`, `parseCql("is:under-quota").must[0]`,
etc. — i.e. the CQL parser's translation of known named `is:` filters. The abstract
need requires no raw ES DSL: the server already knows the semantics of `is:deleted`,
`is:under-quota`, `is:owned-photo`, etc. (they are handled by the media-api CQL parser).
The DAL interface should accept `{ name: string, isFilter: string }` or simply a list
of CQL `is:` strings, not ES query objects. The current shape is an accident of the
client-side CQL parsing path.

**Output vocabulary:** `Record<string, number>` — `{ "deleted": 12, "under-quota": 3, ... }`.
Callers read each named count to render the `is:` badge label.

**Optional?** No.

**Implementation accidents to flag:**
- `FilterAggRequest.query: Record<string, unknown>` is a raw ES filter DSL object. This
  is the primary ES-shape leak for this method — see `⚠` above.
- **GAP MISSING from the original feasibility study.** Not in any of Gaps 1–18. Needs
  Gap 18 extension (`isFilters: string[]`) or a new gap.

---

### `openPit` — Open a consistent snapshot for paginated queries

**Method signature:**
```typescript
openPit(keepAlive?: string): Promise<string>;
```

**Abstract need:** Open an immutable snapshot of the index state at the current moment,
returning an opaque handle. While the snapshot is held open, all paginated queries using
the handle see a consistent view of the data — images added or deleted after snapshot
creation do not appear in subsequent pages. The caller is responsible for closing the
snapshot when done.

**UI features enabled:**
- Consistent multi-page browsing — prevents "jumping" results when new images are
  indexed during a user's active scroll session (`search-store.ts:1983`)

**Input vocabulary:** `keepAlive?: string` — duration hint for how long to keep the
snapshot warm (e.g. `"1m"`). Implementation-specific; the abstract contract only
requires "keep it alive long enough for the expected pagination cadence."

**Output vocabulary:** `string` — opaque snapshot handle. Passed back unchanged to
`searchAfter` and `closePit`.

**Cursor / pagination semantics:** The snapshot handle is an input to `searchAfter` —
it binds all subsequent pages to the same consistent view.

**Optional?** No.

**Implementation accidents to flag:**
- `keepAlive` string is ES PIT keep-alive syntax (`"1m"`, `"5m"`). The abstract need
  is "open a snapshot with an appropriate lifetime" — the duration format is an
  implementation detail.

---

### `searchByAi?` — Semantic / AI image search (optional)

**Method signature:**
```typescript
searchByAi?(params: SearchParams, signal?: AbortSignal): Promise<SearchAfterResult>;
```

**Abstract need:** Search for images using a natural-language description, returning
results ranked by semantic relevance. The result is a flat ranked set (≤200 images)
where the total count equals the hit count — no further pagination is expected or
supported. Other active filters (upload date, rights, etc.) narrow the semantic search
space. Optionally, the semantic and keyword signals can be blended via a weight parameter.

**UI features enabled:**
- AI/semantic image search — the user enters a plain-language description to find
  conceptually matching images, distinct from keyword/CQL search
  (`search-store.ts:1881` — called when `params.aiQuery` is set)

**Input vocabulary:**
- `params.aiQuery: string` — the natural-language search text
- `params.vecWeight?: string` — blend weight 0.0 (pure keyword) to 1.0 (pure semantic,
  default). URL-only parameter; no UI control currently.
- All other `SearchParams` filters — applied as a pre-filter narrowing the semantic search

**Output vocabulary:** `SearchAfterResult` — same shape as `searchAfter` but with
`total === hits.length` (the key invariant preventing scroll-mode or position-map
activation). Callers read `.hits`, `.total`, and `.sortValues` (synthetic, by score).

**Optional?** Yes — marked `?` in the interface. Graceful absence: the store only
calls `searchByAi` when it exists (`search-store.ts:1881`). When absent, the store
falls back to a standard `searchAfter` first-page call.

**Implementation accidents to flag:**
- The current ES adapter implementation fetches a vector embedding directly from a
  Vite-proxied Bedrock service (`bedrock-proxy-client.ts`) — a dev-mode shortcut.
  Media-api already implements the identical hybrid KNN algorithm (`hybridSearch()` in
  `ElasticSearch.scala`) via `GET /images?useAISearch=true`. No server gap exists;
  `GridApiDataSource` should delegate to the existing endpoint. The optional marker
  remains appropriate since the endpoint may not be available in all environments.
- `vecWeight` as a URL query string (not a typed enum) is a URL-layer leak. The abstract
  need is a blend parameter; typing and validation belong at the adapter, not in `SearchParams`.

---

### `closePit` — Release a consistent snapshot

**Method signature:**
```typescript
closePit(pitId: string): Promise<void>;
```

**Abstract need:** Release the server-side resources held by a previously opened
snapshot. Fire-and-forget — the snapshot expires automatically after its keepAlive
period regardless, so close failures are benign.

**UI features enabled:**
- Resource cleanup when a new search supersedes the previous one, freeing the old
  snapshot's server-side memory (`search-store.ts:1861`)

**Input vocabulary:** `pitId: string` — the opaque handle returned by `openPit`.

**Output vocabulary:** `void`.

**Optional?** No.

**Implementation accidents to flag:** None beyond the `pitId` name being ES-specific
(see Section 4). The abstract contract is simply "release this snapshot handle."

---

### `searchAfter` — Fetch one page starting at a cursor position

**Method signature:**
```typescript
searchAfter(
  params: SearchParams,
  searchAfterValues: SortValues | null,
  pitId?: string | null,
  signal?: AbortSignal,
  reverse?: boolean,
  noSource?: boolean,
  missingFirst?: boolean,
  sortOverride?: Record<string, unknown>[],
  extraFilter?: Record<string, unknown>,
): Promise<SearchAfterResult>;
```

**Abstract need:** Fetch one page of images in the current search context, starting
strictly after (or before, when `reverse=true`) a given cursor position. Cursor `null`
means start from the logical beginning (or end when reversed). The snapshot handle
ensures consistent results across pages. Returns per-hit cursors for the next call.

**UI features enabled:**
- All scroll-driven grid paging — forward extend, backward extend, buffer fill, seek
  to arbitrary position, sort-around-focus, restore-position-after-route-change
  (23 call sites in `search-store.ts` — documented in findings-4 Part 1)

**Input vocabulary:**
- `params: SearchParams` — query, filters, sort order
- `searchAfterValues: SortValues | null` — opaque cursor (null = first page)
- `pitId?: string | null` — snapshot handle; null/omitted = no consistency guarantee
- `signal?: AbortSignal` — cancellation
- `reverse?: boolean` — if true, walk backwards from the cursor
- `noSource?: boolean` — if true, return only cursors, no image data (internal only — see Implementation accidents)
- `missingFirst?: boolean` — when reversing, treat missing-field docs as first rather than last

**⚠ ES-SHAPE LEAKS (two parameters):**
- `sortOverride?: Record<string, unknown>[]` — raw ES sort DSL. In production, always
  `[{ uploadTime: dir }, { id: "asc" }]`, fully derivable from `params.orderBy` via
  `buildSortClause`. Passed only for null-zone requests (see findings-4 Notes 1+2).
  The abstract need: "for null-zone docs, use the fallback sort instead of the primary
  sort." This should be handled transparently server-side (Gap 10).
- `extraFilter?: Record<string, unknown>` — raw ES filter DSL. In production, always
  `{ bool: { must_not: { exists: { field: primaryField } } } }` where `primaryField` is
  the primary sort field derived from `orderBy`. Again, only for null-zone requests.
  The abstract need: "restrict this page to documents missing their primary sort field."
  Should also be handled transparently server-side (Gap 10).

**Output vocabulary:** `SearchAfterResult`:
- `.hits: Image[]` — the page of images
- `.total: number` — total matching documents (0 when `trackTotalHits` not set)
- `.sortValues: SortValues[]` — per-hit cursors — parallel array to `.hits`
- `.pitId?: string | null` — updated snapshot handle (may differ from input if server
  refreshed it; explicit `null` signals PIT expiry)
- `.took?, .fetchDuration?` — timing (telemetry only)

**Cursor / pagination semantics:** The next page starts strictly after the cursor of
the last hit in the current page (in the requested sort direction), skipping no items
and duplicating none. The cursor encodes the exact ordered position and is opaque to
the UI — only the DAL and store manage cursor values. Reversed pages return hits in
the original sort order (re-reversed before return).

**Optional?** No.

**Implementation accidents to flag:**
- `sortOverride` and `extraFilter` are ES DSL. They should not be in the public DAL
  interface — see Gap 10 and findings-4 Notes 1+2.
- `noSource` controls whether `_source` is returned. This is never passed by any
  client code — it is only used internally within `es-adapter.getIdRange` (which
  calls `this.searchAfter` with `noSource: true`). It is an internal implementation
  detail that leaked into the interface. `GridApiDataSource` for `getIdRange` uses a
  dedicated endpoint (Gap 13) and `noSource` need never appear in the client-facing contract.
- `missingFirst` is a sort-modifier for reverse seek to end on keyword-sorted fields.
  While the abstract need ("seek to the logical end of the result set when primary
  field has missing values") is real, the parameter name leaks the ES `missing: "_first"`
  sort option. The abstract contract could express this as `seekToEnd: boolean`.
- `SortValues = (string | number | null)[]` encodes ES's multi-field sort value array.
  It is opaque as an interface contract but its shape is ES-specific.

---

### `countBefore` — Find a document's position in the current result set

**Method signature:**
```typescript
countBefore(
  params: SearchParams,
  sortValues: SortValues,
  sortClause: Record<string, unknown>[],
  signal?: AbortSignal,
): Promise<number>;
```

**Abstract need:** Determine the 0-based position of a document in the current search
result set, given its sort cursor. The position equals the number of documents that
sort strictly before the target document in the current sort order. Used to "land" at
the right place in the grid after seeking or after the user opens an image URL directly.

**UI features enabled:**
- Sort-around-focus — finding where a specific image currently sits after sort order
  changes (`search-store.ts:1414, 1434`)
- Seek position confirmation — verify the exact position after a coarse percentile/
  keyword seek lands near the target (`search-store.ts:1592, 3061, 3114, 3169`)
- Restore-around-cursor — re-establish position after navigating away and back
  (`search-store.ts:3701`)
- Deep null-zone seek landing (`search-store.ts:2985`)

**Input vocabulary:**
- `params: SearchParams` — current search context
- `sortValues: SortValues` — the target document's cursor (opaque position handle)

**⚠ ES-SHAPE LEAK:**
- `sortClause: Record<string, unknown>[]` — raw ES sort DSL. In production, always
  `buildSortClause(params.orderBy)` — i.e. the sort clause is fully derivable from
  `params.orderBy`. The server already knows how to build this from the `orderBy`
  string. This parameter should be eliminated from the abstract contract.

**Output vocabulary:** `number` — the 0-based position of the document. Callers use
this to position the virtual scroll window and set `startIndex` in the search store.

**Optional?** No.

**Implementation accidents to flag:**
- `sortClause: Record<string, unknown>[]` is the most gratuitous ES leak in the
  interface. It is always derivable from `params.orderBy` and should be removed.
  Callers construct it with `buildSortClause(params.orderBy)` immediately before the
  call — the adapter could compute it itself.

---

### `estimateSortValue` — Estimate the sort field value at a given percentile

**Method signature:**
```typescript
estimateSortValue(
  params: SearchParams,
  field: string,
  percentile: number,
  signal?: AbortSignal,
): Promise<number | null>;
```

**Abstract need:** Find an approximate value of the primary sort field that corresponds
to a given percentage position in the result set — e.g. "what upload-date corresponds
to roughly the 60% mark?" Used as a coarse anchor for deep seek when the result set
exceeds the direct-offset window (~10,000 docs). The returned value is used to construct
a cursor that is close to the target position, after which `countBefore` refines the
exact position.

**UI features enabled:**
- Deep seek for date-sorted fields — user presses End key or drags scrubber to a deep
  position beyond the direct-offset window (`search-store.ts:3033`)
- Deep null-zone seek — seeking within the null-zone portion of upload-time sorted
  results (`search-store.ts:2909`)

**Input vocabulary:**
- `params: SearchParams` — current search context
- `field: string` — primary sort field path (e.g. `"uploadTime"`, `"metadata.dateTaken"`)
- `percentile: number` — target percentile 0–100
- `signal?: AbortSignal`

**Output vocabulary:** `number | null` — the estimated epoch-millisecond value at that
percentile, or `null` if the estimate is unavailable (aborted, field has no values).

**Optional?** No.

**Implementation accidents to flag:**
- `field` is an ES field path. In production, always the primary sort field derived
  from `params.orderBy` via `parseSortField(buildSortClause(orderBy)[0])`. The server
  could derive this from `orderBy` itself, eliminating the parameter.

---

### `findKeywordSortValue?` — Walk to a keyword value at a given global position

**Method signature:**
```typescript
findKeywordSortValue?(
  params: SearchParams,
  field: string,
  targetPosition: number,
  direction: "asc" | "desc",
  signal?: AbortSignal,
): Promise<string | null>;
```

**Abstract need:** Find the keyword value (e.g. photographer name, agency credit) that
occupies a specific global position in the sorted result set. Used for deep seek on
non-numeric sort fields where percentile estimation is not available. The caller uses
the returned value as an approximate cursor anchor, then refines with `countBefore`.

**UI features enabled:**
- Deep seek for keyword-sorted fields (credit, supplier, etc.) — user drags scrubber
  or presses End key on a non-date sort (`search-store.ts:3081`)

**Input vocabulary:**
- `params: SearchParams` — search context
- `field: string` — keyword sort field path (e.g. `"metadata.credit"`)
- `targetPosition: number` — the 0-based global position to seek to
- `direction: "asc" | "desc"` — sort direction

**Output vocabulary:** `string | null` — the keyword value at the target position, or
`null` if not found (aborted, exhausted). The caller uses this as a search-after cursor
anchor.

**Optional?** Yes — marked `?`. Graceful absence: the store checks
`dataSource.findKeywordSortValue` before calling and falls back to a capped from/size
seek if absent (`search-store.ts:3081` guard). Keyword-sorted deep seek degrades to a
~100k position limit without it.

**Implementation accidents to flag:**
- `field` is an ES field path, same as `estimateSortValue`. Derivable from `params.orderBy`.
- `direction` is also derivable from `params.orderBy` via `parseSortField`. Both could
  be eliminated if the server computes the sort spec from `orderBy`.

---

### `getKeywordDistribution?` — Fetch all unique values for a keyword sort field

**Method signature:**
```typescript
getKeywordDistribution?(
  params: SearchParams,
  field: string,
  direction: "asc" | "desc",
  signal?: AbortSignal,
): Promise<SortDistribution | null>;
```

**Abstract need:** Retrieve the complete ordered list of unique values for a keyword
sort field, together with their document counts and cumulative position indices. This
pre-built index enables the scrubber to map any pixel position to the corresponding
keyword value in O(log n) time during drag, with no additional network requests.

**UI features enabled:**
- Scrubber tooltip for keyword-sorted fields — show "you are at: Getty Images /
  position ~45,000" as the user drags the scrubber (`search-store.ts:3972`)

**Input vocabulary:**
- `params: SearchParams` — search context
- `field: string` — keyword sort field path
- `direction: "asc" | "desc"` — sort direction

**Output vocabulary:** `SortDistribution | null`:
- `.buckets: SortDistBucket[]` — ordered unique values: `{ key, count, startPosition }`
- `.coveredCount: number` — total docs with non-null values (may be less than `.total`
  if some docs have null for this field)

Callers use binary search on `.buckets` to find the bucket containing a given position
(`search-store.ts:3972`).

**Optional?** Yes — marked `?`. Graceful absence: scrubber shows a position number
only (no value label). No crash.

**Implementation accidents to flag:**
- `field` and `direction` are both derivable from `params.orderBy`.
- Capped at 5 composite pages (~50k unique values) in the ES implementation. The cap
  is an implementation choice, not an abstract contract requirement.

---

### `getDateDistribution?` — Fetch a time-interval histogram for a date sort field

**Method signature:**
```typescript
getDateDistribution?(
  params: SearchParams,
  field: string,
  direction: "asc" | "desc",
  signal?: AbortSignal,
  extraFilter?: Record<string, unknown>,
): Promise<SortDistribution | null>;
```

**Abstract need:** Retrieve a histogram of document counts over time for a date sort
field, with adaptive bucket granularity (month/day/hour/sub-hour based on the time
span), plus cumulative position indices. Enables O(log n) position-to-date mapping
during scrubber drag. A variant of the call restricts the histogram to documents that
are *missing* the primary sort field (null-zone) — for the "where does the null zone
fall on the upload-time axis?" use case.

**UI features enabled:**
- Scrubber tooltip for date-sorted fields — show "you are at: March 2024" as the user
  drags (`search-store.ts:3977`)
- Null-zone upload-time distribution — position the null-zone segment on the scrubber
  accurately when the primary sort field is not upload time (`search-store.ts:4030`)

**Input vocabulary:**
- `params: SearchParams` — search context
- `field: string` — date field path (e.g. `"uploadTime"`, `"metadata.dateTaken"`)
- `direction: "asc" | "desc"` — sort direction

**⚠ ES-SHAPE LEAK:**
- `extraFilter?: Record<string, unknown>` — raw ES query object. In production, only
  ever `{ bool: { must_not: { exists: { field: primaryField } } } }` (restrict to
  null-zone docs). The abstract need is "optionally restrict to documents missing the
  primary sort field." This could be expressed as `missingField?: string` (the server
  adds the constraint server-side). See findings-4 Note 5.

**Output vocabulary:** `SortDistribution | null` — same as `getKeywordDistribution`.
Buckets are ISO date strings (`key_as_string` from ES) with doc counts and cumulative
positions.

**Optional?** Yes — marked `?`. Graceful absence: scrubber shows position number only
(no date label). Null-zone distribution absent means null-zone scrubber segment is not
positioned.

**Implementation accidents to flag:**
- `extraFilter` is an ES DSL object — the only production use case (`missingField`)
  can be expressed as a named parameter.
- `field` and `direction` are derivable from `params.orderBy`.

---

### `fetchPositionIndex?` — Build a complete position-to-cursor map for the result set

**Method signature:**
```typescript
fetchPositionIndex?(
  params: SearchParams,
  signal: AbortSignal,
): Promise<PositionMap | null>;
```

**Abstract need:** Fetch the ordered list of IDs and their sort cursors for every
document in the current result set, with no image content (metadata-free). The
resulting map allows the store to translate any global position to an exact cursor in
O(1) time, enabling instant seek without additional network requests during rapid
scrubber movement. The fetch is chunked and interleaved with the main thread to avoid
jank.

**UI features enabled:**
- Instant seek at any position via scrubber — once the position map is built, seeking
  involves no additional network round-trips (`search-store.ts:1015`)

**Input vocabulary:**
- `params: SearchParams` — search context (same filters as the current search)
- `signal: AbortSignal` — cancellation (the background fetch is aborted when a new
  search starts)

**Output vocabulary:** `PositionMap | null`:
- `.ids: string[]` — ordered image IDs (parallel to `.sortValues`)
- `.sortValues: SortValues[]` — per-document sort cursors
- `.length: number` — total entries

Callers index into `.ids` and `.sortValues` by global position to get the cursor for
any seek target (`search-store.ts:1015`).

**Optional?** Yes — marked `?`. Graceful absence: seek falls back to percentile/
keyword estimation paths. The scrubber still works but seek is less instant for large
result sets.

**Implementation accidents to flag:**
- The current implementation opens its own dedicated PIT (internally) and runs a
  multi-phase fetch to handle null-zone docs correctly. This is an implementation
  detail, not an abstract contract concern.
- For a media-api implementation, a custom streaming endpoint would likely be needed
  (the result set can be 100k+ documents). Gap 8 covers this.

---

### `getByIds` — Fetch multiple images by ID in a single logical operation

**Method signature:**
```typescript
getByIds(ids: string[], signal?: AbortSignal): Promise<Image[]>;
```

**Abstract need:** Retrieve complete image documents for a set of known IDs, treating
the batch as a single logical request regardless of how many IDs are involved. Missing
IDs (deleted, non-existent) are silently absent from the result. Result order is not
guaranteed to match input order.

**UI features enabled:**
- Multi-selection load — fetch full image data for all selected images after the user
  makes a batch selection (`kupua/src/stores/selection-store.ts:673`)
- Post-metadata-fetch image refresh — reload image data after updating metadata for
  selected images, to reflect changes (`kupua/src/stores/selection-store.ts:635`)

**Input vocabulary:**
- `ids: string[]` — image IDs (potentially thousands)
- `signal?: AbortSignal`

**Output vocabulary:** `Image[]` — array of found image objects. Callers use the full
`Image` shape for display and bulk-action logic.

**Optional?** No.

**Implementation accidents to flag:**
- Internally batches into 1,000-ID chunks run in parallel — this is an ES `_mget`
  limitation. The abstract contract makes no promise about batching; the server
  implementation for media-api can handle this differently (e.g. multi-ID query param
  or POST body, no batch limit).
- `_source_includes` is passed as a URL parameter to stay within request size limits.
  An abstract-level implementation detail.

---

### `getIdRange` — Walk all image IDs between two cursor positions

**Method signature:**
```typescript
getIdRange(
  params: SearchParams,
  fromCursor: SortValues,
  toCursor: SortValues,
  signal?: AbortSignal,
): Promise<IdRangeResult>;
```

**Abstract need:** Return the ordered list of image IDs for all images between two
cursor positions in the current sort order (exclusive lower bound, inclusive upper
bound). Used for shift-click range selection — collect every image ID between the
anchor and the click target. Hard-capped at 5,000 IDs to prevent runaway fetches.

**UI features enabled:**
- Shift-click range selection — select all images between two grid positions
  (`kupua/src/hooks/useRangeSelection.ts:225`)
- Swap-and-retry on direction mismatch — retry with swapped cursors when the initial
  walk returns nothing (direction ambiguity in seek mode) (`useRangeSelection.ts:252`)

**Input vocabulary:**
- `params: SearchParams` — current search context (same filters + sort as main search)
- `fromCursor: SortValues` — exclusive lower bound cursor
- `toCursor: SortValues` — inclusive upper bound cursor

**Caller contract note:** `fromCursor` must sort earlier than `toCursor` in the current
sort direction. If order is unknown, caller tries once; if `walked === 0`, swaps and
retries (the two-call pattern at `useRangeSelection.ts:225, 252`).

**Output vocabulary:** `IdRangeResult`:
- `.ids: string[]` — ordered image IDs within the range (capped at 5,000)
- `.truncated: boolean` — true if there were more than 5,000 IDs in the range
- `.walked: number` — number of documents examined (telemetry)
- `.fetchDuration?: number` — total wall-clock ms for the walk

Callers read `.ids` for bulk selection and `.truncated` to show a "range too large"
warning.

**Cursor / pagination semantics:** The walk covers the half-open interval
`(fromCursor, toCursor]` in the current sort order, stopping at the hard cap or at
`toCursor`, whichever comes first. The cursors are the same `SortValues` opaque type
used throughout the DAL — the caller reads them from the store's buffer.

**Optional?** No.

**Implementation accidents to flag:**
- The current implementation calls `this.searchAfter(... noSource: true ...)` internally —
  `noSource` is an internal optimisation, not a client-visible concern. Gap 13's
  server-side endpoint returns only IDs by design.
- The hard cap (5,000) is configured via `VITE_RANGE_HARD_CAP` env var — an
  implementation-level tuning constant. The abstract contract is "hard-capped range
  walk"; the specific cap value is a deployment concern.
- The null-zone crossing detection (checking if the last cursor crossed into null-zone)
  is handled internally by the implementation. The abstract contract makes no null-zone
  promises — it simply returns "all IDs in this sort range."

---

## Section 3 — Cross-cutting needs

### 1. Null-zone semantics

**Product behaviour:** Some images are missing their primary sort field value
(e.g. a photo with no `metadata.dateTaken` when sorting by date taken). In the UI,
these images appear at the end of the sorted result set — they don't disappear. A user
scrolling to the end of a date-taken sort will encounter them. The store must be able to
paginate through them, seek within them, and count their positions correctly.

**DAL contract impact:** The abstract need is "handle images with missing primary sort
field as a valid, reachable segment at the tail of the sort." How the server implements
this (the "null zone" — filtering to `must_not: exists` on the primary field, falling
back to a secondary sort) is an implementation detail that Gap 10 is designed to
encapsulate server-side.

**Evidence:** `kupua/src/dal/null-zone.ts` (whole file); `search-store.ts` B-group and
E1 call sites (findings-4 Part 1).

### 2. Tickers / saved-filter counts

**Product behaviour:** The toolbar shows live-updating badge counts for named groups
(e.g. "GNM-owned: 42", "agency picks: 17"). Counts update when new images arrive
(poll tick), when the user changes the search, and when the user saves metadata.

**DAL contract impact:** Covered by `countWithTickers` — one round-trip that returns
both new-image count and ticker deltas. Ticker definitions (which CQL expressions map
to which badge) are server-held configuration; the client sends a count request and
receives the counts by name. Not in the original gap plan — needs Gap 19.

**Evidence:** `search-store.ts:616, 1943, 1997`; `gridConfig.tickerDefinitions`.

### 3. Sort orders

The UI exposes the following named sort orders via `params.orderBy`:

| orderBy value | Primary field | Direction |
|---------------|---------------|-----------|
| `-uploadTime` (default) | `uploadTime` | desc |
| `uploadTime` | `uploadTime` | asc |
| `-taken` | `metadata.dateTaken` | desc |
| `taken` | `metadata.dateTaken` | asc |
| `dateAddedToCollection` | `dateAddedToCollection` | asc |
| *(blank/undefined)* | `uploadTime` | desc (same as `-uploadTime`) |

All sort orders include `{ id: "asc" }` as a tiebreaker. The `dateAddedToCollection`
sort is only meaningful when a collection filter is active (it is undefined for
non-collection searches). Evidence: `buildSortClause` in
`kupua/src/dal/adapters/elasticsearch/sort-builders.ts` (not read in full — cited
from findings-4 Parts 2+3 and types.ts comment on `orderBy`).

### 4. Filter vocabulary

**CQL / free-text:** `SearchParams.query` accepts a CQL expression parsed by
`parseCql` (client-side). Supported operators include field chips (`credit:Getty`),
`is:` values (`is:deleted`, `is:under-quota`, `is:owned-photo`), negation, and
unstructured free text. The server's CQL parser handles the same grammar.

**Structured filters:** Upload date, date taken, last modified (ISO ranges), cost type
(`payType`), uploader email, rights acquired, crops present, syndication status,
persisted flag — all expressed as named `SearchParams` fields.

**Pinboard:** `expandPinboard, pinboardId, pinboardItemId` — passed through to the
server; not processed by kupua.

**Named IS-filters for aggregations:** The `is:` keywords (`deleted`, `under-quota`,
`${org}-owned-photo`, etc.) are used in two contexts: (a) as free-text query chips in
`params.query`, (b) as named aggregation targets in `getFilterAggregations`. In context
(b), the client currently compiles them to ES DSL via `parseCql` before calling the
DAL — an accident that should be eliminated (pass the names, let the server compile).

### 5. AI / semantic search

**Product behaviour:** The user enters a natural-language description in the search bar
as a special chip (`aiQuery:"..."`). Results are ranked by semantic relevance (vector
similarity) rather than sort order. No pagination; the result set is ≤200 images.
The semantic and keyword signals can be blended via `vecWeight` (URL-only).

**DAL contract:** `searchByAi?` — optional. Media-api already satisfies the need via
`GET /images?useAISearch=true`. No server gap.

**Evidence:** `search-store.ts:1881`; findings-4 Note 6.

### 6. Position-in-grid awareness

Several methods collectively serve the need "tell the UI exactly where a document is,
and allow seeking to any position without scanning from position 0":

| Method | Role in position system |
|--------|------------------------|
| `countBefore` | Exact position of a known document |
| `estimateSortValue` | Approximate position → date value mapping (for > ~10k docs) |
| `findKeywordSortValue?` | Approximate position → keyword value mapping (for > ~10k docs) |
| `fetchPositionIndex?` | Complete position map (instant O(1) seek for any result set) |
| `getKeywordDistribution?` | Pre-built position→value index for keyword sort tooltip |
| `getDateDistribution?` | Pre-built position→date index for date sort tooltip |

**Product behaviour enabled:** Scrubber drag with live tooltips; "End" key jumping to
last image; sort-around-focus (user sorts by date-taken, previously selected image
stays in view); restore scroll position after navigation.

**Evidence:** `search-store.ts` seek paths (ss:2597–ss:3278); `search-store.ts:3972,
3977, 4030`.

---

## Section 4 — Inputs/outputs that look ES-shaped (red flags)

The following interface members accept or return ES-DSL-shaped values rather than
domain-shaped values. These are candidates for elimination before Phase 3 — removing
them shrinks the gap surface and prevents ES-query injection.

| # | Method | Parameter / field | ES shape | Abstract need | Recommended fix |
|---|--------|-------------------|----------|---------------|-----------------|
| 1 | `searchAfter` | `sortOverride?: Record<string, unknown>[]` | ES sort clause array | "use fallback sort for null-zone docs" | Eliminate; handled by Gap 10 server-side |
| 2 | `searchAfter` | `extraFilter?: Record<string, unknown>` | ES filter DSL | "restrict to null-zone docs" | Eliminate; handled by Gap 10 server-side |
| 3 | `searchAfter` | `noSource?: boolean` | ES `_source: false` | "return only cursors, no image data" | Eliminate from public interface; internal to `getIdRange` implementation |
| 4 | `searchAfter` | `missingFirst?: boolean` | ES `missing: "_first"` sort option | "seek to logical end on keyword sort" | Rename to `seekToEnd?: boolean` (abstract intent) |
| 5 | `countBefore` | `sortClause: Record<string, unknown>[]` | ES sort clause array | "position of document in current sort" | Eliminate; server derives from `params.orderBy` |
| 6 | `getFilterAggregations` | `FilterAggRequest.query: Record<string, unknown>` | ES filter DSL | "count images matching named IS-filter" | Replace with `isFilter: string` (the CQL name) |
| 7 | `getDateDistribution?` | `extraFilter?: Record<string, unknown>` | ES filter DSL | "restrict histogram to null-zone docs" | Replace with `missingField?: string` |
| 8 | `openPit` | `keepAlive?: string` | ES PIT keep_alive string | "keep snapshot alive for pagination session" | Can remain opaque; the format detail is low-risk |
| 9 | `SearchAfterResult.pitId` | `pitId?: string \| null` | ES PIT ID | "updated snapshot handle after refresh" | Rename to `snapshotId`; semantics already abstract |
| 10 | `SearchParams.trackTotalHits` | `trackTotalHits?: boolean` | ES `track_total_hits` flag | "return an exact total count on first page" | Rename to `exactCount?: boolean` or make implicit for `search()` |

Items 1–3 and 5–7 are the highest-priority eliminations — they are the only ones that
create a true ES-query-injection surface at the client-server boundary.

---

## Section 5 — Methods that may be redundant or fusible

### `search` ↔ `searchAfter` (first page)

`search` (0 production call sites on `dataSource`) and `searchAfter(params, null, pitId)`
(first-page call at `search-store.ts:1987`) serve the same abstract need: "fetch the
first page." In production, `search` is never called directly — the store always uses
`searchAfter` for first-page fetches (to get the PIT binding). For `GridApiDataSource`,
both will map to the same `/images` endpoint. The interface keeps `search` for
backward-compatibility with the DAL contract test suite, but Phase 3 may decide to
remove it from the abstract interface if `GridApiDataSource`'s first-page path goes
entirely through `searchAfter`.

### `count` ↔ `countWithTickers`

`count` has 0 production call sites; `countWithTickers` supersedes it for all live use
cases (poll + initial ticker fetch). If `GridApiDataSource` implements `countWithTickers`
as a count-plus-tickers endpoint, `count` becomes a degenerate case
(`countWithTickers(params).then(r => r.count)`). One endpoint, two methods.

### `findKeywordSortValue?` ↔ `getKeywordDistribution?`

`findKeywordSortValue` walks keyword values to find a single position target, with early
exit. `getKeywordDistribution` fetches the full distribution. For result sets with few
unique values, the distribution covers the `findKeywordSortValue` use case via binary
search (the store already does this when both are present). For very high-cardinality
fields, `findKeywordSortValue`'s early exit is faster. The two methods are complementary
rather than truly redundant; Phase 3 should evaluate whether one endpoint covers both
use cases.

---

## Section 6 — Coverage gaps

1. **`getFilterAggregations` ticker names at runtime**: The `is:` filter names passed
   to `getFilterAggregations` are derived from `parseCql("is:deleted")` etc. at call
   time. The full set of `is:` values recognised by the server is not enumerated in
   `types.ts`. Phase 3 should confirm the server handles `is:deleted`, `is:under-quota`,
   and `is:${org}-owned-photo` (dynamic, org-prefixed) — the last one may require
   server-side configuration rather than a static name list.

2. **`PositionMap` response size at scale**: `fetchPositionIndex` fetches all IDs and
   cursors for the full result set. For a 500k-image search, the response could exceed
   several hundred megabytes. Phase 3 needs to evaluate whether a streaming/chunked
   endpoint or a client-held partial map is more practical than a single response.

3. **`countWithTickers` ticker definition sync**: The client and server must agree on
   which CQL expressions map to which ticker names. Currently the client compiles ticker
   CQL (`gridConfig.tickerDefinitions`) to ES DSL at module load; the server has its own
   equivalent (`aggregationsNameToSearchClauseMap`). Phase 3 should confirm name parity
   between client `gridConfig.tickerDefinitions` and server's named aggregations before
   designing Gap 19.

4. **Collections service dependency**: `collection-store.ts` fetches the collection tree
   from the Grid collections service directly — not through `ImageDataSource`. The
   `getAggregations({},[{ field: "collections.pathId", size: 6000 }])` call counts images
   per collection, but the collection tree (names, hierarchy, URIs) comes from a separate
   service. Phase 3 needs a separate integration plan for collection tree navigation that
   is outside this document's scope.

5. **`searchByAi?` image-to-image KNN**: Media-api supports `q=similar:<imageId>` for
   image-to-image similarity search (`hybridSearch()` in `ElasticSearch.scala`). Kupua
   does not currently expose this in the UI or in `SearchParams`. Not a gap for Phase 3
   (no call site exists), but noted as a capability that `GridApiDataSource.searchByAi`
   will inherit for free.

---

## Section 7 — Anti-goals appendix (≤30 items, one line each)

1. `SortValues = (string | number | null)[]` could be branded (`type SortValues = ...`)
   to prevent accidental array literal construction.
2. `SearchParams` has grown to 26+ fields — a split into `FilterParams | PaginationParams`
   might improve readability.
3. `AggregationResult.total` is the total document count (not the bucket count) — the
   field name is misleading.
4. `SearchResult.sortValues` is a parallel array to `hits`; bundling `{ hit, sortValues }`
   per item would be safer.
5. `getById` could return `Image` (throwing on 404) rather than `Image | undefined`
   to surface real 404s more explicitly in the UI.
6. `countBefore` with all-null `sortValues` should be defined to return 0 — the
   current ES implementation happens to do this but the contract doesn't say so.
7. `getDateDistribution` makes two ES requests (stats then histogram); a server
   implementation that returns both in one request would halve latency.
8. `findKeywordSortValue` has a `TIME_CAP_MS = 8000` guard not reflected in the
   interface contract — callers assume the result is accurate, not time-limited.
9. `openPit`/`closePit` are symmetric but not typed as a matched pair; a leaked or
   never-opened PIT would not be caught by the type system.
10. `getIdRange` returns IDs in sort order but the hard-cap truncation may include
    partial sort-value buckets — the truncation boundary is at a random ID within a
    bucket, not at a sort value boundary.
11. `SearchParams.offset` is used only for shallow seeks (<10k); combining it with
    `searchAfterValues` in `searchAfter` is confusing (one or the other, never both).
12. `AggregationsResult.fields` is keyed by field path (dotted), which can collide
    with JavaScript property access syntax.
13. `SearchAfterResult.total` is 0 when `trackTotalHits: false` — callers who forget
    to check will silently show "0 results."
14. `TickerCountResult.subCounts` being `undefined` vs empty object is inconsistent
    between tickers with and without `subAggField`.
15. `getAggregation` uses a `multi_match` on `englishAnalysedCatchAll` for `query`
    filtering — a language-specific field, not appropriate for non-English metadata.
16. `getByIds` returns partial results silently on abort — callers may assume
    completeness.
