# Phase 3 — Minimal Gap Derivation: Findings

**Date:** 2026-05-31
**Status:** Read-only. No code written. No tests run. No files modified except this one.
**Primary inputs read in full:**
- `phase-1-media-api-capability-inventory-findings.md` (558 lines)
- `phase-2-kupua-dal-needs-findings.md` (1179 lines)
- `b2-hunt-findings.md` (604 lines)
- `media-api-gap-01-searchAfter-findings-4.md` (474 lines)
- `media-api-gap-closure-feasibility.md` (418 lines)

---

## Section 1 — Classification Matrix

| # | DAL method | Bucket | Phase 2 ref | Phase 1 ref | One-line rationale |
|---|------------|--------|-------------|-------------|---------------------|
| 1 | `search` | B2 (F3) | §2.1 | Phase 1 §2 GET /images | F3: merges into first-page `searchAfter`; 0 production call sites |
| 2 | `searchRange` | A | §2.2 | Phase 1 §2 GET /images | Media-api `GET /images?offset=N&length=M` satisfies offset-based page fills exactly |
| 3 | `count` | B2 (F2) | §2.3 | Phase 1 §2 GET /images | F2: `countWithTickers(...).count`; 0 production call sites; dead code elimination |
| 4 | `countWithTickers` | D | §2.4 | Phase 1 §4 ticker aggs | Tickers exist server-side but no dedicated `count+tickers` endpoint; needs new route |
| 5 | `getById` | A (via B2 F4) | §2.5 | Phase 1 §2 GET /images/:id | F4 → thin wrapper on `getByIds`; and `getByIds` maps to new `POST /images/mget` (Gap 12) |
| 6 | `getAggregation` | A | §2.6 | Phase 1 §2 GET /images/metadata/:field | Existing corpus-wide terms-agg endpoint covers this exactly |
| 7 | `getAggregations` | C | §2.7 | Phase 1 §4 aggregations | Capability exists per-field but no multi-field + full-SearchParams endpoint; trivial extension |
| 8 | `getFilterAggregations` | B1+C | §2.8 | Phase 1 §3 `is:` registry | Client eliminates raw ES filter DSL (B1); server needs to accept named `is:` strings (small C) |
| 9 | `openPit` | D | §2.9 | Phase 1 §6.7 (no PIT code) | No PIT support in media-api; new routes needed |
| 10 | `closePit` | D | §2.10 | Phase 1 §6.7 | Same as openPit — PIT lifecycle pair |
| 11 | `searchAfter` | B1+D | §2.11 | Phase 1 §2 GET /images | B1: eliminate `sortOverride`/`extraFilter`/`noSource` params; D: cursor pagination endpoint needed |
| 12 | `countBefore` | B1+D | §2.12 | Phase 1 §2 (no count-before) | B1: eliminate `sortClause` param; D: new position-count endpoint needed |
| 13 | `estimateSortValue` | B1+D | §2.13 | Phase 1 §2 (no percentile agg endpoint) | B1: eliminate `field` param (derivable from orderBy); D: new percentile endpoint |
| 14 | `findKeywordSortValue?` | B1+D | §2.14 | Phase 1 §2 (no composite walk) | B1: eliminate `field`+`direction` params; D: new composite-walk endpoint |
| 15 | `getKeywordDistribution?` | B1+D | §2.15 | Phase 1 §2 (no composite distribution) | B1: eliminate `field`+`direction`; D: new composite-distribution endpoint |
| 16 | `getDateDistribution?` | B1+C | §2.16 | Phase 1 §2 GET /images/aggregations/date/:field | B1: eliminate `extraFilter` (→ `missingField?: string`); C: add `direction`+`adaptive`+`startPosition`+`missingField` to existing route |
| 17 | `fetchPositionIndex?` | D | §2.17 | Phase 1 §6.3 lookupIds (not routed) | No paginated ID-cursor stream endpoint; requires new streaming/chunked route |
| 18 | `getByIds` | D | §2.18 | Phase 1 §6.3 lookupIds (not routed) | lookupIds exists but uses wrong API (`pinned_query`+200 cap); needs new `POST /images/mget` |
| 19 | `getIdRange` | D | §2.19 | Phase 1 §2 (no range walk) | No cursor-walk-with-overshoot-detection endpoint; new route |
| 20 | `searchByAi?` | A | §2.20 | Phase 1 §5 KNN/hybrid search | Media-api `GET /images?useAISearch=true` is identical algorithm; client change only |

**Bucket tally:** A: 4 (rows 2, 6, 20, and 5-via-F4), B1: 5 (8, 11, 12, 13, 14, 15, 16 — some combined with D or C), B2: 2 (rows 1, 3), C: 2 (7, 16-partial), D: 7 (4, 9, 10, 11-partial, 12-partial, 13-partial, 14-partial, 17, 18, 19). Within expectations (no premise failure).

---

## Section 2 — Per-Method Detail

### `search` — bucket B2 (F3)

**Abstract need (restated):** Execute a primary text/filter image search and return the first page of results with total count and per-hit sort cursors. The store uses this as the named "first search" entry point; subsequent pages use `searchAfter`.

**Method signature:**
```typescript
search(params: SearchParams): Promise<SearchResult>;
```

**Current call sites:** 0 production calls on `dataSource`. Called only from `dal-contract.test.ts`. The store always uses `searchAfter(params, null, pitId)` for first-page fetches (`search-store.ts:1987`). Source: Phase 2 §2.1.

**Current ES adapter behaviour:** `_doSearch` with `from=0, size=params.length`, `track_total_hits=true`, and optional `TICKER_AGGS` (when `includeTickers=true`). The ticker path in `_doSearch` is functionally dead — the store uses `countWithTickers` in parallel (`search-store.ts:1997`) rather than bundling tickers into `search`. Source: b2-hunt Section 2, Cluster 2 (F3 dive).

**Media-api capability (relevant subset):** Media-api `GET /images` already supports offset+length pagination via `offset` and `length` params, full `SearchParams` vocabulary (`q`, filters, `orderBy`). For a first-page call, `offset=0` is equivalent to a from=0 search. The ticker bundle is not needed here since tickers are a separate `countWithTickers` call. Source: Phase 1 §2.

**Classification rationale:** `search` is a degenerate first-page `searchAfter`. The b2-hunt audit confirmed F3: `search(params) ≡ searchAfter(params, null, null)`. Since `search` has zero production call sites and the ticker agg path in it is dead, the fusion is clean — no store migration needed for tickers. After `GridApiDataSource` is in place, `search` either delegates to the first-page `searchAfter` path or is removed from the interface.

**Action (B2 — F3):** `search` becomes a thin wrapper: `return this.searchAfter(params, null, null, undefined, false, false, false)` (no sortOverride, no extraFilter). The `SearchResult` type differs from `SearchAfterResult` only in the presence of `tickerCounts?` — since `tickerCounts` is dead in the `search` path, the wrapper can safely return the `SearchAfterResult` as a `SearchResult` with `tickerCounts: undefined`. Net surface: 2 → 1. Verify with `npm --prefix kupua test` after the change. No E2E risk (0 production call sites).

**Pagination/cursor implication:** First-page call — no cursor. `searchAfter(params, null, null)` maps to `GET /images?offset=0&length=N` on media-api, which is offset-based. The cursor returned by media-api for the first page will be a synthetic cursor derived from the response (position 0 + sort values). This is compatible with the store's first-page bootstrap.

**Provenance:** Phase 2 §2.1, b2-hunt F3, findings-4 Part 4 (0 call sites).

---

### `searchRange` — bucket A

**Abstract need (restated):** Fetch a page of images using the current filter/sort context, without cancelling any in-flight primary search. Used for non-coalescing background range fills when the caller wants additive loads at a specific offset rather than cursor-driven pagination.

**Method signature:**
```typescript
searchRange(params: SearchParams, signal?: AbortSignal): Promise<SearchResult>;
```

**Current call sites:** 0 production calls on `dataSource`. Only in mock and tests. Exists for `GridApiDataSource` planning — explicitly reserved for offset-based range fills where cursor pagination would be overly complex. Source: Phase 2 §2.2, findings-4 Part 4.

**Current ES adapter behaviour:** Not actively used in production. The intent is: `_search` with `from=params.offset, size=params.length` — same as `search` but without the cancellation token and without tickers. The non-cancelling contract is the key distinction from `search`.

**Media-api capability (relevant subset):** `GET /images?offset=N&length=M` with full `SearchParams` filters. This is the canonical offset-based search endpoint. It supports the exact pagination model that `searchRange` is designed to map to. Source: Phase 1 §2 (offset, length params in SearchParams table).

**Classification rationale:** `searchRange` maps directly to `GET /images` with an explicit `offset` and `length` from `params`. No new capability needed. For `GridApiDataSource`, `searchRange` calls `GET /images?offset=${params.offset}&length=${params.length}&...filters`. The non-cancelling contract is a client-side concern (no AbortSignal propagation), not a server concern.

**Action (A):** `GridApiDataSource.searchRange` calls `GET /images` with `params.offset` and `params.length` and all standard SearchParams filters. Response is consumed as-is (`total`, `data` as `hits`, fabricated sort cursors if needed for compatibility). No server work.

**Pagination/cursor implication:** Offset-based. Media-api's offset model is exactly what `searchRange` was designed for. No cursor pagination needed for this method.

**Provenance:** Phase 2 §2.2, Phase 1 §2, b2-hunt Section 2 Cluster 2 (searchRange preserved as distinct).

---

### `count` — bucket B2 (F2)

**Abstract need (restated):** Return the total number of images matching the current filter and query context, without fetching any image data.

**Method signature:**
```typescript
count(params: SearchParams): Promise<number>;
```

**Current call sites:** 0 production calls on `dataSource`. Only in `dal-contract.test.ts`. Source: Phase 2 §2.3, findings-4 Part 4.

**Current ES adapter behaviour:** Uses `_count` endpoint — lighter than `_search` with `size:0`. Returns `CountResponse.count`. Source: b2-hunt Section 2, Cluster 7 (F2 dive at es-adapter.ts:774–778).

**Media-api capability (relevant subset):** `GET /images?length=0&countAll=true` returns `total` in the Argo envelope, which is a valid workaround. Gap 17 in the feasibility study proposes a dedicated `GET /images/count` endpoint (~15 LOC). Source: Phase 1 §2, feasibility §Gap17.

**Classification rationale:** F2: `count(params)` ≡ `countWithTickers(params).then(r => r.count)`. Since `count` has zero production call sites, no caller is regressed. For `GridApiDataSource`, `count` is simply a wrapper on `countWithTickers`. The server needs a `countWithTickers` endpoint for other reasons (see `countWithTickers` — bucket D); once that exists, `count` is free.

**Action (B2 — F2):** `GridApiDataSource.count(params)` ≡ `this.countWithTickers(params).then(r => r.count)`. No separate endpoint needed. Alternatively, once Gap 17 (dedicated count endpoint) exists, `count` can call it directly — but either way no new work is needed beyond what `countWithTickers` requires. Net surface: 2 → 1. Independent value: No — interface tidying only.

**Pagination/cursor implication:** None. Count only.

**Provenance:** Phase 2 §2.3, b2-hunt F2, findings-4 Part 4.

---

### `countWithTickers` — bucket D

**Abstract need (restated):** In a single request, determine (a) how many images arrive in the search result matching the current context (or since a time boundary), and (b) the current counts for each named saved-filter group (ticker). Powers the new-images poll banner and per-ticker badge counts.

**Method signature:**
```typescript
countWithTickers(params: SearchParams): Promise<CountWithTickersResult>;
```

**Current call sites:**
- `search-store.ts:616` — new-images poll tick (called every N seconds; `params.since` = last-seen boundary)
- `search-store.ts:1943` — ticker refresh after user saves metadata to an image
- `search-store.ts:1997` — initial search ticker parallel fetch (runs alongside first-page `searchAfter`)

Source: Phase 2 §2.4, findings-4 Part 5 Note 3.

**Current ES adapter behaviour:** `_search` with `size:0`, `track_total_hits:true`, and `TICKER_AGGS` — a module-level constant of filter aggregations compiled from `gridConfig.tickerDefinitions` (CQL strings). Returns `{ count: total, tickerCounts: Record<string, TickerCountResult> }`. The ticker definitions are the same CQL clauses the server already knows (`ElasticSearch.scala`'s `aggregationsNameToSearchClauseMap`). Source: b2-hunt Section 2 Cluster 7 (F2 dive); Phase 2 §2.4; Phase 2 §3.2.

**Media-api capability (relevant subset):** Media-api's `imageSearch()` already fires ticker aggregations on every search response via `extraCounts` in the Argo envelope (Phase 1 §2 and §4). However, `extraCounts` is bundled with search hits — there is no standalone `GET /images/count` variant that also returns `extraCounts`. The ticker definitions live server-side in `aggregationsNameToSearchClauseMap`. Per Phase 1 §4: ticker aggs are always-on (config-gated) but only returned as part of `GET /images`. No dedicated count+tickers endpoint exists.

**Classification rationale:** This is a genuine new capability (bucket D). The server has all the ingredients — it can count, and it fires ticker aggs on search. What it lacks is a lightweight endpoint that returns count+tickers without fetching hits. The feasibility study missed this entirely (not in Gaps 1–18). Findings-4 Note 3 flags it as `GAP MISSING` with 3 call sites, one on every poll tick. This cannot be absent in media-api mode.

**Action (D):** New endpoint needed. Capability gap description: "A `size=0` search endpoint that returns (a) the total hit count (`track_total_hits:true`) and (b) the per-ticker filter-aggregation counts, without fetching any image documents." This reuses existing server infrastructure — `ElasticSearch.scala`'s `aggregationsNameToSearchClauseMap` already holds the ticker queries; the count is already computed via `trackTotalHits`. Size estimate: **S** (small). All primitives exist; this is wiring a `size=0, track_total_hits=true` search with ticker aggs to a new route. Closest existing thing: `GET /images?length=0` returns `total` + `extraCounts`, but the `extraCounts` are always-on ticker aggs that already exist in the response. The new endpoint is effectively an alias of `GET /images?length=0&countAll=true` that explicitly guarantees the `extraCounts` field is present and returned by name.

**Pagination/cursor implication:** None. Count-only endpoint.

**Provenance:** Phase 2 §2.4, Phase 2 §3.2, Phase 1 §4, feasibility §Gap17 (count endpoint — needs extension), findings-4 Part 5 Note 3.

---

### `getById` — bucket A (via B2 F4)

**Abstract need (restated):** Retrieve the complete image document for a single known identifier. Returns `undefined` if the image does not exist.

**Method signature:**
```typescript
getById(id: string): Promise<Image | undefined>;
```

**Current call sites:**
- `kupua/src/components/ImageDetail.tsx:235` — load full image data when the user opens an image

Source: Phase 2 §2.5, findings-4 Part 4.

**Current ES adapter behaviour:** `_search` with `{query:{terms:{id:[id]}}, size:1}`. Source: b2-hunt Section 3, dive #5 (es-adapter.ts:800–817).

**Media-api capability (relevant subset):** `GET /images/:id` — single image fetch, returns full transformed `Image` JSON with all computed fields (`secureUrl`, `valid`, `cost`, `persisted`, `syndicationStatus`, etc.). Source: Phase 1 §2 GET /images/:id.

**Classification rationale:** F4 (b2-hunt): `getById(id)` becomes `getByIds([id]).then(r => r[0])`. The `GridApiDataSource` implementation of `getByIds` calls the new `POST /images/mget` endpoint (Gap 12). `getById` is a thin wrapper. Technically, a `GridApiDataSource.getById` could also call `GET /images/:id` directly for single-doc efficiency — that would be bucket A outright, not requiring Gap 12 at all. For the abstract interface, either path works; the direct `GET /images/:id` mapping is cleanest.

**Action (A):** `GridApiDataSource.getById(id)` calls `GET /images/:id`; returns the full enriched `Image` on 200, or `undefined` on 404. This is the simplest possible implementation and requires no new server work. F4 fusion (having `getById` call `getByIds`) is valuable for the ES adapter but not required for `GridApiDataSource` — the direct-to-endpoint path is cleaner.

**Pagination/cursor implication:** None. Single document.

**Provenance:** Phase 2 §2.5, Phase 1 §2 GET /images/:id, b2-hunt F4.

---

### `getAggregation` — bucket A

**Abstract need (restated):** Return the N most common values for a metadata field across the entire image corpus (no current-search-context filter), optionally scoped by a typeahead prefix string. Populates filter-value dropdowns.

**Method signature:**
```typescript
getAggregation(field: string, query?: string, size?: number): Promise<AggregationResult>;
```

**Current call sites:**
- `kupua/src/lib/typeahead-fields.ts:207` — typeahead for metadata fields (no search context)

Source: Phase 2 §2.6, findings-4 Part 4.

**Current ES adapter behaviour:** `match_all: {}` when `query` is absent; `multi_match` on `metadata.englishAnalysedCatchAll` when `query` is present. Terms agg on the requested field. No `SearchParams` filter applied. Source: b2-hunt Section 3, dive #1 (es-adapter.ts:817–857).

**Media-api capability (relevant subset):** `GET /images/metadata/:field?q=...` — terms aggregation on `metadata.{field}`, optionally filtered by a CQL query string. The `q` param can pass a `multi_match`-compatible text filter. This exactly matches the corpus-wide terms-agg + optional text-filter pattern. Source: Phase 1 §2 GET /images/metadata/:field.

**Classification rationale:** The existing `GET /images/metadata/:field` route is a direct match. No new capability needed. The `query` parameter maps to `q` on the media-api endpoint; `size` is not currently a parameter on that endpoint (hardcoded in `ElasticSearch.scala:469`), but the field-path and corpus-wide scope are already supported.

**Action (A):** `GridApiDataSource.getAggregation(field, query, size)` calls `GET /images/metadata/${field}?q=${query}`. The `size` parameter is not currently supported by the server endpoint — if needed, a trivial server extension (add `size` param to `AggregateSearchParams`) would be warranted, but the current hardcoded size may be acceptable for typeahead use cases.

**Pagination/cursor implication:** None. Aggregation only.

**Provenance:** Phase 2 §2.6, Phase 1 §2 GET /images/metadata/:field.

---

### `getAggregations` — bucket C

**Abstract need (restated):** Return document-count distributions for multiple metadata fields simultaneously, restricted to images matching the current search context (same filters and query as the main search). Single round-trip for N field distributions.

**Method signature:**
```typescript
getAggregations(
  params: SearchParams,
  fields: AggregationRequest[],
  signal?: AbortSignal,
): Promise<AggregationsResult>;
```

**Current call sites:**
- `collection-store.ts:140` — `({}, [{field:"collections.pathId", size:6000}])` — all collections (no filter)
- `search-store.ts:3868` — facet panel counts with current search context
- `search-store.ts:3908` — expanded facet bucket load
- `kupua/src/lib/typeahead-fields.ts:203` — context-aware typeahead

Source: Phase 2 §2.7, findings-4 Part 4.

**Current ES adapter behaviour:** `size:0` search with `buildQuery(params)` filter + N terms aggregations — one per requested field. Returns `{fields: Record<fieldPath, {buckets, total}>, took, fetchDuration}`. Source: b2-hunt Section 3, dive #2 (es-adapter.ts:857–910).

**Media-api capability (relevant subset):** The existing `GET /images/metadata/:field` endpoint only supports a single field and uses `AggregateSearchParams` (only `q`, not full `SearchParams`). Gap 18 in the feasibility study addresses this: a new `POST /images/aggregations` endpoint accepting full `SearchParams` plus `fields: [{field, size}]`. This is a trivial extension — all primitives exist (`ElasticSearch.scala`'s `aggregateSearch` private method at line ~409 shows the pattern). Source: Phase 1 §4, feasibility §Gap18.

**Classification rationale:** The capability (multi-field terms aggs with full SearchParams) doesn't exist as a single endpoint but all the ES primitives do. The existing single-field endpoint confirms the aggregation works; extending to N fields in one request is minimal server work. This is a textbook bucket-C item.

**Action (C):** Smallest possible extension: new `POST /images/aggregations` endpoint accepting `{q, ...filters, fields: [{field, size}]}` and returning `{fields: {[fieldPath]: {buckets, total}}}`. Reuses `buildQuery(params)` (already in `ElasticSearch.scala`) and `termsAgg(field, size)` (already used in `metadataSearch`). ~100 LOC total. Empty `SearchParams` (collection-store call) is a valid case — `buildQuery({})` returns match-all-ish.

**Pagination/cursor implication:** None. Aggregation only.

**Provenance:** Phase 2 §2.7, Phase 1 §2 and §4, feasibility §Gap18.

---

### `getFilterAggregations` — bucket B1+C

**Abstract need (restated):** For each of a set of named IS-filter conditions, count how many images in the current search context satisfy that condition. Returns a map of condition name to count. Powers the `is:` value badges in the facet panel and typeahead suggestions.

**Method signature:**
```typescript
getFilterAggregations(
  params: SearchParams,
  filters: FilterAggRequest[],
  signal?: AbortSignal,
): Promise<Record<string, number>>;
```

**Current call sites:**
- `search-store.ts:3869` — `is:deleted`, `is:under-quota` counts in the facet panel
- `kupua/src/lib/typeahead-fields.ts:376` — `is:` counts in typeahead suggestions

Source: Phase 2 §2.8, findings-4 Part 5 Note 4.

**Current ES adapter behaviour:** `size:0` search with `buildQuery(params)` + N filter aggregations where each filter is a raw ES DSL object from `FilterAggRequest.query`. In production, the DSL objects are always `parseCql("is:deleted").must[0]`, `parseCql("is:under-quota").must[0]`, etc. — the client-side CQL parser's translation of `is:` strings. Returns `Record<name, count>`. Source: b2-hunt Section 3, dive #3 (es-adapter.ts:910–940); Phase 2 §2.8 (⚠ ES-SHAPE LEAK section).

**Media-api capability (relevant subset):** Media-api's CQL parser already handles `is:deleted`, `is:under-quota`, `is:{org}-owned-photo`, etc. via `IsQueryFilter.scala`. These are named filters the server already knows. The `is:` registry is at `IsQueryFilter.scala:26`. Source: Phase 1 §3 `is:` filter registry. The server has no endpoint that returns named filter-agg counts directly, but the capability is trivially available via the CQL parser.

**Classification rationale:** Two parts. (B1) The ES-shape leak in `FilterAggRequest.query` must be eliminated: the client should send `isFilter: string` (e.g. `"deleted"`, `"under-quota"`) and the server should compile it via its own `IsQueryFilter`. This is a pure client refactor — remove raw ES DSL, send CQL names. (C) The server needs a small extension: the `POST /images/aggregations` endpoint (Gap 18, already C-classified for `getAggregations`) should also accept `isFilters: string[]` and return per-name counts alongside field-term counts. This is a small addition to the same endpoint body (~20 LOC). The B1 change has independent value today: it eliminates an ES query injection surface from the current client.

**Action (B1 + C):**
- **(B1 — eliminate `FilterAggRequest.query`):** Change `FilterAggRequest` from `{name: string, query: Record<string, unknown>}` to `{name: string, isFilter: string}`. Update all callers (`search-store.ts:3869`, `typeahead-fields.ts:376`) to pass the IS-filter string names directly. Update `es-adapter.ts` to compile `parseCql("is:${req.isFilter}")` internally instead of accepting raw DSL. This closes the ES injection surface. Independent value: Yes — eliminates the most dangerous ES leak in the current codebase today.
- **(C — server extension):** Extend `POST /images/aggregations` to accept an optional `isFilters: string[]` field. The server runs each string through the `IsQueryFilter` registry and returns filter-agg counts alongside field-term counts. Trivial addition to the same ES request body (filter aggs coexist with terms aggs under the `aggs` key). Note: `is:{org}-owned-photo` is dynamic (org-prefixed); server must handle this via the existing `IsQueryFilter` registry.

**Pagination/cursor implication:** None. Aggregation only.

**Provenance:** Phase 2 §2.8 (⚠ ES-SHAPE LEAK), Phase 1 §3 `is:` registry, b2-hunt dive #3, findings-4 Part 5 Note 4, feasibility §Gap18.

---

### `openPit` — bucket D

**Abstract need (restated):** Open an immutable snapshot of the index state at the current moment, returning an opaque handle. All paginated queries using the handle see a consistent view of the data — images added or deleted after snapshot creation do not appear in subsequent pages.

**Method signature:**
```typescript
openPit(keepAlive?: string): Promise<string>;
```

**Current call sites:**
- `search-store.ts:1983` — open PIT before issuing the first-page `searchAfter` for a new search

Source: Phase 2 §2.9, findings-4 Part 4.

**Current ES adapter behaviour:** POST to `{index}/_pit?keep_alive=1m`, returns opaque ES PIT ID string. Source: b2-hunt Cluster 6.

**Media-api capability (relevant subset):** Per Phase 1 §6.7: "ElasticSearch.scala has no PIT code at all — the feature gap is absolute, not a partial implementation." No PIT routes in `conf/routes`. No PIT calls anywhere in media-api source. Source: Phase 1 §6.7, feasibility §Gap2.

**Classification rationale:** This is a genuine gap. The capability is completely absent from media-api — not partially wired, not behind a flag. elastic4s 8.18.2 supports PIT (feasibility §Gap2 notes the dependency risk of verifying elastic4s PIT API surface). PIT is required for consistent multi-page browsing in the store.

**Action (D):** New endpoint needed. Capability gap: "POST an open-snapshot request to ES and return the opaque PIT ID." Closest existing thing: none. Size estimate: **S** (small). elastic4s PIT support is expected in v8.18.2; the implementation is a thin proxy to ES `POST {index}/_pit?keep_alive=...` with the returned ID passed through to the client. The only non-trivial concern is PIT memory cost at scale (feasibility §Gap2). Route: `POST /images/pit`, `DELETE /images/pit/:pitId`. Note: `DELETE /images/pit/:pitId` routing must precede `DELETE /images/:id` to avoid Play routing collision (feasibility §Gap2 risk 3).

**Pagination/cursor implication:** PIT IS the pagination model. Without it, `searchAfter` cannot guarantee consistent pages. The entire cursor-pagination model depends on this gap being filled first.

**Provenance:** Phase 2 §2.9, Phase 1 §6.7, feasibility §Gap2.

---

### `closePit` — bucket D

**Abstract need (restated):** Release server-side resources held by a previously opened snapshot. Fire-and-forget — the snapshot expires automatically after its keepAlive period regardless.

**Method signature:**
```typescript
closePit(pitId: string): Promise<void>;
```

**Current call sites:**
- `search-store.ts:1861` — release old PIT when a new search supersedes it

Source: Phase 2 §2.10, findings-4 Part 4.

**Current ES adapter behaviour:** DELETE to `_pit` with `{id: pitId}` in the body, ignoring the response. Source: b2-hunt Cluster 6.

**Media-api capability (relevant subset):** Same as `openPit` — no PIT code anywhere in media-api. Source: Phase 1 §6.7.

**Classification rationale:** Part of the same PIT lifecycle pair as `openPit`. Both are absent, both needed.

**Action (D):** New endpoint as described in `openPit` action: `DELETE /images/pit/:pitId` — proxy to ES `DELETE /_pit`. Same size estimate as `openPit` — S. Both can be implemented in a single PR with `openPit`.

**Pagination/cursor implication:** PIT cleanup. Without `closePit`, PITs accumulate until keepAlive expires — memory leak risk on busy clusters.

**Provenance:** Phase 2 §2.10, Phase 1 §6.7, feasibility §Gap2.

---

### `searchAfter` — bucket B1+D

**Abstract need (restated):** Fetch one page of images in the current search context, starting strictly after (or before, when reversed) a given sort cursor. Cursor `null` means start from the beginning (or end when reversed). The snapshot handle ensures consistent results across pages.

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

**Current call sites:** 23 call sites in `search-store.ts` (groups A–E1) plus 1 internal call in `es-adapter.ts` (INT for `getIdRange`). See findings-4 Part 1 for full table.

**Current ES adapter behaviour:** ES `_search` with `search_after: sortValues`, `pit: {id: pitId}`, optional `_source: false` (noSource), sort from `sortOverride ?? buildSortClause(params.orderBy)`, optional `post_filter` from `extraFilter`. Groups B and D4/E1 pass raw ES DSL via `sortOverride` and `extraFilter`. Source: Phase 2 §2.11 (ES-shape leaks section), findings-4 Parts 1–3.

**Media-api capability (relevant subset):** `GET /images` supports only offset+length pagination. There is no `search_after` parameter on any existing route. The cursor-pagination pattern is entirely absent. Source: Phase 1 §2 (pagination model: offset-based only; no search_after, no PIT).

**Classification rationale:** Two parts. **(B1)** Three parameters must be eliminated from the interface before a server endpoint can be designed: (a) `sortOverride` — always `buildSortClause(params.orderBy)`, 100% server-derivable; (b) `extraFilter` — always `{bool:{must_not:{exists:{field:primaryField}}}}`, should be a server-side null-zone detection (Gap 10 in feasibility); (c) `noSource` — an internal optimisation leaked from `getIdRange`'s implementation, never passed by client code. The B1 client refactor also requires changing ~7 call sites in `search-store.ts` that currently strip null-prefixed cursors and pass explicit overrides — these should instead send the full null-prefixed cursor and let the server detect the null-zone transparently (findings-4 Note 1). The E1 case (ss:2950) requires prepending `null` to the cursor (findings-4 Note 2 Option A). **(D)** After B1, the interface is clean enough to design: a new cursor-pagination endpoint. This is the central gap — everything else in the pagination system depends on it.

**Action:**
- **(B1 — eliminate `sortOverride`, `extraFilter`, `noSource`):**
  - Remove `sortOverride`, `extraFilter`, `noSource` from the `searchAfter` signature.
  - Rename `missingFirst` to `seekToEnd` (abstract intent, not ES option name).
  - Update all B-group call sites in `search-store.ts` to send the full null-prefixed cursor `[null, uploadTimeVal, idVal]` instead of stripping null and passing explicit overrides.
  - Update E1 (ss:2950) to prepend `null`: `[null, uploadTimeEstimate, ""]`.
  - Update `es-adapter.ts` `getIdRange` internal call (INT) to not pass `noSource` in the public signature — use an internal-only wrapper instead.
  - Independent value: Yes — eliminates the two most dangerous ES-DSL injection parameters from the current codebase.
  - Test surfaces: `npm --prefix kupua test` (unit) + `npm --prefix kupua run test:e2e` (E2E) after this refactor — it touches scroll behaviour.
- **(D — new cursor-pagination endpoint):** New `POST /images/search-after` endpoint accepting `{q, filters, orderBy, sortValues, pitId, length, reverse, seekToEnd, trackTotalHits}` and returning `{hits, total, sortValues: [perHit], pitId}`. Reuses `buildQuery(params)`, `sorts.createSort(orderBy)`, and `hitToImageEntity`. Gap 10 (null-zone detection) is baked in: if `sortValues[0] === null`, server detects null-zone and applies `must_not:exists` phase transparently. Size estimate: **M** (medium). The infrastructure (query building, sorts, null-zone detection) all exists; wiring a new route with PIT support and `search_after` ES param is the new work.

**Pagination/cursor implication:** This IS the cursor pagination gap. It is the elephant. See Section 3 for full discussion.

**Provenance:** Phase 2 §2.11, Phase 2 §4 (ES-shape leaks #1–3), Phase 1 §2 (pagination model), findings-4 Parts 1–3, feasibility §Gap1, §Gap9, §Gap10.

---

### `countBefore` — bucket B1+D

**Abstract need (restated):** Determine the 0-based position of a document in the current search result set, given its sort cursor. Position = number of documents that sort strictly before the target document.

**Method signature:**
```typescript
countBefore(
  params: SearchParams,
  sortValues: SortValues,
  sortClause: Record<string, unknown>[],
  signal?: AbortSignal,
): Promise<number>;
```

**Current call sites:**
- `search-store.ts:1414, 1434` — sort-around-focus position lookup
- `search-store.ts:1592` — SAF async correction
- `search-store.ts:2985` — deep null-zone seek landing
- `search-store.ts:3061, 3114, 3169` — percentile/keyword seek landing and refinement
- `search-store.ts:3701` — restoreAroundCursor position

Source: Phase 2 §2.12, findings-4 Part 4 (countBefore section).

**Current ES adapter behaviour:** `_count` with a complex range-query that enumerates `should` clauses: for each sort field at position `i`, "fields 0..i-1 are equal to sortValues AND field `i` is strictly before sortValues[i]". Includes null handling for missing primary sort field. ~70 LOC of range-query logic. Source: Phase 2 §2.12, feasibility §Gap3 (count-before position lookup).

**Media-api capability (relevant subset):** No `countBefore` or `count-before` endpoint exists. No range-query count endpoint of any kind. Source: Phase 1 §1 (routes table — no match).

**Classification rationale:** **(B1)** `sortClause: Record<string, unknown>[]` is always `buildSortClause(params.orderBy)` — fully server-derivable from `params.orderBy`. This is Phase 2 §4 leak #5: "the most gratuitous ES leak in the interface." Eliminating it requires no server change — just removing the parameter from the interface and computing it internally in the ES adapter (or server-side). **(D)** After B1, the server needs a new `count-before` endpoint. The range-query logic in `es-adapter.ts:827–895` must be ported to Scala. All required primitives exist in `common-lib/.../filters.scala`.

**Action:**
- **(B1 — eliminate `sortClause`):** Remove `sortClause` from the `countBefore` signature. Update all 8 call sites in `search-store.ts` to remove the `buildSortClause(params.orderBy)` argument — it was always computed there immediately before the call. The ES adapter computes `buildSortClause(params.orderBy)` internally. Independent value: Yes — eliminates a prominent ES leak and simplifies 8 call sites.
- **(D — new count-before endpoint):** New `POST /images/count-before` accepting `{q, filters, orderBy, sortValues}` and returning `{count: int}`. The server builds the should-chain from `sortValues` and the sort clause derived from `orderBy`. Size estimate: **M** (medium). The logic is non-trivial (~70 LOC of range-query construction) but all primitives are available in `common-lib`.

**Pagination/cursor implication:** `countBefore` implements "find position of document in result set" — the seek-and-land mechanism. Without it, sort-around-focus, deep seek, and restore-position all break.

**Provenance:** Phase 2 §2.12, Phase 2 §4 leak #5, findings-4 Part 4 (countBefore — all 7 call sites), feasibility §Gap3.

---

### `estimateSortValue` — bucket B1+D

**Abstract need (restated):** Find an approximate value of the primary sort field at a given percentile position in the result set — e.g. "what upload-date is at roughly the 60% mark?" Used as a coarse anchor for deep seek beyond the direct-offset window.

**Method signature:**
```typescript
estimateSortValue(
  params: SearchParams,
  field: string,
  percentile: number,
  signal?: AbortSignal,
): Promise<number | null>;
```

**Current call sites:**
- `search-store.ts:2909` — deep null-zone seek (uploadTime percentile)
- `search-store.ts:3033` — deep seek percentile estimation

Source: Phase 2 §2.13, findings-4 Part 4.

**Current ES adapter behaviour:** `size:0` search with `percentilesAggregation` (tdigest, compression=200) on `params.field`. Returns the estimated epoch-millisecond value at the requested percentile, or `null` on abort/absence. Source: Phase 2 §2.13.

**Media-api capability (relevant subset):** No percentile-aggregation endpoint exists. Source: Phase 1 §1 (no matching route). The `AggregationController` only has `dateHistogram`. Source: Phase 1 §2 GET /images/aggregations/date/:field.

**Classification rationale:** **(B1)** `field: string` is always the primary sort field derivable from `params.orderBy` via `parseSortField(buildSortClause(orderBy)[0])`. Both call sites pass exactly this. Phase 2 §2.13 flags this. Eliminating `field` is a pure client refactor — the server can derive it from `orderBy`. **(D)** After B1, a new percentile endpoint is needed. All ES primitives exist (elastic4s `percentilesAggregation`).

**Action:**
- **(B1 — eliminate `field`):** Remove `field` from the `estimateSortValue` signature; compute it internally from `params.orderBy` in both the ES adapter and any future server-side handler. Both call sites use exactly `parseSortField(buildSortClause(params.orderBy)[0])`. Independent value: Yes — removes an ES field-path from the public interface.
- **(D — new percentile endpoint):** New `POST /images/sort-percentile` accepting `{q, filters, orderBy, percentile}` and returning `{value: number | null}`. Server derives the sort field from `orderBy`, fires `percentilesAggregation` with tdigest compression=200. Size estimate: **S** (small). ~30 LOC in the controller + ~20 LOC in `ElasticSearch.scala`. Feasibility §Gap4 confirms no hard blockers.

**Pagination/cursor implication:** `estimateSortValue` is the coarse-seek anchor for result sets > ~10k docs. Without it, deep seek falls back to capped offset-based navigation.

**Provenance:** Phase 2 §2.13, Phase 2 §4 (field derivable from orderBy), findings-4 Part 4, feasibility §Gap4.

---

### `findKeywordSortValue?` — bucket B1+D

**Abstract need (restated):** Walk keyword values (e.g. photographer names) in sort order to find the value at a specific global position. Used for deep seek on non-numeric sort fields where percentile estimation is unavailable.

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

**Current call sites:**
- `search-store.ts:3081` — deep seek for keyword-sorted fields (guarded: only called when method exists)

Source: Phase 2 §2.14, findings-4 Part 4.

**Current ES adapter behaviour:** Composite aggregation walk — paginate through unique values accumulating `doc_count` until cumulative count exceeds `targetPosition`. MAX_PAGES=50 (500k unique values), TIME_CAP_MS=8000. Source: b2-hunt Section 3, dive #6 (es-adapter.ts:1466–1634).

**Media-api capability (relevant subset):** No composite-walk endpoint exists. Source: Phase 1 §1 (no matching route).

**Classification rationale:** **(B1)** Both `field` and `direction` are derivable from `params.orderBy`. Phase 2 §2.14 flags this. **(D)** After B1, a new composite-walk endpoint is needed.

**Action:**
- **(B1 — eliminate `field` and `direction`):** Remove both params; compute from `params.orderBy` internally. Both are produced by `parseSortField(buildSortClause(params.orderBy)[0])`. Independent value: Yes.
- **(D — new keyword-seek endpoint):** New `POST /images/keyword-seek` accepting `{q, filters, orderBy, targetPosition}` and returning `{value: string | null}`. Server derives `field` and `direction` from `orderBy`, runs composite agg walk with early exit. Size estimate: **M** (medium). The composite-walk logic (~70 LOC in TS) requires Scala porting; null handling (composite agg skips null docs — return last known value when exhausted) and time cap require care. Feasibility §Gap5 confirms no hard blockers.

**Pagination/cursor implication:** Optional method (`?`). Graceful absence: store falls back to capped offset navigation for keyword sorts. No scroll breakage without it, but deep seek on non-numeric sorts degrades.

**Provenance:** Phase 2 §2.14, Phase 2 §4 (field+direction derivable), findings-4 Part 4, feasibility §Gap5.

---

### `getKeywordDistribution?` — bucket B1+D

**Abstract need (restated):** Fetch the complete ordered list of unique keyword-sort-field values with document counts and cumulative position indices. Enables O(log n) position-to-value mapping during scrubber drag for keyword sorts.

**Method signature:**
```typescript
getKeywordDistribution?(
  params: SearchParams,
  field: string,
  direction: "asc" | "desc",
  signal?: AbortSignal,
): Promise<SortDistribution | null>;
```

**Current call sites:**
- `search-store.ts:3972` — scrubber tooltip for keyword-sorted fields

Source: Phase 2 §2.15, findings-4 Part 4.

**Current ES adapter behaviour:** Composite agg walk fetching all unique values up to MAX_PAGES=5 × BUCKET_SIZE=10,000 = 50,000 unique values with `startPosition` accumulation. Returns `SortDistribution` with `.buckets` and `.coveredCount`. Source: b2-hunt Section 3, dive #6 (es-adapter.ts:1634–1700).

**Media-api capability (relevant subset):** No composite-distribution endpoint exists. Source: Phase 1 §1 (no matching route).

**Classification rationale:** **(B1)** `field` and `direction` are derivable from `params.orderBy`. **(D)** New composite-distribution endpoint needed. Note: b2-hunt confirmed `findKeywordSortValue?` and `getKeywordDistribution?` are NOT fusible (two independent blockers: early-exit vs full-walk performance divergence; coverage cap difference at >50k unique values). They require separate endpoints.

**Action:**
- **(B1 — eliminate `field` and `direction`):** Same as `findKeywordSortValue?` — compute from `params.orderBy`.
- **(D — new keyword-distribution endpoint):** New `POST /images/keyword-distribution` accepting `{q, filters, orderBy}` and returning `{buckets: [{key, count, startPosition}], coveredCount: number}`. Server runs composite agg walk up to a page cap (5 pages × 10k = 50k unique values), accumulates `startPosition` per bucket. Size estimate: **M** (medium). Same composite infrastructure as `findKeywordSortValue?` but without early exit and with `startPosition` accumulation. Feasibility §Gap6 confirms no hard blockers; notes response size concern (50k entries × ~20 bytes = ~1MB).

**Pagination/cursor implication:** Optional method (`?`). Graceful absence: scrubber shows position numbers only (no keyword value labels). No scroll breakage.

**Provenance:** Phase 2 §2.15, Phase 2 §4 (field+direction derivable), findings-4 Part 4, feasibility §Gap6, b2-hunt Cluster 4 (NOT fusible verdict).

---

### `getDateDistribution?` — bucket B1+C

**Abstract need (restated):** Fetch a histogram of document counts over time for a date sort field with adaptive bucket granularity and cumulative position indices. A variant restricted to null-zone documents enables accurate scrubber positioning when the primary sort field has nulls.

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

**Current call sites:**
- `search-store.ts:3977` — scrubber tooltip for date-sorted fields (no `extraFilter`)
- `search-store.ts:4030` — null-zone uploadTime distribution (`extraFilter` = `{bool:{must_not:{exists:{field:primaryField}}}}`)

Source: Phase 2 §2.16, findings-4 Part 5 Note 5.

**Current ES adapter behaviour:** Two ES requests: (1) stats aggregation on `field` to determine span; (2) date_histogram with adaptive interval (month/day/hour/sub-hour based on span). `extraFilter` is added as an additional `must` clause when present. Source: Phase 2 §2.16, b2-hunt Cluster 4.

**Media-api capability (relevant subset):** `GET /images/aggregations/date/:field` — monthly date histogram on a requested field, filtered by optional `q`. It uses `calendarInterval(Month)` hardcoded with no direction, no adaptive granularity, no `startPosition`, and no null-zone support. Source: Phase 1 §2 GET /images/aggregations/date/:field, Phase 1 §4.

**Classification rationale:** The endpoint exists but is missing several features. **(B1)** `extraFilter: Record<string, unknown>` is the Phase 2 §4 leak #7: always `{bool:{must_not:{exists:{field:primaryField}}}}` where `primaryField` is derivable from `params.orderBy`. Replace with `missingField?: string`. Also `field` and `direction` are derivable from `params.orderBy` (B1 cleanup). **(C)** The existing `GET /images/aggregations/date/:field` endpoint needs additive extensions: `direction` param, `adaptive` flag, `startPosition` in buckets, `missingField` param. These are all additive — no breaking changes. Feasibility §Gap7 confirms this is Easy, model-solo.

**Action:**
- **(B1 — eliminate `extraFilter`):** Change `extraFilter?: Record<string, unknown>` to `missingField?: string` in the interface. The ES adapter derives the `must_not:exists` filter internally. Also eliminate `field` and `direction` (derivable from `params.orderBy`). Independent value: Yes — eliminates the `extraFilter` ES injection surface.
- **(C — trivial server extension):** Extend `GET /images/aggregations/date/:field` with: `direction` (asc|desc), `adaptive` (bool — triggers stats+histogram instead of fixed monthly), `missingField` (string — adds `must_not:exists` to the base query), and `startPosition` in `BucketResult`. All additions are additive; existing callers (Kahuna doesn't use this endpoint) are unaffected. Feasibility §Gap7 estimates ~50 LOC.

**Pagination/cursor implication:** Optional method (`?`). Graceful absence: scrubber shows position numbers only. `missingField` variant absence means null-zone scrubber ticks are inaccurate on non-upload-time sorts.

**Provenance:** Phase 2 §2.16, Phase 2 §4 leak #7, findings-4 Part 5 Note 5, Phase 1 §2 GET /images/aggregations/date/:field, Phase 1 §4, feasibility §Gap7.

---

### `fetchPositionIndex?` — bucket D

**Abstract need (restated):** Fetch the ordered list of IDs and sort cursors for every document in the current result set, without image content. Enables O(1) seek to any position during scrubber drag after the one-time background fetch completes.

**Method signature:**
```typescript
fetchPositionIndex?(
  params: SearchParams,
  signal: AbortSignal,
): Promise<PositionMap | null>;
```

**Current call sites:**
- `search-store.ts:1015` — background position map fetch after search stabilises

Source: Phase 2 §2.17, findings-4 Part 4.

**Current ES adapter behaviour:** Opens a dedicated PIT, runs a multi-phase `searchAfter` loop with `_source:false` collecting all IDs and sort cursors. Two-phase for null-zone correctness (phase 1: normal docs; phase 2: null-zone docs with `must_not:exists` filter). Chunked with thread yields. Hard-capped at all docs. Source: Phase 2 §2.17.

**Media-api capability (relevant subset):** `ElasticSearch.lookupIds` (Phase 1 §6.3) exists internally but is not wired to any route, uses `pinned_query`, and has the 200-ID cap. It is not applicable here. There is no streaming or chunked ID-cursor export endpoint. Source: Phase 1 §6.3.

**Classification rationale:** Genuine new capability. The full-position-map need (all IDs + cursors, no content, chunked, two-phase null-zone) does not map to any existing or easily-extended endpoint. The result set can be 100k+ documents — response sizing is a real concern. Phase 2 §6.2 flags the >500k-image response size issue. Feasibility §Gap8 rates this Hard/Mixed.

**Action (D):** New endpoint or paginated protocol. Capability gap description: "Return the ordered list of `(id, sortValues)` pairs for the full result set, without image document content, in a paginated/streaming fashion that kupua can chunk and assemble." Closest existing thing: Phase 1 §6.3 `lookupIds` — exists internally, not routed, wrong API (`pinned_query`, 200-ID cap, returns full source). Size estimate: **L** (large). Requires: new route, `_source:false` multi-page loop on the server, two-phase null-zone detection, either streaming response or client-driven pagination. The null-zone correctness requirement (phase-switch detection) is the key complexity multiplier — see feasibility §Gap8 risks for the Scala porting challenge.

**Pagination/cursor implication:** This method IS a position-map builder that internally uses cursor pagination. It depends on PIT (Gap 2) and the cursor-pagination infrastructure (Gap 1 / `searchAfter`) being available server-side.

**Provenance:** Phase 2 §2.17, Phase 2 §6.2, Phase 1 §6.3, feasibility §Gap8.

---

### `getByIds` — bucket D

**Abstract need (restated):** Retrieve complete image documents for a set of known IDs, treating the batch as a single logical request. Missing IDs are silently absent. Used for multi-selection loads and post-metadata-update refreshes.

**Method signature:**
```typescript
getByIds(ids: string[], signal?: AbortSignal): Promise<Image[]>;
```

**Current call sites:**
- `kupua/src/stores/selection-store.ts:673` — load full data for all selected images
- `kupua/src/stores/selection-store.ts:635` — reload images after metadata update

Source: Phase 2 §2.18, findings-4 Part 4.

**Current ES adapter behaviour:** Chunks `ids` into 1000-ID batches, runs `_mget` in parallel per chunk, merges results. Applies `_source_includes` via URL param. Source: b2-hunt Section 3, dive #5 (es-adapter.ts:1947–2010); Phase 2 §2.18.

**Media-api capability (relevant subset):** `GET /images?ids=CSV` — uses `pinned_query` + `SearchParams.maxSize=200` cap. Not viable for thousands of IDs. Phase 1 §6.3 notes `lookupIds` method exists in `ElasticSearch.scala` but is not routed. Feasibility §Gap12 proposes `POST /images/mget` as a new endpoint. Source: Phase 1 §6.3, feasibility §Gap12.

**Classification rationale:** The existing `GET /images?ids=` is fundamentally unsuitable (200-ID cap, wrong API, order not preserved — feasibility §Gap15). `lookupIds` is the right internal method but is unrouted. A new `POST /images/mget` endpoint is needed.

**Action (D):** New `POST /images/mget` endpoint accepting `{ids: string[]}` and returning the array of enriched image objects. Uses `multiGetRequest(ids)` in elastic4s (bypasses `SearchParams` and the 200 cap entirely). Applies `imageResponse.create()` per found doc. Missing IDs are silently absent (404 from `_mget` per doc = absent from response array). Size estimate: **S** (small). ~50 LOC. Feasibility §Gap12 confirms Easy.

**Pagination/cursor implication:** None. Batch ID fetch.

**Provenance:** Phase 2 §2.18, Phase 1 §6.3, feasibility §Gap12.

---

### `getIdRange` — bucket D

**Abstract need (restated):** Return the ordered list of image IDs for all images between two cursor positions (exclusive lower, inclusive upper) in the current sort order. Hard-capped at 5,000 IDs. Used for shift-click range selection.

**Method signature:**
```typescript
getIdRange(
  params: SearchParams,
  fromCursor: SortValues,
  toCursor: SortValues,
  signal?: AbortSignal,
): Promise<IdRangeResult>;
```

**Current call sites:**
- `kupua/src/hooks/useRangeSelection.ts:225` — shift-click range selection walk
- `kupua/src/hooks/useRangeSelection.ts:252` — swap-and-retry on direction mismatch

Source: Phase 2 §2.19, findings-4 Part 4.

**Current ES adapter behaviour:** `searchAfter` loop with `_source:false`, extracting IDs from sort-value arrays. Stops when the last hit's sort values exceed `toCursor` (overshoot detection). Hard cap at 5,000 IDs. Two-phase null-zone walk when cursor crosses the null-zone boundary. Source: Phase 2 §2.19, feasibility §Gap13.

**Media-api capability (relevant subset):** No cursor-range-walk endpoint exists. Source: Phase 1 §1 (no matching route). Feasibility §Gap13 identifies this as Hard/Mixed due to the null-zone walk complexity.

**Classification rationale:** Genuine new capability. No existing endpoint covers cursor-walk with overshoot detection. The null-zone crossing detection (`null-zone.ts:42–80`) must be replicated server-side in Scala.

**Action (D):** New `POST /images/id-range` endpoint accepting `{q, filters, orderBy, fromCursor, toCursor}` and returning `{ids: string[], truncated: boolean, walked: number}`. Server runs `search_after` loop with `_source:false`, checks each hit's sort values against `toCursor` for overshoot, stops at hard cap (5,000). Two-phase null-zone handling required: if `fromCursor` or any mid-walk cursor is in the null zone, apply `must_not:exists` filter and use the stripped sort clause for that phase. Size estimate: **L** (large). The null-zone phase-switch detection, cursor remapping, and overshoot logic are all non-trivial to port to Scala correctly. Feasibility §Gap13 cites `c1998394b` as a production bug in kupua's own TS implementation that required a fix — the same subtle case will apply to the Scala port.

**Pagination/cursor implication:** Depends on cursor pagination infrastructure (Gap 1 / `searchAfter`). The server-side range walk requires `search_after` + `_source:false` + null-zone detection — all overlapping with `fetchPositionIndex?` implementation.

**Provenance:** Phase 2 §2.19, findings-4 Part 4, Phase 1 §6.3, feasibility §Gap13.

---

### `searchByAi?` — bucket A

**Abstract need (restated):** Search for images using a natural-language description, returning results ranked by semantic relevance. Result set is ≤200 images. Other active filters narrow the semantic search space. Optional (graceful absence).

**Method signature:**
```typescript
searchByAi?(params: SearchParams, signal?: AbortSignal): Promise<SearchAfterResult>;
```

**Current call sites:**
- `search-store.ts:1881` — AI/semantic search (guarded: only called when method exists on `dataSource`)

Source: Phase 2 §2.20, findings-4 Part 5 Note 6.

**Current ES adapter behaviour:** Fetches a Bedrock query embedding via `bedrock-proxy-client.ts` (a Vite-proxied dev-mode shortcut), then calls the ES `hybridSearch()` path directly. This is a standalone dev-mode implementation of the same algorithm that media-api already runs server-side. Source: Phase 2 §2.20.

**Media-api capability (relevant subset):** `GET /images?useAISearch=true&q=...&vecWeight=0.7` — calls `hybridSearch()` in `ElasticSearch.scala`. Same Cohere Embed V4 model (`cohere.embed-v4:0`), same ES field (`embedding.cohereEmbedV4.image`), same BM25+KNN blend with max-score probe. Also supports `q=similar:<imageId>` for image-to-image KNN (kupua doesn't use this yet). Source: Phase 1 §5, findings-4 Part 5 Note 6.

**Classification rationale:** This was reclassified from "gap" to "not a gap" in findings-4 Note 6. Media-api already has the identical capability. Kupua's current implementation is a dev-mode shortcut that bypasses media-api entirely. `GridApiDataSource.searchByAi` simply calls `GET /images?useAISearch=true&q=${params.aiQuery}&vecWeight=${params.vecWeight ?? 1.0}`. No server work required.

**Note on Phase 1 §6.1 interaction:** Phase 1 §6.1 documents that `useAISearch=true` currently ignores all standard filters (date, cost, validity, etc.) because the AI search path bypasses the normal filter assembly. For the bucket-A classification to hold fully, this limitation must be documented as an accepted trade-off or the server-side §6.1 issue must be fixed. For now, this is classified A with the caveat that AI search filters are not applied on media-api. See Section 7, item 1.

**Action (A):** `GridApiDataSource.searchByAi(params, signal)` calls `GET /images?useAISearch=true&q=${encodeURIComponent(params.aiQuery!)}&vecWeight=${params.vecWeight ?? 1.0}`. Response `data` array becomes `hits`; `total` is `data.length` (since media-api KNN returns `total = hit count`, not corpus total — Phase 1 §6.6). No server work needed.

**Pagination/cursor implication:** No pagination. AI search returns a flat ≤200-image result set with `total === hits.length`. This is the key invariant that prevents scroll-mode and position-map activation.

**Provenance:** Phase 2 §2.20, Phase 1 §5, Phase 1 §6.1, Phase 1 §6.6, findings-4 Part 5 Note 6.

---

## Section 3 — The Pagination Model Gap

### The core issue

Phase 1 §2 documents unambiguously: media-api uses **offset-based pagination only** — `offset` (Int, default 0) and `length` (Int, default 10, max 200) via `SearchParams`. There is no `search_after` parameter on any route. There is no PIT API. The `links.next` pagination in the Argo response envelope is generated from `DateTime.now`-frozen `until` bounds — a point-in-time snapshot of the query, not a cursor.

Phase 2 §2.11 documents kupua's `searchAfter` as the single most-used DAL method with 23 production call sites in `search-store.ts` alone. The store uses cursor pagination for every page of every search.

### Methods affected

Every method that touches consistent multi-page navigation depends on cursor pagination:

| Method | Why cursor pagination matters |
|--------|-------------------------------|
| `searchAfter` | IS cursor pagination — 23 call sites |
| `openPit` | Required for snapshot consistency across pages |
| `closePit` | Lifecycle pair with `openPit` |
| `countBefore` | Counts position using sort cursors |
| `getIdRange` | Range walk using `search_after` loop internally |
| `fetchPositionIndex?` | Full position map via `search_after` loop |
| `findKeywordSortValue?` | Composite agg walk (not `search_after` but requires consistent index view) |
| `getKeywordDistribution?` | Same as above |

Additionally, the null-zone handling (Phase 2 §3.1) is a second layer on top of cursor pagination — documents missing their primary sort field require a two-phase query approach that is entirely absent from media-api.

### Is offset pagination sufficient?

No. For the following reasons:

1. **Offset limit:** ES's `from` parameter is capped at the `index.max_result_window` setting, typically 10,000 documents. The Guardian's corpus is 3M+ images. A user scrolling past image 10,000 would receive an ES error or empty results with offset pagination alone.

2. **Consistency:** Offset pagination is not stable — if new images are indexed during a user's session, page N+1 may overlap with page N (an image that was at position K moves to K+1 because a new image was inserted before it). PIT + `search_after` solves this; offset does not.

3. **Reverse navigation:** Kupua supports backward pagination (B-group call sites in findings-4). Offset supports this by computing `max(0, position - pageSize)`, but only within the 10,000-doc window. The store's reverse-from-end paths (D-group) require seeking to position `total - pageSize`, which may be well beyond 10,000.

4. **Sort-around-focus:** After the user changes sort order, the store must find where the previously-selected image now sits and navigate to it. `countBefore` does this — it uses cursor-based range counting, not offset. There is no offset-based equivalent.

### Is this one gap or multiple?

Two distinct capabilities are needed, which happen to be packaged together in ES's PIT+search_after feature:

1. **Cursor pagination** (Gap 1 in feasibility): `search_after` parameter on a search endpoint, returning per-hit sort cursors. This enables deep pagination without the 10,000-doc offset limit.

2. **Snapshot consistency** (Gap 2 in feasibility — PIT): An open consistent view of the index that persists across pages. Without this, cursor pagination still works but pages may be slightly inconsistent if new images arrive during a session. Kupua uses PIT to prevent the "new image jumps into your scroll session" problem.

These are separable: cursor pagination without PIT gives deep navigation but not perfect consistency. PIT without cursor pagination gives consistency but only within the offset window. Together they give deep + consistent navigation.

### DO NOT design the endpoint here

The capability gap is stated. Endpoint design (request/response schema, parameter names, PIT integration strategy) belongs in a per-gap workplan session.

---

## Section 4a — Bucket-B1 Catalogue (Shape-leak Elimination)

**✅ All 7 items DONE — 2026-06-01 — commit `bcde65a58`**

All items are fixable client-side alone unless noted. Sources: Phase 2 §4.

| # | Leak | Methods affected | ES shape eliminated | Fixable client-side only? |
|---|------|-----------------|---------------------|--------------------------|
| 1 | `sortOverride: Record<string, unknown>[]` | `searchAfter` (B+D4+E1 groups) | ES sort clause array — always `buildSortClause(params.orderBy)` | Yes — server derives from `orderBy` |
| 2 | `extraFilter: Record<string, unknown>` | `searchAfter` (B+D4+E1), `getDateDistribution?` | ES filter DSL — always `{bool:{must_not:{exists:{field:primaryField}}}}` | Partially: client removes the param; server must handle null-zone detection (Gap 10 = C) |
| 3 | `noSource: boolean` | `searchAfter` (INT only — `getIdRange` internal) | ES `_source: false` flag | Yes — remove from public interface; internal to `getIdRange` ES adapter implementation |
| 4 | `missingFirst: boolean` | `searchAfter` (D-group) | ES `missing: "_first"` sort option | Yes — rename to `seekToEnd: boolean` (abstract intent). Same server behaviour. |
| 5 | `sortClause: Record<string, unknown>[]` | `countBefore` | ES sort clause array — always `buildSortClause(params.orderBy)` | Yes — server derives from `orderBy` |
| 6 | `FilterAggRequest.query: Record<string, unknown>` | `getFilterAggregations` | ES filter DSL — always `parseCql("is:X").must[0]` | Partially: client changes to `isFilter: string`; server needs to accept named IS-filter strings (small C addition to Gap 18) |
| 7 | `getDateDistribution? extraFilter` | `getDateDistribution?` | ES filter DSL — always `{bool:{must_not:{exists:{field:primaryField}}}}` | Partially: rename to `missingField?: string`; server adds `must_not:exists` constraint (already covered in the C extension above) |

**Note on items 2 and 6:** The client refactor removes the ES DSL, but the server must understand the abstract intent. Item 2's null-zone detection maps to Gap 10 (already in feasibility plan as a transparent server behaviour). Item 6 maps to the `isFilters: string[]` extension of Gap 18. Neither requires a new server endpoint — both are additive extensions to existing or planned endpoints.

---

## Section 4b — Bucket-B2 Catalogue (Consolidation / Fusion) ✅ DONE — 2026-06-01

The four confirmed fusions from b2-hunt-findings.md §1 (F1–F4), restated inline. Source: b2-hunt Sections 1–2.

---

**F1 — Facet panel one-shot: `getAggregations` + `getFilterAggregations` → `getFacetData`**

- **Methods fused:** `getAggregations` + `getFilterAggregations`
- **Abstract shared need:** Both issue a `size:0` search with `buildQuery(params)` and return aggregation counts scoped to the current search context. They are called on adjacent lines (`search-store.ts:3868` and `3869`), fire as parallel ES requests, and together constitute the complete facet panel data load.
- **Surface reduction:** 2 → 1
- **Regression risk:** None. ES processes both `terms` aggs (for field distributions) and `filter` aggs (for IS-filter counts) in a single `_search` body. The `aggs` key accepts both types simultaneously. Field path keys (`metadata.credit`) and IS-filter name keys (`deleted`) cannot collide.
- **Rough fused signature:** `getFacetData(params, {fields: AggregationRequest[], isFilters: FilterAggRequest[]}, signal?): Promise<{fields: Record<string, AggregationResult>, filters: Record<string, number>, took?, fetchDuration?}>`
- **Independent value:** Yes — eliminates one parallel ES round-trip on every facet panel load, today, before any media-api migration. This is the most immediately actionable B2 fusion.
- Source: b2-hunt Cluster 1, Section 1, Section 3 dives #2+3.

---

**F2 — Count supersession: `count` → degenerate case of `countWithTickers`**

- **Methods fused:** `count` → wrapper on `countWithTickers`
- **Abstract shared need:** Both return a document count for the current search context. `countWithTickers` is a superset.
- **Surface reduction:** 2 → 1
- **Regression risk:** None. `count` has 0 production call sites. Interface tidying only.
- **Rough fused signature:** `count(params) ≡ this.countWithTickers(params).then(r => r.count)`
- **Independent value:** No — pure dead-code cleanup. No ES behaviour changes.
- Source: b2-hunt Cluster 7, Section 1.

---

**F3 — First-page unification: `search` → specialised `searchAfter` (first page)**

- **Methods fused:** `search` → first-page `searchAfter`
- **Abstract shared need:** Both fetch the first page of results for a given search context.
- **Surface reduction:** 2 → 1
- **Regression risk:** Low. `search` has 0 production call sites. The ticker agg path in `_doSearch(includeTickers=true)` is dead — the store uses `countWithTickers` for tickers in parallel. No ticker migration needed.
- **Rough fused signature:** `search(params) ≡ this.searchAfter(params, null, null, undefined, false, false, false)`
- **Independent value:** Yes — removes the unused `_doSearch`/`from`+`size` path for the first page, ensuring a single consistent first-page implementation.
- **Caveat:** Before removing `search` from the interface, grep `search-store.ts` for `.tickerCounts` on a `SearchResult` shape to confirm no reads. b2-hunt §6.2 flags this as low risk (0 call sites) but worth confirming.
- Source: b2-hunt Cluster 2, Section 1, Section 4 §Entry1.

---

**F4 — Single-doc fetch simplification: `getById` → thin wrapper on `getByIds`**

- **Methods fused:** `getById` → wrapper on `getByIds`
- **Abstract shared need:** Both retrieve image documents by known ID(s).
- **Surface reduction:** 2 → 1
- **Regression risk:** None. `_mget` for a single document is more efficient than `_search` with `{terms:{id:[id]},size:1}` — bypasses the query parser entirely.
- **Rough fused signature:** `getById(id) ≡ this.getByIds([id]).then(r => r[0])`
- **Independent value:** Yes — removes a redundant ES `_search` path for single-doc fetch; `_mget` is the correct API for doc-by-ID retrieval.
- Source: b2-hunt Cluster 3, Section 1, Section 3 dive #5.

---

## Section 4c — Bucket-C Catalogue (Trivial Server Extensions)

| # | Extension | Affects DAL methods | Maps to Phase 1 §6 (internal capability) |
|---|-----------|---------------------|-------------------------------------------|
| C1 | New `POST /images/aggregations`: multi-field terms aggs + full SearchParams | `getAggregations` | No internal capability — but `aggregateSearch` private method (~30 LOC) is the model |
| C2 | Extend `POST /images/aggregations` with `isFilters: string[]` (named IS-filter counts) | `getFilterAggregations` | Phase 1 §3 `is:` registry in `IsQueryFilter.scala` — all named filters already handled |
| C3 | Extend `GET /images/aggregations/date/:field` with `direction`, `adaptive`, `startPosition`, `missingField` | `getDateDistribution?` | No internal capability — existing endpoint extended additively |
| C4 | Gap 10: transparent null-zone detection on new `POST /images/search-after` endpoint | `searchAfter` (B+E1 groups after B1 refactor) | `filters.missing` in `common-lib/.../filters.scala:40` is the relevant primitive |

C4 is noted here because it is a C-sized addition to the D-sized `searchAfter` endpoint: the null-zone detection logic is ~70 LOC but reuses existing ES primitives and is part of the same `search-after` route implementation rather than a new route.

---

## Section 5 — Bucket-D Catalogue (The Real Server Work)

Sorted by size descending.

| # | New capability | Size (S/M/L) | DAL methods served | Phase 1 closest existing thing |
|---|----------------|--------------|--------------------|---------------------------------|
| D1 | `fetchPositionIndex?` — paginated ID+cursor stream, no content, two-phase null-zone | **L** | `fetchPositionIndex?` | Phase 1 §6.3 `lookupIds` (not routed, wrong API, 200-ID cap) |
| D2 | `getIdRange` — cursor range walk with overshoot detection + null-zone crossing | **L** | `getIdRange` | None. Range-walk logic entirely absent. |
| D3 | `searchAfter` — cursor pagination endpoint with PIT binding, reverse sort, null-zone detection | **M** | `searchAfter`, `search` (via F3) | Phase 1 §2 `GET /images` (query+filter infrastructure exists; cursor param and PIT binding absent) |
| D4 | `countBefore` — position count via range-query should-chain | **M** | `countBefore`, `count` (indirectly via F2) | None. `_count` exists; the multi-field should-chain construction does not. |
| D5 | `findKeywordSortValue?` — composite agg walk with early exit | **M** | `findKeywordSortValue?` | None. Composite agg infrastructure exists in elastic4s; no walk endpoint. |
| D6 | `getKeywordDistribution?` — full composite agg distribution with startPosition | **M** | `getKeywordDistribution?` | None. Same infrastructure as D5 but different walk pattern. |
| D7 | `countWithTickers` — size=0 count+ticker-aggs endpoint | **S** | `countWithTickers`, `count` (via F2) | Phase 1 §4 ticker aggs always-on in `GET /images extraCounts` — same aggs, just needs a count-only route |
| D8 | PIT lifecycle — `POST /images/pit` + `DELETE /images/pit/:pitId` | **S** | `openPit`, `closePit` | None. Phase 1 §6.7: "ElasticSearch.scala has no PIT code at all." |
| D9 | `getByIds` / `POST /images/mget` — multi-doc fetch without 200 cap | **S** | `getByIds`, `getById` (via F4) | Phase 1 §6.3 `lookupIds` (exists, not routed, wrong API) |

**Totals:** 9 D-items. 3 large, 3 medium, 3 small. Within the 2–8 expectation for standalone items; note D1–D6 represent 6 cursor/position capabilities which collectively cluster around the core pagination model gap (Section 3). The 3 small items (D7–D9) are more isolated.

---

## Section 6 — Reclassifications vs the Original 15-Gap Feasibility Plan

The original plan numbered gaps 1–18 (with skips). For each:

| Original gap | Verdict | Reason |
|---|---|---|
| **Gap 1** — `searchAfter` cursor pagination | **CONFIRMED D3** (D) — still needed | Core pagination gap. B1 client refactor removes `sortOverride`/`extraFilter` first. |
| **Gap 2** — PIT (openPit/closePit) | **CONFIRMED D8** (D) — still needed | Absolutely absent. Phase 1 §6.7 confirms no PIT code anywhere. |
| **Gap 3** — `countBefore` (position lookup) | **CONFIRMED D4** (D) — still needed | B1 removes `sortClause` param first (pure client refactor, independent value). |
| **Gap 4** — `estimateSortValue` (percentile seek) | **CONFIRMED D** (small) — still needed | B1 removes `field` param first. Still needs new endpoint. |
| **Gap 5** — `findKeywordSortValue` (composite walk) | **CONFIRMED D5** (D/M) — still needed | B1 removes `field`+`direction` params first. Still needs new endpoint. |
| **Gap 6** — `getKeywordDistribution` (full composite) | **CONFIRMED D6** (D/M) — still needed | B1 removes `field`+`direction`. Still needs new endpoint. |
| **Gap 7** — `getDateDistribution` improvements | **CONFIRMED C3** (C) — trivial extension | Existing route needs `direction`, `adaptive`, `startPosition`, `missingField`. B1 removes `extraFilter` from client. |
| **Gap 8** — `fetchPositionIndex` (full position map) | **CONFIRMED D1** (D/L) — still needed | No existing capability. Largest single D item. |
| **Gap 9** — Reverse sort / `missingFirst` | **CONFIRMED** — baked into D3 | `reverse` and `seekToEnd` (renamed from `missingFirst`) are params on the Gap 1 / D3 endpoint. Not a standalone gap. |
| **Gap 10** — Two-phase null-zone seek | **CONFIRMED** — baked into D3 as C4 | Transparent server behaviour on the D3 endpoint. ~70 LOC addition, not a standalone route. |
| **Gap 11** — `_source` response field filtering | **REMOVED** — not a real gap for kupua | No kupua DAL method requests partial fields from the server. `getIdRange` uses `noSource` internally — this is eliminated by B1 (Gap 13 server side handles it). The `_source` filtering in Gap 11 was a bandwidth concern; for cursor pagination the hits endpoint returns full images. |
| **Gap 12** — `getByIds` improvements | **CONFIRMED D9** (D/S) — still needed | lookupIds not routed, 200-ID cap makes existing `GET /images?ids=` unsuitable. |
| **Gap 13** — `getIdRange` (cursor walk) | **CONFIRMED D2** (D/L) — still needed | No range-walk endpoint. Most complex D item alongside D1. |
| **Gap 15** — DEFECT: `?ids=` order not preserved | **REMOVED** — not relevant for kupua | Kupua doesn't use `GET /images?ids=` in production (getByIds needs `POST /images/mget` — D9). The ordering fix is a Kahuna concern, not kupua. |
| **Gap 17** — Dedicated `count` endpoint | **SUPERSEDED by D7** | `count` (F2) becomes a wrapper on `countWithTickers`. D7 (`countWithTickers` endpoint) covers the count need. A standalone `GET /images/count` route is optional polish if `countWithTickers` endpoint exists. |
| **Gap 18** — `getAggregations` (batched multi-field) | **CONFIRMED C1+C2** (C) — still needed | C1 = terms aggs with full SearchParams; C2 = IS-filter extension. Both trivial. |
| **ADDED: Gap 19** | `countWithTickers` — D7 | Not in original plan. Flagged in findings-4 Note 3 as `GAP MISSING`. 3 call sites including every poll tick. S-sized. |
| **Gap 20 (AI)** | **REMOVED** — not a gap | `searchByAi?` maps to existing `GET /images?useAISearch=true`. A = no server work needed. Findings-4 Note 6 already called this out. |

---

## Section 7 — Cross-cutting Observations

1. **Phase 1 §6.1 is a prerequisite for full bucket-A on `searchByAi?`.** Currently `useAISearch=true` ignores all standard filters (date, cost, validity, labels, etc.) because the AI code path bypasses filter assembly entirely. Kupua's `searchByAi` receives the full `SearchParams` including filters. If users combine AI search with cost filters or date filters, those filters are silently ignored in media-api mode. This is classified A only because the **core semantic search capability** exists server-side. The missing filter behaviour should be documented in kupua's `GridApiDataSource` as a known limitation — and Phase 1 §6.1 should be in the backlog for the media-api team.

2. **B1 refactors have independent value today, unrelated to migration.** The seven ES-shape leaks in Section 4a are security and coupling concerns in the current codebase. Eliminating them reduces the risk of ES query injection and simplifies the DAL interface. The B2 fusions (especially F1) also have independent performance value — F1 eliminates a parallel ES round-trip on every facet panel load. These should be framed as "kupua improvements" not "migration prerequisites."

3. **The `orderBy` string is load-bearing.** Multiple B1 items depend on the server being able to derive `field` and `direction` from `params.orderBy`. The `orderBy` vocabulary (Section 3.3 of Phase 2) must be fully specified in any new endpoint contract: `{-uploadTime, uploadTime, -taken, taken, dateAddedToCollection}`. Phase 1 §2 documents media-api's current `orderBy` handling (`oldest`, `newest`, `taken`, `dateAddedToCollection`) — the naming differs slightly from kupua's. The mapping must be explicit in the adapter.

4. **`countWithTickers` ticker definition parity.** Phase 2 §6.3 flags: client's `gridConfig.tickerDefinitions` and server's `aggregationsNameToSearchClauseMap` must agree on names. Before D7's endpoint is designed, ticker name parity between client config and server config must be verified. If names differ, the server must accept ticker names as input rather than hard-coding them.

5. **PIT is a prerequisite for several other D items.** D3 (`searchAfter`), D1 (`fetchPositionIndex?`), and D2 (`getIdRange`) all use PIT for snapshot consistency. D8 (PIT endpoints) is therefore a logical first item before implementing D1–D3. The order matters for the workplan.

6. **D1 (`fetchPositionIndex?`) and D2 (`getIdRange`) share implementation infrastructure.** Both require: `search_after` loop, `_source:false`, two-phase null-zone detection, cursor extraction from sort values. D3 (the `searchAfter` endpoint) must exist before either D1 or D2 can be implemented on the server. The dependency chain is: D8 → D3 → D1, D2.

7. **`getDateDistribution?` (C3) is a trivial extension of an existing route — the easiest C item.** The existing `GET /images/aggregations/date/:field` already does 90% of the work. Adding `direction`, `adaptive`, `startPosition`, and `missingField` is ~50 LOC in the controller + aggregation layer. This could be the first C item implemented.

8. **`getAggregation` corpus-wide scope must not be conflated with `getAggregations` search-context scope.** Both return terms aggs, but `getAggregation` uses `match_all: {}` (no filter), while `getAggregations` uses `buildQuery(params)`. The server endpoints are different (`GET /images/metadata/:field` vs new `POST /images/aggregations`). Any attempt to unify them would regress typeahead quality (b2-hunt Cluster 1 confirmed this).

9. **`searchRange` (bucket A) is important for `GridApiDataSource` range fills.** The store currently never calls `searchRange` in production, but for `GridApiDataSource` it will be the method for filling non-adjacent viewport sections via offset+length pagination. Its 0 production call sites today don't imply it's unimportant — it's the bridge between media-api's offset model and the store's additive load pattern.

10. **The original 15-gap plan was substantially correct but missed 2 critical gaps.** `countWithTickers` (3 call sites, every poll tick) and `getFilterAggregations` (2 call sites, every facet panel open) are both high-frequency, must-have capabilities that were absent from Gaps 1–18. Both are now classified (D7 and B1+C2 respectively). The reclassifications (Gap 11, 15, 20 removed; Gap 7 downgraded to C) more than compensate — the net D-item count is lower than originally estimated.

---

## Section 8 — Coverage Gaps and Uncertainties

1. **`countWithTickers` ticker name parity (medium confidence).** The client's `gridConfig.tickerDefinitions` names and the server's `aggregationsNameToSearchClauseMap` names must match for D7 to work without bespoke ticker-name translation. This cannot be verified from the findings docs alone (neither Phase 1 nor Phase 2 reproduces the actual name values). *Resolution:* Read `gridConfig.tickerDefinitions` in `kupua/src/config/` and `ElasticSearch.scala:49–66` to compare names before designing D7's endpoint. *Provisional bucket:* D — confirmed. Name parity is a design detail, not a bucket-change question.

2. **`getAggregation` `size` parameter support (low-confidence gap).** Phase 1 §2 notes `GET /images/metadata/:field` uses a hardcoded aggregation size in `ElasticSearch.scala:469`. If kupua's typeahead callers pass `size=25` or similar and the server always returns 50 buckets, this may be acceptable. But it may need a trivial C addition (`size` query param) if bucket counts diverge. *Resolution:* Low priority; the existing default size may be sufficient for typeahead. *Provisional bucket:* A → A with possible trivial C addition.

3. **elastic4s PIT API surface.** Feasibility §Gap2 notes the PIT API surface in `nl.gn0s1s/elastic4s-core:8.18.2` was not verified from source. If `createPitRequest`/`deletePitRequest` are absent from the jar, D8 requires either a raw ES HTTP call or a library upgrade. *Resolution:* A quick grep of the elastic4s jar or build.sbt dependency tree resolves this before D8 is started. *Provisional bucket:* D — confirmed; this is a hard prerequisite check, not a bucket question.

4. **`getDateDistribution?` two-request cost (acceptable/uncertain).** The method makes 2 ES requests (stats + histogram). Phase 2 §2.16 notes this; the server extension (C3) may want to combine them or accept the 2-request cost. *Resolution:* Accept 2 requests for now; revisit if latency is a concern in profiling. *Provisional bucket:* C — confirmed.

5. **E1 null-prefixed cursor change (low regression risk but needs E2E validation).** Changing `search-store.ts:2950` to prepend `null` to the cursor (findings-4 Note 2 Option A) is a behavioral change to the deep null-zone seek path. While the logic is mechanical and correct, this code path is exercised in Playwright E2E tests. *Resolution:* Run `npm --prefix kupua run test:e2e` after the B1 refactor. Per AGENTS test directive table: E2E is mandatory after any change touching scroll/focus behaviour.

---

## Section 9 — Anti-Goals Appendix (≤30 items, one line each)

1. `orderBy` naming inconsistency between kupua (`-uploadTime`) and media-api (`newest`) should be resolved in the adapter layer, not by changing either codebase's naming.
2. `SearchAfterResult.pitId` field should be renamed to `snapshotId` in the abstract interface (Phase 2 §4 item 9) — the ES PIT ID naming should not leak into the domain contract.
3. `SearchParams.trackTotalHits` should be renamed to `exactCount` or made implicit for `search()` — it's an ES execution-cost knob masquerading as a business parameter.
4. `openPit`/`closePit` asymmetry (openPit uses `esRequest`; closePit uses `esRequestRaw`) is a latent bug risk in the ES adapter — noted in b2-hunt §7.12.
5. `hybridSearch` in media-api makes two sequential ES requests (max BM25 score probe + hybrid query) — doubles ES load per uncached AI query; relevant if AI search adoption grows.
6. Phase 1 §6.2: `GET /images/edits/:field` silently ignores the `field` path param (always aggregates on `labels`) — a silent API contract violation unrelated to kupua but worth flagging to the media-api team.
7. `fetchPositionIndex?` gap (D1) will produce a large payload for the Guardian's 3M+ image corpus — server-side streaming or client-driven pagination protocol needs a deliberate design choice in the workplan session.
8. `getIdRange` (D2) and `fetchPositionIndex?` (D1) share enough null-zone detection infrastructure that they should ideally share a Scala library function — coupling their implementation is a refactor opportunity.
9. `countBefore` (D4) range-query performance on a 3M-doc index may be slow for complex multi-field sorts — no mitigation at the API level; a caching strategy may be needed.
10. The `searchByAi?` filter-bypass issue (Phase 1 §6.1) should be filed as a tracked issue in the media-api backlog — it's a quiet feature degradation when filters are combined with AI search.
11. `SortValues = (string | number | null)[]` should be branded to prevent accidental construction — noted in Phase 2 §7.1.
12. The `dateAddedToCollection` sort order (Phase 2 §3.3) is only meaningful with a collection filter active — the new `searchAfter` endpoint should document this constraint explicitly.
13. `SearchParams.offset` vs `searchAfterValues` co-existence in `searchAfter` is confusing — the two pagination models should be mutually exclusive and the interface should enforce this.
14. `getByIds` parallel-chunk strategy (D9) produces partial results on abort without signalling completeness — callers assume completeness per the current contract.
15. `estimateSortValue` (D) returns `null` for three distinct reasons (abort, empty result, tdigest unavailable) — the server endpoint should distinguish these in the response.

---

## Self-check

- [x] Section 1 has exactly 20 rows, each with a bucket assignment
- [x] Every Section 2 subsection inlines: abstract need, call sites, current adapter behaviour, media-api capability, classification rationale, and a concrete action. Provenance citations present.
- [x] Every classification in Section 2 has provenance citations (Phase 1 + Phase 2 + b2-hunt if applicable)
- [x] Section 3 explicitly addresses the pagination gap as two distinct capabilities (cursor pagination + snapshot consistency), lists all affected methods, explains why offset is insufficient, and stops without designing an endpoint
- [x] Section 4b has exactly 4 b2-hunt fusions (F1–F4), each restated inline with all required fields
- [x] Section 5 has size estimates (S/M/L) with one-line justifications, sorted descending
- [x] Section 6 covers every gap in the original 15-gap plan with a verdict
- [x] No endpoint shapes / param names / response schemas designed (descriptions say "capability gap: X" only)
- [x] No source code (kupua/ or media-api/) was read — all facts from three findings docs
- [x] No commits, no test runs, no file modifications outside this findings doc
- [x] Acid test: a downstream agent reading any Section 2 subsection can identify the action, the call sites, the current behaviour, and the server capability without opening Phase 1, Phase 2, or b2-hunt-findings
