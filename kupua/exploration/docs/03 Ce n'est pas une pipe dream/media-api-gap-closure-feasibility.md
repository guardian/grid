# Media-API Gap Closure — Feasibility Assessment

**Date:** 10 May 2026
**Researcher:** Sonnet High
**Scope:** 15 in-scope gaps (14 capability gaps + 1 defect) from §B of
`kupua/exploration/docs/00 Architecture and philosophy/enrichment-strategy.md`.
**Deliverable:** Difficulty + who-bucket ratings per gap. No fix proposals.

---

## Section 0.5 — §B Reconciliation

`kupua/src/dal/types.ts` verified against §B as of 10 May 2026.

`ImageDataSource` contains exactly 17 methods:
`search`, `searchRange`, `count`, `getById`, `getAggregation`, `getAggregations`,
`openPit`, `closePit`, `searchAfter`, `countBefore`, `estimateSortValue`,
`findKeywordSortValue?`, `getKeywordDistribution?`, `getDateDistribution?`,
`fetchPositionIndex?`, `getByIds`, `getIdRange`.

`searchRange` (added S1 for range-load non-coalescing) uses the same ES primitives
as `search` (`_search` + `from`/`size` + sort). It is represented in §B row 20
("search (basic results)"). Not a new gap. No other drift. **§B verified current.**

---

## Summary Table

| Gap | Capability | Difficulty | Who | Backcompat |
|---|---|---|---|---|
| 1 | `searchAfter` cursor pagination | **Moderate** | Model-solo | New route |
| 2 | Point-in-Time (PIT) | **Easy** | Mixed | New routes |
| 3 | `countBefore` (position lookup) | **Moderate** | Model-solo | New route |
| 4 | `estimateSortValue` (percentile seek) | **Easy** | Mixed | New route |
| 5 | `findKeywordSortValue` (composite walk) | **Moderate** | Model-solo | New route |
| 6 | `getKeywordDistribution` (full composite) | **Moderate** | Model-solo | New route |
| 7 | `getDateDistribution` improvements | **Easy** | Model-solo | Extend existing route (additive) |
| 8 | `fetchPositionIndex` (full position map) | **Hard** | Mixed | New route |
| 9 | Reverse sort / `missingFirst` | **Easy** | Model-solo | New optional params on Gap 1 route |
| 10 | Two-phase null-zone seek | **Moderate** | Mixed | Transparent in Gap 1 route |
| 11 | `_source` response field filtering | **Easy** | Model-solo | New optional param |
| 12 | `getByIds` improvements | **Easy** | Model-solo | New route |
| 13 | `getIdRange` (cursor walk) | **Hard** | Mixed | New route |
| 15 | **DEFECT** `?ids=` order not preserved | **Easy** | Human-required | Breaking change |
| 17 | Dedicated `count` endpoint | **Trivial** | Model-solo | New route |
| 18 | `getAggregations` (batched multi-field) | **Easy** | Model-solo | New route |

---

## Tier 1 — Foundational pagination

### Gap 1 — `searchAfter` cursor pagination

**Difficulty:** Moderate
**Who:** Model-solo
**Endpoint sketch:** `POST /images/search-after { q, filters, orderBy, sortValues, length } → { hits (enriched), nextSortValues, total }`

**What would need to change:**
- `media-api/conf/routes`: new `POST /images/search-after` route
- `media-api/app/controllers/MediaApi.scala`: new handler, replicating `hitToImageEntity` pattern from `imageSearch()` at line ~546
- `media-api/app/lib/elasticsearch/ElasticSearch.scala`: new method using elastic4s `SearchRequest.searchAfter(sortValues)` — the existing `search()` already builds `query`, `filter`, and `sort`; new method adds `search_after` param + drops `from`/`size` offset constraint
- `media-api/app/lib/elasticsearch/ElasticSearchModel.scala`: new params case class (or extend `SearchParams` with an optional `sortValues: Option[List[Any]]`)

**Hard blockers:** None. elastic4s 8.18.2 (`build.sbt:81`) tracks ES 8.18.x which fully supports `search_after`. The sorts infrastructure in `sorts.scala` already produces `Seq[Sort]` that elastic4s passes directly.

**Backcompat note:** Must be a new route `POST /images/search-after` — extending `GET /images` to accept `sortValues` would change pagination semantics for Kahuna.

**Risks:**
1. Response shape decision: follow existing Argo `respondCollection` format or a simpler `{hits, nextSortValues, total}`? Argo format (with per-image `EmbeddedEntity` URI links) adds ~200 LOC of response marshalling.
2. Syndication tier filtering: `hitToImageEntity` calls `isVisibleToAccessor` — must be replicated in the new handler (cite: `MediaApi.scala:161`).
3. `countAll` semantics: existing endpoint passes `trackTotalHits` to ES; new endpoint should follow same pattern.

---

### Gap 2 — Point-in-Time (PIT)

**Difficulty:** Easy
**Who:** Mixed
**Endpoint sketch:** `POST /images/pit { keepAlive? } → { pitId: string }` / `DELETE /images/pit/:pitId → 204`

**What would need to change:**
- `media-api/conf/routes`: two new routes (`POST /images/pit`, `DELETE /images/pit/:pitId`)
- `media-api/app/controllers/MediaApi.scala`: two new handlers — proxy `POST {index}/_pit?keep_alive=...` to ES and return the opaque PIT ID; proxy `DELETE /_pit { id }` and return 204
- `media-api/app/lib/elasticsearch/ElasticSearch.scala`: `openPit` and `closePit` methods using elastic4s

**Hard blockers:** None. ES 8.x fully supports PIT (introduced ES 7.10). elastic4s 8.18.2 (`build.sbt:81`) should expose `createPitRequest` / `deletePitRequest`. Open question (below) is the only unverified item.

**Why Mixed:** PIT keepalive window sizing requires real-traffic observation. If `keepAlive` is a fixed server-side constant, the server team must choose a value that covers real editorial session lengths. If it's a client-passed param, the client controls it — but server-side maximum enforcement requires knowing real traffic patterns. Beyond keepalive: PITs hold an open consistent view per shard. The ES cluster (possibly 5 shards × 3 replicas) incurs per-PIT memory overhead. With many concurrent kupua sessions, this could be significant and requires cluster-side load testing.

**Backcompat note:** Pure additive — new routes only.

**Risks:**
1. Whether `nl.gn0s1s/elastic4s-core:8.18.2` exposes PIT API types (`CreatePitRequest`, `DeletePitRequest`). Media-api's existing source has no PIT calls to cite. Requires checking the elastic4s jar API surface — cannot verify from source alone.
2. PIT storage cost at scale: needs real-cluster load test.
3. Route `DELETE /images/pit/:pitId` conflicts with existing `DELETE /images/:id` pattern — Play routing must match `:pitId` segment specifically.

---

### Gap 8 — `fetchPositionIndex` (full position map)

**Difficulty:** Hard
**Who:** Mixed
**Endpoint sketch:** `POST /images/positions { q, filters, orderBy, sortValues, length } → { entries: [{id, sortValues}], nextSortValues }` (caller paginates)

**What would need to change:**
- New route + handler — same shape as Gap 1 but with `_source: false` (only ID and sort values returned per hit)
- `media-api/app/lib/elasticsearch/ElasticSearch.scala`: new method using `storedFields("_source").source(false)` (elastic4s fetch source control) — the existing `lookupIds` method at line ~170 uses `storedFields("_source")` but does fetch source. Need `source(false)` instead.
- Null-zone two-phase detection: see Gap 10 below. The full position-map fetch requires the two-phase logic (phase 1: docs WITH primary sort field; phase 2: null-zone docs). This is the main complexity multiplier.
- If a server-side walk (single-call, returns full map): need to handle Pekko streaming to avoid holding entire index in memory. The existing `downloadImageExport` uses `StreamConverters` (`MediaApi.scala:490`) — same approach needed here.

**Hard blockers:** None for a paginated endpoint. Streaming full-map variant requires Pekko stream integration (~200 extra LOC).

**Why Mixed:** (1) Null-zone correctness requires testing with real-world data containing actual null-primary-field documents — synthetic tests have missed corner cases in kupua's own TS implementation (fixed in `c1998394b`). (2) If implemented as server-side walk (streaming), response sizing with Guardian's full 3M+ image corpus needs real-cluster profiling.

**Backcompat note:** Pure additive — new route.

**Risks:**
1. Server-side full walk blocks the response for the duration of the ES walk (~30s for 3M images at 10k/chunk × ~100ms/request via tunnel). Streaming response required to avoid timeout.
2. Two-phase null-zone logic: must detect sentinel sort values (Long.MAX/MIN_VALUE) and switch to null-filter phase — `es-adapter.ts:48-65` documents the sentinel issue; the same issue applies server-side.
3. Memory: 3M entries × ~30 bytes each ≈ 90MB in-flight if the full map is assembled in memory before returning.

---

### Gap 11 — `_source` response field filtering

**Difficulty:** Easy
**Who:** Model-solo
**Endpoint sketch:** New optional `includeFields` param on `GET /images` or the Gap 1 endpoint: `?includeFields=id,metadata.credit,uploadTime,...` → filtered JSON per hit

**What would need to change:**
- `media-api/app/lib/elasticsearch/ElasticSearchModel.scala:SearchParams`: add optional `includeFields: List[String]`
- `media-api/app/controllers/MediaApi.scala`: parse `includeFields` from request, apply as a JSON field filter to each hit's `imageData` before including in `respondCollection`
- No ES-level `_source` shaping needed — `imageResponse.create()` requires the full `Image` case class to deserialize correctly; filtering happens at the response serialization stage

**Hard blockers:** None. ES-level `_source` shaping is not safe here: `Image` case class deserialization (Play JSON `reads` macros) would fail if required fields are absent (`MediaApi.scala` / `ImageResponse.scala` use `Image` fields throughout). Client-side response filtering is the safe implementation.

**Note:** This closes the client→media-api bandwidth concern (§B row 11). It does NOT reduce ES→media-api bandwidth (that would require ES-level shaping, which breaks deserialization). §B correctly labels this "bandwidth only".

**Backcompat note:** Optional param, default = full response (current behavior). Additive.

**Risks:**
1. Field path syntax: dotted paths (`metadata.credit`) need recursive JSON filtering — ~30 LOC for a simple implementation.
2. Auth: filtered responses might leak more structure to Syndication tier if not checked — ensure tier filtering (`isVisibleToAccessor`) runs before field filtering.

---

### Gap 13 — `getIdRange` (cursor walk, `_source: false`)

**Difficulty:** Hard
**Who:** Mixed
**Endpoint sketch:** `POST /images/id-range { q, filters, orderBy, fromCursor, toCursor } → { ids: string[], truncated: bool, walked: int }`

**What would need to change:**
- New route + controller handler
- `media-api/app/lib/elasticsearch/ElasticSearch.scala`: new walk method: `search_after` loop with `_source: false`, collecting IDs from sort-value arrays (ID is the last sort field — `sorts.scala:1-31` always ends sort clause with `id` tiebreaker), terminating when a hit's sort values exceed `toCursor`
- Null-zone two-phase detection (see Gap 10): if `fromCursor` or any cursor encountered during the walk lands in the null zone, switch to a `must_not:exists` phase — required for correctness when the primary sort field has null values
- Hard cap parameter (5,000 by default in kupua — `es-adapter.ts:1598`)

**Hard blockers:** None. All ES primitives used (search_after, _source: false) are supported in elastic4s 8.18.2.

**Why Mixed:** Null-zone walk termination correctness (`getIdRange` in kupua had a bug where it terminated at the null-zone boundary rather than continuing — fixed in `c1998394b`). Replicating this logic in Scala and verifying it against real-world data with null-primary-field images requires real-cluster testing. The bug is subtle: `result.hits.length < RANGE_CHUNK_SIZE` signals "last page" BUT also fires at the null-zone boundary where there may be more matching docs in the second phase — `es-adapter.ts:1662-1665` handles this special case.

**Backcompat note:** Pure additive — new endpoint.

**Risks:**
1. ID extraction from sort values: kupua extracts the document ID from `sortValues[idIdx]` where `idIdx` is determined by finding the `id` field in the sort clause (`es-adapter.ts:1601`). Scala equivalent needs same logic.
2. Null-zone cursor detection and phase switching — `null-zone.ts:42-80` is ~80 LOC of logic that must be replicated in Scala.
3. Walk cursor update on null-zone boundary: after completing phase 2, the cursor must be remapped back to the full sort clause shape (injecting `null` at the primary field position) — `es-adapter.ts:1631-1634`.

---

## Tier 2 — Sort / seek / null-zone

### Gap 3 — `countBefore` (position lookup)

**Difficulty:** Moderate
**Who:** Model-solo
**Endpoint sketch:** `POST /images/count-before { q, filters, orderBy, sortValues } → { count: int }`

**What would need to change:**
- New route + controller
- `media-api/app/lib/elasticsearch/ElasticSearch.scala`: new `_count` method. For each sort field at position `i`, construct a `should` clause: "either field `i` is strictly before `sortValues[i]` in sort direction, OR fields 0..i-1 are equal AND field `i` is strictly before". Combine `should` clauses with `minimum_should_match: 1` and wrap in `bool.must(baseQuery)`.
- Null handling: docs with null primary sort field (missing `_last`) sort after all valued docs. "Strictly before a null" → `existsQuery(field)`. "Equal to null" → `must_not.exists(field)`. Kupua's implementation at `es-adapter.ts:827-895` is ~70 LOC and is the Scala model.

**Hard blockers:** None. `_count` query is straightforward elastic4s. The `common-lib/.../filters.scala` helpers (`filters.and`, `filters.or`, `rangeQuery`, `existsQuery`) already cover all needed primitives (cite: `filters.scala:1-80`).

**Backcompat note:** Pure additive — new endpoint.

**Risks:**
1. Multi-field sort accuracy: the should-chain logic is non-trivial for N>2 sort fields. Kupua's implementation has ~70 LOC; Scala equivalent needs careful porting.
2. Performance: a complex should-chain on a 3M-doc index may be slow. No mitigation at the API level — this is a valid concern for any `_count` with complex queries.

---

### Gap 4 — `estimateSortValue` (percentile seek)

**Difficulty:** Easy
**Who:** Mixed
**Endpoint sketch:** `POST /images/sort-percentile { q, filters, field, percentile } → { value: number | null }`

**What would need to change:**
- New route + controller
- `media-api/app/lib/elasticsearch/ElasticSearch.scala`: new method using `percentilesAggregation("pct", field).percents(percentile).compression(200)` — elastic4s 8.18.2 supports `percentilesAggregation` (cite: `ElasticSearch.scala` imports already include agg response types `com.sksamuel.elastic4s.requests.searches.aggs.responses.bucket.DateHistogram` at line ~19)
- Size=0 search (no hits needed); extract from `aggregations.result[Percentiles]`

**Hard blockers:** None. Percentile aggregation is one of ES's core aggs, well-supported in elastic4s.

**Why Mixed:** Percentile estimation accuracy on the Guardian's specific upload-time distribution requires real-cluster validation. If the corpus is heavily skewed (e.g., 80% of images in the last 2 years), TDigest percentile at 50th percentile may produce coarse seek accuracy that degrades UX. This cannot be assessed from source — requires running the aggregation against TEST/CODE and evaluating seek quality at different compression values.

**Backcompat note:** Pure additive — new endpoint.

**Risks:**
1. TDigest compression tradeoff: higher compression (200) improves accuracy but increases memory. Default (100) may be sufficient — requires real-data validation.
2. `percentile` value should be validated server-side (0–100).

---

### Gap 9 — Reverse sort / `missingFirst`

**Difficulty:** Easy
**Who:** Model-solo
**Endpoint sketch:** New optional params `reverse: bool` and `missingFirst: bool` on the Gap 1 `POST /images/search-after` endpoint

**What would need to change:**
- `media-api/app/lib/elasticsearch/ElasticSearch.scala`: if `reverse=true`, reverse each sort in the `Seq[Sort]` and reverse returned hits (same semantics as kupua's `reverseSortClause` at `es-adapter.ts:611`). If `missingFirst=true`, set `missing("_first")` on the primary sort field
- `media-api/app/lib/elasticsearch/sorts.scala`: add a `reverseSorts(sorts: Seq[Sort]): Seq[Sort]` helper — ~10 LOC. elastic4s `FieldSort` has `.missing("_first")` (cite: existing `dateAddedToCollectionDescending` at `sorts.scala:20` shows `fieldSort.order(SortOrder.DESC)` pattern)

**Hard blockers:** None. elastic4s `FieldSort` supports `missing("_first")` and `order(SortOrder.ASC|DESC)` fluently.

**Backcompat note:** Depends on Gap 1 existing. If implemented as params on a new endpoint, pure additive.

**Risks:**
1. Reversing hits after fetching: the response assembler must reverse both hits and sort-values arrays atomically — straightforward but easy to miss.

---

### Gap 10 — Two-phase null-zone seek

**Difficulty:** Moderate
**Who:** Mixed
**Endpoint sketch:** Transparent server-side behavior in the Gap 1 `POST /images/search-after` endpoint — client sends a cursor with `null` at primary sort position; server detects and issues a phase-2 query

**What would need to change:**
- `media-api/app/lib/elasticsearch/ElasticSearch.scala`: detect when `sortValues[0]` is null (primary field missing). If so, override: (a) add `must_not:exists(primaryField)` filter; (b) drop primary field from sort clause; (c) strip null from `search_after` cursor. Remap returned sort values back to full sort shape (inject `null` at primary position).
- `media-api/app/lib/elasticsearch/ElasticSearchModel.scala`: cursor type must handle `null` — Scala's `List[Any]` or `List[Option[Any]]` depending on JSON deserialization approach

**Hard blockers:** None. The ES-level primitives (exists filter, modified sort clause) are already used elsewhere. `common-lib/.../filters.scala:40` provides `filters.missing` for the `must_not:exists` pattern.

**Why Mixed:** Null-zone cursor detection requires knowing when a cursor "enters" the null zone. Testing requires real data that has images with no primary sort field (e.g., no `dateTaken` for date-sorted results). Synthetic tests have missed this case in kupua's own implementation (`c1998394b` was a production fix for a bug the original implementation had). Verifying the Scala equivalent works correctly requires live-data testing on TEST.

**Backcompat note:** This is internal server behavior on the new Gap 1 endpoint — pure additive.

**Risks:**
1. Sort value type handling: ES `_shard_doc` tiebreaker is appended for PIT-based queries — strips on response (kupua does this at `es-adapter.ts:692`).
2. Cursor length mismatch after stripping: stripped cursor is shorter than sort clause — ES is strict about this mismatch.

---

## Tier 3 — Aggregations and soft gaps

### Gap 5 — `findKeywordSortValue` (composite walk)

**Difficulty:** Moderate
**Who:** Model-solo
**Endpoint sketch:** `POST /images/keyword-seek { q, filters, field, targetPosition, direction } → { value: string | null }`

**What would need to change:**
- New route + controller
- `media-api/app/lib/elasticsearch/ElasticSearch.scala`: composite aggregation walk — `compositeAggregation("pos", sources = List(termsAggSource("_sort_field", field).order(direction)))`, size 10_000, paginate via `after_key`, accumulate `doc_count`, stop when cumulative > targetPosition

**Hard blockers:** None. elastic4s 8.18.2 supports composite aggregations. The existing `dateHistogramAggregate` at `ElasticSearch.scala:379` shows the aggregation pattern.

**Backcompat note:** Pure additive — new endpoint.

**Risks:**
1. Composite null handling: composite aggregation skips docs with null for the grouped field — `es-adapter.ts:1039-1047` handles this by returning `lastKeywordValue` when buckets are exhausted. Scala implementation must do the same.
2. Time cap: kupua's TS implementation has an 8s time cap across pages (`es-adapter.ts:962`). Media-api's `SearchQueryTimeout` is 10s per query (`ElasticSearch.scala:80`) — each page is a separate query, so the per-page timeout applies but total walk time has no cap. For very high-cardinality fields this could be slow.

---

### Gap 6 — `getKeywordDistribution` (full composite)

**Difficulty:** Moderate
**Who:** Model-solo
**Endpoint sketch:** `POST /images/keyword-distribution { q, filters, field, direction } → { buckets: [{key, count, startPosition}], coveredCount: int }`

**What would need to change:**
- Same composite agg walk as Gap 5, but accumulate ALL buckets (up to a page cap) and return them with cumulative `startPosition` fields
- New route + controller + elastic4s composite walk (~150 LOC)

**Hard blockers:** None. Same infrastructure as Gap 5.

**Backcompat note:** Pure additive — new endpoint.

**Risks:**
1. Response size: for a field with 50k unique values (e.g., `metadata.credit`), response payload is ~50k entries × ~20 bytes = ~1MB. No streaming needed but response size should be documented.
2. Page cap: kupua uses 5 pages × 10k buckets = 50k max. Media-api should enforce a similar cap to prevent runaway aggregation.

---

### Gap 7 — `getDateDistribution` (date histogram improvements)

**Difficulty:** Easy
**Who:** Model-solo
**Endpoint sketch:** Extend existing `GET /images/aggregations/date/:field` with optional params `direction` (asc|desc, default desc), `adaptive` (bool, default false)

**What would need to change:**
- `media-api/app/controllers/AggregationController.scala:dateHistogram`: accept `direction` and `adaptive` query params, pass to `dateHistogramAggregate`
- `media-api/app/lib/elasticsearch/ElasticSearch.scala:dateHistogramAggregate`: if `adaptive=true`, issue a stats aggregation first to determine span, then choose interval; if `direction` provided, set `order(_key, asc|desc)` on the histogram agg. Currently hardcoded: `calendarInterval(DateHistogramInterval.Month)` with no direction (`ElasticSearch.scala:380-382`).
- Add cumulative `startPosition` accumulation to response buckets — currently `BucketResult` has only `key` and `count` (`ElasticSearchModel.scala:35-39`); add `startPosition: Long`

**Hard blockers:** None. elastic4s `DateHistogramAgg` supports `calendarInterval`, `fixedInterval`, `minDocCount`, and `.order(HistogramAggOrder.key(asc: Boolean))`.

**Backcompat note:** New optional params with defaults that preserve current behavior (fixed monthly bucket, no direction param → default sort by bucket key ascending which is what ES does by default). `BucketResult` gains a new `startPosition` field — additive to response shape. Kahuna doesn't use this endpoint.

**Risks:**
1. Stats + histogram = 2 ES requests per call. For frequent calls this doubles latency. Consider caching or making `adaptive` opt-in (already the design).
2. Sub-hour intervals (`30m`, `10m`) use `fixedInterval` not `calendarInterval` — elastic4s may need `fixedInterval(FixedInterval(30, TimeUnit.MINUTES))` syntax.

---

### Gap 12 — `getByIds` improvements (lift 200 cap, parallel chunks, no `pinned_query`)

**Difficulty:** Easy (new endpoint) / Moderate (modifying existing — backcompat constraint forces new endpoint)
**Who:** Model-solo
**Endpoint sketch:** `POST /images/mget { ids: string[] } → { hits: [Image (enriched)] }` (Easy with backcompat; Trivial greenfield)

**What would need to change:**
- New route `POST /images/mget` + controller
- `media-api/app/lib/elasticsearch/ElasticSearch.scala`: `mget` method using elastic4s `multiGetRequest(ids.map(id => get(imagesCurrentAlias, id)))`, parse responses, call `imageResponse.create()` on each found doc
- The existing `lookupIds` uses `pinnedIds` (cite: `ElasticSearch.scala:171-183`) with `maxSize=200` enforced in `SearchParams.validateLength` (cite: `ElasticSearchModel.scala:220`). A new endpoint bypasses `SearchParams` entirely.

**Hard blockers:** None. elastic4s `multiGetRequest` is a standard operation.

**Note on backcompat:** Modifying `GET /images?ids=...` to lift the 200 cap would require changing `SearchParams.maxSize = 200` (cite: `ElasticSearchModel.scala:220`), which may change Kahuna behavior for large id-sets. A new `POST /images/mget` endpoint is the safe path (Easy with backcompat; Trivial if no backcompat constraint).

**Risks:**
1. `mget` vs enrichment: `multiGetRequest` fetches raw docs; `imageResponse.create()` must still be called per doc for enriched output. This is ~10 LOC given `getImageWithSourceById` already wraps the single-get path (cite: `ElasticSearch.scala:130-141`).
2. Parallel chunk support in Scala: if batching at >1k IDs, `mget` handles it in a single ES round-trip (unlike kupua's parallel chunks) — ES `_mget` has no documented cap, but very large payloads should be chunked at the controller level.

---

### Gap 15 — DEFECT: `?ids=` request order not preserved

**Difficulty:** Easy
**Who:** Human-required
**Endpoint sketch:** Fix to existing `GET /images?ids=...` — override sort to `_score` when `ids` param is present

**What would need to change:**
- `media-api/app/lib/elasticsearch/ElasticSearch.scala:search()`: detect `params.ids.isDefined` and substitute sort with `scoreSort().order(SortOrder.DESC)` (which respects `pinned_query`'s pin ordering) instead of the current `sorts.createSort(params.orderBy)` (cite: `ElasticSearch.scala:329-332`)
- The `pinnedIds` implementation at `common-lib/.../filters.scala:59` uses `pinnedQuery(ids, organic = matchNoneQuery())`. Per ES docs, `pinned_query` returns pinned IDs in request order first (higher relevance score), then organic results. The current sort override (uploadTime DESC) suppresses this ordering.

**Hard blockers:** None technically. The fix is ~5 LOC.

**Why Human-required:** This is a behavior change to the existing `GET /images?ids=...` response ordering. §A Check 2 (TEST verified) confirms current behavior returns results in default sort order, not request order. Kahuna call sites may implicitly rely on this (sort-order) behavior — no Kahuna audit was done for this exercise. Changing the sort would return IDs in request-order, which could break Kahuna callers that expect sort-order. The decision to make this change (and the Kahuna audit it requires) is a human product decision, not a model execution task.

**Backcompat note:** This IS a behavior change to an existing route. Even as a "fix", it changes the `?ids=` response ordering for all callers. To be Impossible-under-backcompat would require Kahuna to depend on sort-order; to be acceptable requires confirming Kahuna re-sorts client-side (which §A says it does — "Client must re-sort"). If confirmed, the constraint is relaxed from Human-required to Model-with-design.

**Risks:**
1. Kahuna may not always re-sort — §A says "client must re-sort" but doesn't verify that Kahuna always does. The Kahuna audit is the prerequisite for this fix.
2. Changing sort to `_score` for `?ids=` removes the ability to sort by `orderBy` within an id-set lookup — edge case but worth noting.

---

### Gap 17 — Dedicated `count` endpoint

**Difficulty:** Trivial
**Who:** Model-solo
**Endpoint sketch:** `GET /images/count?q=...&filters...` → `{ count: long }`

**What would need to change:**
- `media-api/conf/routes`: new `GET /images/count` route (before `GET /images/:id` to avoid routing conflict)
- `media-api/app/controllers/MediaApi.scala`: new handler — parse `SearchParams`, call `elasticSearch.count(params)` (a new `_count` method) or reuse `search()` with `size=0, trackTotalHits=true`
- `media-api/app/lib/elasticsearch/ElasticSearch.scala`: ~15 LOC new method using `ElasticDsl.count(imagesCurrentAlias) query queryBuilder.makeQuery(...)` — elastic4s `CountRequest` returns `CountResponse.count: Long`

**Note on workaround:** `GET /images?length=0` already returns `total` in the Argo response envelope (default `countAll=true` means `trackTotalHits=true` in the ES request — cite: `ElasticSearch.scala:307`). However, this incurs the overhead of parsing `SearchParams`, building the full search request, and returning an Argo envelope. A dedicated `_count` endpoint is cleaner and ~20% cheaper (no hit processing). The workaround is acceptable; the endpoint is a polish item.

**Backcompat note:** Pure additive — new route. Route ordering: `GET /images/count` must appear before `GET /images/:id` in `conf/routes` (cite: `media-api/conf/routes:15`) to prevent `:id` matching "count".

**Risks:** None significant.

---

### Gap 18 — `getAggregations` (batched multi-field facets)

**Difficulty:** Easy
**Who:** Model-solo
**Endpoint sketch:** `POST /images/aggregations { q, filters, fields: [{field, size}] } → { fields: {[fieldPath]: {buckets, total}}, took: int }`

**What would need to change:**
- `media-api/conf/routes`: new `POST /images/aggregations` route
- `media-api/app/controllers/MediaApi.scala` (or new `AggregationController`): new handler — parse full `SearchParams` + `fields` array, call new `getAggregations` method
- `media-api/app/lib/elasticsearch/ElasticSearch.scala`: new method — `size=0` search with `aggregations(fields.map(f => termsAgg(f.field, f.field).size(f.size)))`, return per-field bucket lists. The existing `aggregateSearch` private method at `ElasticSearch.scala:409-423` is the model — new method generalises it to N aggregations in one request.

**Note on existing gap:** `GET /images/metadata/:field` (cite: `media-api/conf/routes:8`) passes through `q=` only, not the full filter set (no `since`/`until`, `payType`, `persisted`, etc.). This is the "current-filter pass-through" deficit in §B row 18. The new `POST /images/aggregations` endpoint accepts full `SearchParams` and closes this.

**Hard blockers:** None. Multi-aggregation in one elastic4s `SearchRequest` is supported (existing `search()` already uses multiple filter-aggs for `tickerCounts` at `ElasticSearch.scala:320-325`).

**Backcompat note:** Pure additive — new endpoint. Existing `GET /images/metadata/:field` is unchanged.

**Risks:**
1. Response marshalling: keyed-by-field-path JSON object needs careful Play JSON serialisation (dotted field paths as JSON object keys).
2. Aggregation naming collision: using field path as agg name directly (e.g., `metadata.credit`) is valid in ES but needs to round-trip through elastic4s response extraction — verify `result.aggregations.result[Terms]("metadata.credit")` works.

---

## Appendix A — Out-of-Scope Observations

1. `sorts.scala:9`: `SortReplacements` maps `"taken"` → `"metadata.dateTaken,-uploadTime"` — this mapping is not documented in any routes file; clients must know this internally.
2. `ElasticSearch.scala:80`: `SearchQueryTimeout = 10s` is fixed. A long composite walk (Gap 5, Gap 6) across many pages could hit this per-page — each page is a separate request, but worth documenting.
3. `ElasticSearchModel.scala:220`: `maxSize = 200` hardcoded comment references "Also adjust in gu-lazy-table.js" — a cross-service invariant that makes lifting the cap risky without a Kahuna audit.
4. `filters.scala:59`: `pinnedQuery(ids, organic = matchNoneQuery())` — the `organic = matchNoneQuery()` means a valid ES `pinned_query` is issued, but the sort override (see Gap 15) suppresses its ordering effect. This is an easy-to-miss interaction.
5. `AggregationController.scala` (entire file, 30 LOC): only handles `dateHistogram`. It's a thin wrapper; all aggregation gaps (Gaps 5, 6, 7, 18) could be added here or to a new controller without architectural change.
6. `MediaApi.scala:55-83`: `searchParamList` is hardcoded for the HATEOAS search link. Any new params on `GET /images` must be added here or they won't appear in the API index discovery response.
7. `ElasticSearch.scala` has no PIT code at all — the feature gap is absolute, not a partial implementation.
8. `sorts.scala:18`: `parseSortBy` uses `split(',')` — the multi-field sort tiebreaker (`taken` → `metadata.dateTaken,-uploadTime`) is comma-joined. If Gap 1 exposes `orderBy` as a pass-through param, this expansion logic must also apply in the new endpoint.
9. `common-lib/.../Mappings.scala:96-131`: two dense vector embedding fields (`cohereEmbedEnglishV3` 1024-dim, `cohereEmbedV4` 256-dim) are indexed with HNSW. KNN search via media-api already exists (`ElasticSearch.scala:190-203`). This is not a gap but confirms ES is modern enough for all Gap 1-18 features.
10. `AggregateSearchParams` (`ElasticSearchModel.scala:43-58`): uses only `q` (text) — not full `SearchParams`. This is the source of the "no current-filter pass-through" in Gap 18.
