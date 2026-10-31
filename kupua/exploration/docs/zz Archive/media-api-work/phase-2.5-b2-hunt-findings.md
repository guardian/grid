# B2-Hunt Findings — Method Consolidation Audit

**Date:** 2026-05-31
**Status:** Read-only. No code written. No tests run. No files modified except this one.
**Inputs:**
- `phase-1-media-api-capability-inventory-findings.md` (558 lines)
- `phase-2-kupua-dal-needs-findings.md` (1179 lines)
- `kupua/src/dal/types.ts` (514 lines — read in full)
- `kupua/src/dal/es-adapter.ts` (2192 lines — targeted reads, ~6 dives)
- B2-hunt-handoff.md (this audit's brief)

---

## Section 1 — Executive Summary

Four fusions confirmed. Two were missing from Phase 2 §5 (F1 and F4). All confirmed
fusions pass both gates (performance and functionality). No forced fusions, no S0
premise problems.

| # | Fusion | Methods collapsed | Net surface | Regression risk | Independent value |
|---|--------|-------------------|-------------|-----------------|-------------------|
| F1 | Facet panel one-shot | `getAggregations` + `getFilterAggregations` | 2 → 1 | None | **Yes** — eliminates a parallel ES round-trip today |
| F2 | Count supersession | `count` → degenerate case of `countWithTickers` | 2 → 1 | None | No — `count` is dead code; interface tidying only |
| F3 | First-page unification | `search` → specialised `searchAfter` (first page) | 2 → 1 | Low | Yes — removes the unused `_doSearch`/`from`+`size` path |
| F4 | Single-doc fetch simplification | `getById` → thin wrapper on `getByIds` | 2 → 1 | None | Yes — removes the separate `_search`-by-terms path |

**Phase 2 §5 reconciliation in one line per entry:**
- §5 entry 1 (`search` ↔ `searchAfter`): Confirmed as F3, with one caveat (ticker agg
  migration work, Section 4).
- §5 entry 2 (`count` ↔ `countWithTickers`): Confirmed as F2 (dead code elimination).
- §5 entry 3 (`findKeywordSortValue?` ↔ `getKeywordDistribution?`): **REFINED** from
  "evaluate" to "NOT fusible" — see Section 4 and Cluster 4 evaluation below.

**What Phase 2 §5 missed:** F1 (`getFilterAggregations` + `getAggregations`) and F4
(`getById` + `getByIds`). F1 is the most actionable: these two methods are called on
adjacent lines (ss:3868 and ss:3869) and already share the same ES query body
(`buildQuery(params)` with `size:0`) — fusion is a one-commit change that eliminates a
parallel ES request on every facet panel load.

---

## Section 2 — Cluster-by-cluster Evaluation

### Cluster 1 — Aggregations

**Methods in cluster:** `getAggregation`, `getAggregations`, `getFilterAggregations`,
`countWithTickers`.

**Phase 2 §5 coverage:** `count` ↔ `countWithTickers` was noted (though `count` is
properly in Cluster 7 per the handoff — covered there). The aggregation cluster as a
four-method group was **absent from §5** entirely, as the handoff documents.

---

**Candidate: `getAggregation` + `getAggregations`**

- *Abstract shared need:* Both return document-count distributions for metadata fields.
- *Inputs delta:* `getAggregation(field, query?, size?)` — no `SearchParams`, optional
  free-text `query` hint. `getAggregations(params, fields[], signal?)` — full
  `SearchParams` filter context, array of fields.
- *Outputs delta:* `getAggregation` → `AggregationResult` (single field). `getAggregations`
  → `AggregationsResult.fields` (Record keyed by field path). Trivially bridgeable.
- *Performance gate:* `getAggregation` uses `match_all: {}` when `query` is absent — no
  filter applied. `getAggregations` with empty `SearchParams({})` would apply
  `FREE_FILTER` (because `buildQuery({})` fires the free-filter path since
  `params.nonFree !== "true"` evaluates to `true`). **These are not equivalent.**
  Forcing callers to pass `{nonFree:"true"}` to get a corpus-wide distribution is a
  leaky workaround. Source dive confirmed: `getAggregation` body line 819 uses
  `{ match_all: {} }` when no query — completely unfiltered.
- *Functionality gate:* `getAggregation` with a `query` uses `multi_match` on
  `metadata.englishAnalysedCatchAll` — a typeahead-specific substring-match strategy.
  `getAggregations` has no equivalent; its query comes from `buildQuery(params)` which
  is a full CQL + filter compilation. There is no way to express "typeahead prefix
  search on catch-all field" via `getAggregations` without adding a new parameter.
- **Verdict: FUSION REJECTED.** Two independent blockers: (a) different default query
  scope (corpus-wide `match_all` vs search-context-filtered), (b) the `query` typeahead
  parameter has no equivalent in `getAggregations`. Forcing unification would regress
  both call sites.

---

**Candidate: `getAggregations` + `getFilterAggregations`**

- *Abstract shared need:* Both return document counts scoped to the same
  `buildQuery(params)` filter context, in a single `size:0` ES request. They are the
  two halves of the facet panel data load.
- *Inputs delta:* `getAggregations` takes `fields: AggregationRequest[]` (terms aggs).
  `getFilterAggregations` takes `filters: FilterAggRequest[]` (filter aggs). Both also
  take `params: SearchParams` and `signal?: AbortSignal`.
- *Outputs delta:* `getAggregations` returns `{fields: Record<field, {buckets,total}>, took, fetchDuration}`.
  `getFilterAggregations` returns `Record<name, number>`. A fused return would be
  `{fields: Record<field, AggregationResult>, filters: Record<name, number>, took?, fetchDuration?}`.
- *Performance gate:* Currently both methods are called from adjacent lines in the store
  (`search-store.ts:3868` and `3869`) — they fire as parallel ES requests. Fusion
  combines them into one ES `_search` body where both `terms` and `filter` agg types
  coexist under the same `aggs` key. ES processes them in a single query execution pass.
  Result: one round-trip instead of two. **Performance strictly improves.**
- *Functionality gate:* No unique behaviour is lost. Both methods use `size: 0` and
  `buildQuery(params)` — source dive confirmed (es-adapter.ts:857–940). The agg names
  in `getFilterAggregations` are user-controlled (`FilterAggRequest.name`); terms agg
  keys in `getAggregations` are field paths. There is no naming collision risk because
  field paths use dot-notation (e.g. `metadata.credit`) while filter names use plain
  strings (e.g. `deleted`). Both can coexist in the same ES `aggs` map.
- **Verdict: FUSION CONFIRMED (F1).** Rough fused shape:
  `getFacetData(params, {fields, filters}, signal?): Promise<{fields: Record<string, AggregationResult>, filters: Record<string, number>, took?, fetchDuration?}>`.
  Media-api capability: Phase 1 Section 4 shows `GET /images` can return ticker filter
  aggs in `extraCounts`. Proper on-demand facet aggs for both types (`terms` per field
  + `filter` per named IS-filter) would require a new endpoint or extension of
  `/images/aggregations`. No blocking media-api dependency for es-adapter today.

---

**Candidate: `countWithTickers` + `getAggregations`/`getFilterAggregations`**

- *Abstract shared need:* All three use `buildQuery(params)` with `size:0`. All return
  aggregated counts.
- *Inputs delta:* `countWithTickers` uses hard-coded TICKER_AGGS (module-level constant
  from `gridConfig.tickerDefinitions`) and has no `fields` or `filters` parameter.
- *Outputs delta:* `countWithTickers` includes `count: number` from `track_total_hits:
  true` — the raw match count for the new-images poll. The facet methods do not need
  this count.
- *Performance gate:* `countWithTickers` sets `track_total_hits: true`. This instructs
  ES to perform a full-index count scan. Injecting this into the facet agg request would
  impose the full-index scan cost on every facet panel load — an unnecessary overhead.
  Conversely, injecting facet aggs into the poll request would send 10–20 unnecessary
  aggs on every poll tick (every few seconds).
- **Verdict: FUSION REJECTED.** `countWithTickers` serves the poll path (high frequency,
  minimal payload); the facet methods serve the panel-open path (low frequency, high
  breadth). Fusing them couples two paths with different cadences and different
  `track_total_hits` requirements, regressing both.

---

**Candidate: `getAggregation` + `getFilterAggregations`**

- *Abstract shared need:* Both return aggregated counts. That is where the similarity
  ends.
- *Inputs delta:* `getAggregation` is corpus-wide with an optional typeahead `query`;
  `getFilterAggregations` is search-context-scoped with named ES filter queries.
  Completely different call patterns.
- **Verdict: FUSION REJECTED.** Different query scope, different agg type, different
  use cases. No caller uses both in the same context.

**Cluster conclusion:** 1 fusion confirmed (F1: `getAggregations` + `getFilterAggregations`).
`getAggregation` is isolated by its corpus-wide scope + typeahead-specific query
mechanism. `countWithTickers` is isolated by its poll-path cadence + `track_total_hits`
coupling.

---

### Cluster 2 — Search/paging

**Methods in cluster:** `search`, `searchRange`, `searchAfter`, `countBefore`.

**Phase 2 §5 coverage:** `search` ↔ `searchAfter` (first page) was noted with caveat
about ticker aggs. `searchRange` and `countBefore` were not evaluated in §5.

---

**Candidate: `search` + `searchAfter` (first page)**

- *Abstract shared need:* Fetch the first page of results for a given search context.
- *Inputs delta:* `search` has no `searchAfterValues` or `pitId` parameter. `searchAfter`
  takes both. For a first-page call: `searchAfter(params, null, pitId, signal)`. The
  `null` cursor + optional `pitId` is the first-page variant.
- *Outputs delta:* `search` returns `SearchResult` (includes `tickerCounts?`).
  `searchAfter` returns `SearchAfterResult` (no `tickerCounts`). The ticker counts
  distinction is the only meaningful output difference.
- *Performance gate:* Source dive (es-adapter.ts:760–790) confirms: `_doSearch` with
  `includeTickers=true` (called by `search`) differs from `searchAfter` only in the
  presence of `TICKER_AGGS` in the ES body. The `from`/`size` pagination in `_doSearch`
  is also used by `searchAfter` when `searchAfterValues` is null. No ES-level regression
  from fusion — the ticker agg injection would simply move from `search()` to an
  `includeTickers?: boolean` option on `searchAfter`.
- *Functionality gate:* `search` has **0 production call sites** on `dataSource` (Phase 2
  §2). The store always uses `searchAfter(params, null, pitId)` for first-page fetches.
  Ticker counts are fetched separately via `countWithTickers` (`search-store.ts:1997`).
  The ticker-on-search path in `_doSearch` is functionally dead in the current store.
  The store-level work is low: move the ticker extraction from `search` to the
  `countWithTickers` call that already runs in parallel.
- **Verdict: FUSION CONFIRMED (F3).** `search(params)` ≡ `searchAfter(params, null, null)`
  plus ticker injection (which is already separately handled by `countWithTickers` in
  the store). Rough shape: `searchAfter` gains an optional `includeTickers?: boolean`
  flag, or ticker injection is removed from the first-page path entirely. The `search`
  method becomes a thin wrapper or is removed from the interface after `GridApiDataSource`
  is in place. Net: 2 → 1. Low regression risk. **Caveat:** The store-level refactor
  (verifying ticker counts arrive correctly when `search` is gone) needs a targeted
  test run — identified in advance so Phase 3 can plan accordingly.

---

**Candidate: `searchRange` + `searchAfter`**

- *Abstract shared need:* Both fetch a page of results in the current search context.
- *Inputs delta:* `searchRange(params, signal?)` — takes `SearchParams` with
  `params.offset`/`params.length` for offset-based pagination. `searchAfter` takes a
  cursor (`SortValues | null`). These are different pagination models.
- *Functionality gate:* `searchRange` exists specifically for `GridApiDataSource`'s
  needs (Phase 2 §2): the media-api `/images` endpoint uses offset+length pagination,
  not cursor pagination. For the ES adapter, both methods reach `_search`; for the
  future media-api adapter, `searchRange` maps to a clean offset query while
  `searchAfter` needs cursor emulation. Fusing would collapse the offset-vs-cursor
  distinction that `GridApiDataSource` will need.
- **Verdict: FUSION REJECTED.** The distinction between offset-based and cursor-based
  pagination is a load-bearing abstraction for Phase 3. `searchRange` has 0 production
  call sites today (same as `search`) but is explicitly reserved for `GridApiDataSource`
  range fills. Do not fuse.

---

**Candidate: `countBefore` + anything**

- `countBefore` issues a `_count` request with a custom range-query tree derived from
  `sortValues` and `sortClause`. No other method in the interface returns document
  position counts. Source dive (es-adapter.ts:1378–1415) confirms it is a uniquely
  complex range-query builder with no shared structure with other methods.
- **Verdict: NO FUSION.** Standalone.

**Cluster conclusion:** 1 fusion confirmed (F3: `search` → first-page `searchAfter`).
`searchRange` preserved as distinct. `countBefore` standalone.

---

### Cluster 3 — Fetch

**Methods in cluster:** `getById`, `getByIds`.

**Phase 2 §5 coverage:** Not evaluated.

---

**Candidate: `getById` + `getByIds`**

- *Abstract shared need:* Retrieve image document(s) by known ID(s).
- *Inputs delta:* `getById` takes a single `id: string` with no signal.
  `getByIds` takes `ids: string[]` with optional `signal?: AbortSignal`.
- *Outputs delta:* `getById` → `Image | undefined`. `getByIds` → `Image[]`. If
  `getById(id)` delegates to `getByIds([id]).then(r => r[0])`, missing images return
  `undefined` (since `r[0]` is `undefined` for an empty array). Contract preserved.
- *Performance gate:* Source dive (es-adapter.ts:800–817 for `getById`;
  es-adapter.ts:1947–2010 for `getByIds`). `getById` uses `_search` with
  `{query:{terms:{id:[id]}}, size:1}`. `getByIds` uses `_mget` with chunked
  1000-ID parallel batches. For a single ID, `_mget` with one doc ID is a direct
  document fetch — it bypasses the query parser entirely and uses the document store
  directly. This is **more efficient** than `_search` with `terms`, not less.
  Zero regression risk; slight improvement.
- *Functionality gate:* `getById` applies `_source` includes/excludes (same as
  `_doSearch`). `getByIds` applies them via `_source_includes` URL param (same fields,
  different encoding path). Functionally equivalent source filtering — same whitelist
  applied. No unique behaviour in `getById` that `getByIds` doesn't cover.
- **Verdict: FUSION CONFIRMED (F4).** `getById(id)` ≡ `getByIds([id]).then(r => r[0])`.
  Eliminates the separate `_search`-by-terms path. Net: 2 → 1. Regression risk: None.
  Independent value: Yes — one fetch strategy instead of two, and `_mget` is the
  correct ES API for doc-by-ID fetch.

**Cluster conclusion:** 1 fusion confirmed (F4).

---

### Cluster 4 — Seek/position

**Methods in cluster:** `estimateSortValue`, `findKeywordSortValue?`,
`getKeywordDistribution?`, `getDateDistribution?`, `fetchPositionIndex?`.

**Phase 2 §5 coverage:** `findKeywordSortValue?` ↔ `getKeywordDistribution?` was noted
with "Phase 3 should evaluate." Evaluated here.

---

**Candidate: `findKeywordSortValue?` + `getKeywordDistribution?`**

- *Abstract shared need:* Both walk unique keyword values for a sort field via composite
  aggregation, scoped to `buildQuery(params)`.
- *Inputs delta:* `findKeywordSortValue` takes `targetPosition: number` and has early
  exit — stops walking as soon as the cumulative count exceeds the target. `getKeywordDistribution`
  takes no target position and walks to completion (capped at MAX_PAGES=5 × BUCKET_SIZE=10000
  = 50,000 unique values).
- *Performance gate:* Source dive (es-adapter.ts:1466–1634 for `findKeywordSortValue`;
  es-adapter.ts:1634–1700 for `getKeywordDistribution`). `findKeywordSortValue` has
  `MAX_PAGES=50` (500,000 unique values cap) and `TIME_CAP_MS=8000` with per-page early
  exit. For a seek target at position 100 in a field with 200,000 unique values,
  `findKeywordSortValue` exits after page 1 (the target is in the first 10,000 values).
  `getKeywordDistribution` always fetches 5 pages (50,000 buckets → ~50KB response)
  before the caller can binary-search for position 100. Fusing by always fetching the
  full distribution regresses the seek path by at minimum 4 unnecessary pages for
  shallow seeks on high-cardinality fields.
- *Functionality gate:* `getKeywordDistribution` is capped at MAX_PAGES=5 (50k unique
  values). `findKeywordSortValue` is capped at MAX_PAGES=50 (500k unique values). For
  fields with 50k–500k unique values, the distribution is incomplete (only covers 50k);
  `findKeywordSortValue` can still seek into the uncovered range. Fusion would silently
  degrade seek accuracy on high-cardinality fields with >50k unique values — because the
  binary search on the distribution can't find targets beyond position 50k.
- **Verdict: FUSION REJECTED.** Two independent blockers: (a) early-exit performance
  advantage for `findKeywordSortValue` on shallow seeks, (b) range coverage gap for
  high-cardinality fields beyond `getKeywordDistribution`'s 5-page cap. Phase 2 §5 was
  right to say "evaluate before committing"; evaluation concludes they are
  **complementary**: the store uses `getKeywordDistribution` when available (O(log n)
  binary search, no additional requests) and falls back to `findKeywordSortValue` for
  high-cardinality fields or when the distribution hasn't loaded yet.

---

**Candidate: `estimateSortValue` + `getDateDistribution?`**

- *Abstract shared need:* Both answer "what is the sort value at a given position in a
  date-sorted result set?"
- *Inputs delta:* `estimateSortValue(params, field, percentile, signal?)` — single
  percentiles agg (1 ES request). `getDateDistribution(params, field, direction, signal?,
  extraFilter?)` — stats agg + histogram agg (2 ES requests) returning a full distribution.
- *Performance gate:* For a one-shot seek, `estimateSortValue` is 1 request (~5ms).
  Forcing `getDateDistribution` for every seek is 2 requests (~10–20ms), regardless
  of whether the distribution is cached. Caching partially mitigates this, but the
  distribution may not be loaded when the user initiates a seek (e.g. pressing End key
  before the scrubber tooltip has fetched the distribution).
- *Functionality gate:* `estimateSortValue` uses a `percentiles` (tdigest) agg — a
  probabilistic estimate optimized for speed. `getDateDistribution` uses `stats`+
  `date_histogram` — exact bucket counts. They are complementary in accuracy vs latency:
  the distribution is more accurate (exact bucket boundaries) but heavier. For the
  "approximate landing position for deep seek" use case, the tdigest estimate is fit
  for purpose; the histogram would over-serve the need.
- **Verdict: FUSION REJECTED.** Different cost profiles (1 vs 2 requests) and different
  accuracy models. The store's current architecture uses both: distribution for
  scrubber tooltips (loaded asynchronously), `estimateSortValue` for immediate seek
  response. This layering is correct.

---

**Candidate: `fetchPositionIndex?` + `searchAfter`/`getIdRange`**

`fetchPositionIndex` internally calls `this.searchAfter(... noSource:true ...)` in a loop.
It IS already a composition of `searchAfter`. No fusion candidate — it's a higher-level
operation that adds: PIT lifecycle management, two-phase null-zone handling, chunked
thread yields, abortable accumulation. All legitimate additions.

**Cluster conclusion:** 0 fusions confirmed. All five seek/position methods are distinct
and complementary. Phase 2 §5's "evaluate" for `findKeywordSortValue` ↔
`getKeywordDistribution` is resolved: **NOT fusible**.

---

### Cluster 5 — Range walk

**Methods in cluster:** `getIdRange`.

**Phase 2 §5 coverage:** Not evaluated.

**Candidate: `getIdRange` ↔ `searchAfter(noSource:true)`**

`getIdRange` calls `this.searchAfter(... noSource:true ...)` internally (es-adapter.ts:2088).
It adds: cursor-walk loop, `toCursor` overshoot detection (`sortValuesStrictlyAfter`),
ID extraction from sort values (`idIdx`), hard-cap truncation, null-zone crossing
detection (`detectNullZoneCursor`). These are all non-trivial additions, not
boilerplate.

The handoff's intuition ("no overlap?") is verified: `getIdRange` does not duplicate
`searchAfter` — it *uses* it. It is a proper composed abstraction.

**Verdict: STANDALONE.** No fusion candidate.

**Cluster conclusion:** 0 fusions. `getIdRange` is a correct higher-level operation.

---

### Cluster 6 — Snapshot

**Methods in cluster:** `openPit`, `closePit`.

**Phase 2 §5 coverage:** Not evaluated.

`openPit` returns a snapshot handle. `closePit` consumes one. They are inverse lifecycle
operations — `openPit` POST to `_pit`, `closePit` DELETE to `_pit`. They share no
abstract need, no common inputs, and no common output. This is as expected.

**Verdict: NOT FUSION CANDIDATES.** Lifecycle pair confirmed. One-line justification:
`openPit` creates a resource and returns its handle; `closePit` releases it — they are
as fusible as `malloc` and `free`.

**Cluster conclusion:** 0 fusions. Lifecycle pair, confirmed non-candidates.

---

### Cluster 7 — AI / count outliers

**Methods in cluster:** `searchByAi?`, `count`.

**Phase 2 §5 coverage:** `count` ↔ `countWithTickers` noted (confirmed here). `searchByAi`
standalone status was implicit in §5.

---

**Candidate: `count` + `countWithTickers`**

- Source dive (es-adapter.ts:778–800 for `countWithTickers`; lines 774–778 for `count`).
  `count` uses `_count` endpoint (lighter weight: no aggs). `countWithTickers` uses
  `_search` with `size:0` + TICKER_AGGS + `track_total_hits:true`. `count` has 0
  production call sites (Phase 2 §2). `countWithTickers` covers all 3 production use
  cases: poll tick, post-save ticker refresh, initial ticker fetch.
- *Performance gate:* `countWithTickers(params).then(r => r.count)` is slightly heavier
  than `_count` (a `_search` with `size:0` vs a dedicated count endpoint). But since
  `count` has zero call sites, there are no callers to regress. For `GridApiDataSource`,
  both map to `GET /images?length=0&countAll=true`.
- *Functionality gate:* No unique functionality in `count` — its entire contract is "return
  the match count," which is `r.count` from `countWithTickers`. The TICKER_AGGS in
  `countWithTickers` don't affect the count value.
- **Verdict: FUSION CONFIRMED (F2).** `count(params)` ≡
  `countWithTickers(params).then(r => r.count)`. Independent value: No (interface
  tidying only, since `count` is dead). Net: 2 → 1.

---

**Candidate: `searchByAi?` + anything**

`searchByAi` fetches a Bedrock embedding (external service call via
`bedrock-proxy-client.ts`) then runs a KNN or hybrid ES query. It is the only method
in the interface with an external embedding-service dependency. Its return invariant
(`total === hits.length`) is unique — it explicitly suppresses scroll mode and position
map activation. No other method shares these characteristics.

**Verdict: STANDALONE.** `searchByAi` is standalone by design. The Bedrock dependency,
the KNN query path, and the `total === hits.length` invariant collectively make it
incommensurable with any other method.

**Cluster conclusion:** 1 fusion confirmed (F2: `count` → wrapper on `countWithTickers`).
`searchByAi` standalone confirmed.

---

## Section 3 — Source-code Dives Performed

| # | Method | File:lines read | What I was checking | What I found |
|---|--------|-----------------|---------------------|--------------|
| 1 | `getAggregation` | es-adapter.ts:817–857 | Whether query scope is corpus-wide or filtered | Uses `match_all: {}` when `query` absent; `multi_match` on `englishAnalysedCatchAll` when present. No `buildQuery(params)`. **Blocks fusion with `getAggregations`.** |
| 2 | `getAggregations` | es-adapter.ts:857–910 | Whether it uses same query builder as `getFilterAggregations` | Both use `buildQuery(params)` + `size:0`. Agg types differ (terms vs filter). **Confirms F1 fusion path.** |
| 3 | `getFilterAggregations` | es-adapter.ts:910–940 | Whether it has any special caching or cancellation that would survive fusion | No caching. `signal` param passed through. Both methods in `getAggregations` and `getFilterAggregations` have identical ES request structure modulo agg type. **Confirms F1 is clean.** |
| 4 | `countWithTickers` | es-adapter.ts:754–800 | Whether it sets `track_total_hits` in a way that blocks fusion with facet methods | Confirmed `track_total_hits: true`. This is the key blocking signal for Candidate 1.3. |
| 5 | `getById` | es-adapter.ts:800–817 | Whether `getById` uses `_mget` or `_search`, and whether `_source` filtering matches `getByIds` | Uses `_search` with `terms:{id:[id]}`, `size:1`. `getByIds` uses `_mget`. **F4 confirmed**: `_mget` is more efficient for by-ID fetch than `_search`; `_source` filtering is equivalent via different encoding. |
| 6 | `findKeywordSortValue` / `getKeywordDistribution` | es-adapter.ts:1466–1700 | `MAX_PAGES` limits and early-exit logic | `findKeywordSortValue`: MAX_PAGES=50, TIME_CAP_MS=8000, per-bucket early exit. `getKeywordDistribution`: MAX_PAGES=5. Coverage gap confirmed: fields with >50k unique values can only be handled by `findKeywordSortValue`. **Fusion rejected.** |

Total dives: 6 (within ≤10 cap).

---

## Section 4 — Phase 2 §5 Reconciliation

### §5 Entry 1: `search` ↔ `searchAfter` (first page)

Phase 2 §5 framing: both map to the same `/images` endpoint; `search` has 0 production
call sites; the store uses `searchAfter` for first-page fetches.

**Confirmed** as F3, with one refinement Phase 2 §5 did not call out explicitly: the
ticker agg injection in `search` (`_doSearch(... includeTickers=true)`) is dead in the
current store — the store fetches tickers separately via `countWithTickers` at
`search-store.ts:1997`. So removing `search` does not require any ticker migration; the
ticker path is already on `countWithTickers`. F3 is cleaner than §5 implied.

**Verdict: CONFIRMED and refined.** Phase 3 can remove `search` from the interface
with lower migration cost than §5 estimated.

### §5 Entry 2: `count` ↔ `countWithTickers`

Phase 2 §5 framing: `count` has 0 production call sites; `GridApiDataSource` can
implement `count` as a wrapper.

**Confirmed** as F2. Source dive confirms `count` uses `_count` while `countWithTickers`
uses `_search`+`size:0` — slightly different ES endpoint, but the contract difference is
moot given zero production callers. For `GridApiDataSource`, the `count` method can
be `countWithTickers(params).then(r => r.count)` with no new endpoint needed.

**Verdict: CONFIRMED.**

### §5 Entry 3: `findKeywordSortValue?` ↔ `getKeywordDistribution?`

Phase 2 §5 framing: "complementary rather than truly redundant; Phase 3 should evaluate
whether one endpoint covers both use cases."

**REFINED to NOT FUSIBLE.** The "evaluate" instruction has been executed. Two specific
blockers found and cited:
1. **Early-exit vs full-distribution performance divergence** for high-cardinality fields
   (MAX_PAGES=50 early-exit vs MAX_PAGES=5 full walk).
2. **Coverage gap**: `getKeywordDistribution` caps at 50k unique values; deep seeks in
   fields with >50k unique values require `findKeywordSortValue`'s extended walk.

Phase 2 §5's "evaluate" was the right call; this audit resolves it. The two methods
are complementary and both belong in Phase 3's B2 catalogue as distinct methods.

**Verdict: REFINED to NOT FUSIBLE.** Phase 3 should keep both.

---

## Section 5 — Things Considered and Rejected (with reasons)

1. `getAggregation` + `getAggregations`: Different query scope (`match_all` vs
   `buildQuery`). Corpus-wide vs search-context-scoped is a real contract difference.
2. `countWithTickers` + `getAggregations`: Different `track_total_hits` requirements
   couple two paths with mismatched cadences (poll vs panel-open).
3. `searchRange` + `searchAfter`: Preserving the offset-vs-cursor distinction is
   load-bearing for `GridApiDataSource` Phase 3.
4. `countBefore` + anything: Complex custom range-query tree, standalone by design.
5. `estimateSortValue` + `getDateDistribution`: 1-request vs 2-request cost, different
   accuracy models. Complementary, not redundant.
6. `fetchPositionIndex` + `searchAfter`: `fetchPositionIndex` IS a composition of
   `searchAfter`; it adds PIT lifecycle, null-zone two-phase handling, and chunked
   yields — all legitimate.
7. All four aggregation methods as one: `getAggregation` is isolated by corpus-wide
   scope; `countWithTickers` isolated by poll-path cadence; only the middle two fuse.
8. `openPit` + `closePit`: Lifecycle pair. Not fusible by definition.
9. `searchByAi` + `searchAfter`: External embedding-service dependency and
   `total === hits.length` invariant make it non-composable.
10. `getIdRange` + `searchAfter(noSource:true)`: `getIdRange` is already the correct
    higher-level composition. Fusing would collapse a useful abstraction.
11. `getKeywordDistribution` + `getDateDistribution`: Different aggregation mechanisms
    (composite vs date_histogram). Both return `SortDistribution` but the build path
    and scaling characteristics are independent. No shared ES request possible.
12. `search` + `searchRange`: Both have 0 production call sites, but serve different
    pagination models (cursor vs offset). Not fusible without collapsing the abstraction
    that Phase 3 depends on.

---

## Section 6 — Coverage Gaps and Uncertainties

### 6.1 F1 return type design

The fused `getFacetData` return shape needs a concrete type decision: a merged object
`{fields, filters, took?, fetchDuration?}` or a union/discriminated approach. The
rough shape in Cluster 1 is sufficient for this audit; exact API design belongs in
Phase 3's implementation session.

*Resolution:* Phase 3 implementation session with store call-site review.

*Provisional verdict:* Non-blocking. The ES body fusion is clear; the return type is
a straightforward merge.

### 6.2 F3 ticker agg confirmation

Phase 2 notes the store fetches tickers separately via `countWithTickers`. The source
dive confirmed `search-store.ts:1997` uses `countWithTickers` for initial ticker fetch.
But without reading `search-store.ts:1987–2010` in full (outside the 100-line source
dive budget per candidate), there is a small residual risk: if `search` result's
`tickerCounts` is read anywhere in the store after the initial call, removing `search`
would silently drop those counts.

*Resolution:* Before Phase 3 implements F3, grep `search-store.ts` for `.tickerCounts`
on a `SearchResult` shape (not `CountWithTickersResult`) to confirm no reads.

*Provisional verdict:* LOW risk. Phase 2 §2's call-site analysis says `search` has 0
production call sites — if no one calls `search`, no one can read its `tickerCounts`.

### 6.3 F4 `_source_includes` param encoding parity

`getById` passes `_source: { includes, excludes }` in the body. `getByIds` passes
`_source_includes` as a URL query parameter (to stay under nginx's 1MB body limit with
1000 docs). For the fusion case (`getById` delegating to `getByIds([id])`), a 1-doc
`_mget` body is ~30 bytes — far under the limit — so the URL-param encoding is not
needed. However, `getByIds` always uses the URL-param path regardless of chunk size.
This is a minor inefficiency, not a correctness issue.

*Resolution:* Acceptable as-is. No action needed before Phase 3.

---

## Section 7 — Anti-goals Appendix (≤15 items, one line each)

1. `getAggregation`'s `multi_match` on `englishAnalysedCatchAll` is language-specific —
   non-English metadata typeahead would work better with a language-agnostic field.
2. `countWithTickers` with empty `gridConfig.tickerDefinitions` still issues a
   `_search` with `size:0` when a `_count` would be cheaper.
3. `searchAfter`'s 9-parameter signature is unwieldy — a params object would be more
   maintainable.
4. `getByIds`'s parallel-chunk strategy (`Promise.all`) means a single 404 chunk does
   not abort other in-flight chunks — failure is always partial. The contract says
   nothing about partial failure behaviour.
5. `estimateSortValue` returns `null` on abort AND on empty result AND on tdigest
   unavailability — callers cannot distinguish these three cases.
6. `findKeywordSortValue`'s TIME_CAP_MS is a compile-time constant embedded in the
   implementation; it should probably be configurable alongside `VITE_KEYWORD_SEEK_BUCKET_SIZE`.
7. `getDateDistribution` makes 2 ES requests (stats + histogram) sequentially — the
   stats could be eliminated if the caller already has a total count from `searchAfter`.
8. `fetchPositionIndex` opens its own dedicated PIT but there is no timeout guard —
   if the PIT open succeeds but the first chunk hangs, the PIT leaks until keepAlive.
9. `getKeywordDistribution` is capped at MAX_PAGES=5 with no telemetry about truncation —
   callers don't know whether the returned distribution is complete or partial.
10. `countBefore` with an all-null `sortValues` array silently returns 0 (the `should`
    array ends up empty, which is falsy — `return 0` at line 1407). Contract does not
    guarantee this.
11. `searchByAi` stores `__aiScore` directly on the `Image` object — this is a
    kupua-internal field injection into the shared domain type.
12. `openPit` uses `esRequest` (with index prefix) while most PIT-based searches use
    `esRequestRaw` (without prefix) — asymmetric routing that is easy to break.

---

## Self-check

- [x] All 7 clusters have a Section 2 subsection with a cluster conclusion
- [x] Cluster 1 (aggregations) has the deepest analysis — 4 pairwise evaluations
- [x] Every "FUSION CONFIRMED" has both gates explicitly evaluated (performance + functionality)
- [x] Section 1 table contains all 4 confirmed fusions (F1–F4)
- [x] Section 3 logs 6 source dives (≤10 cap)
- [x] Section 4 reconciles all three Phase 2 §5 entries
- [x] No code written; no commits; no test runs
- [x] No signatures designed in detail (rough shapes only: "A(params) ≡ B([...]).then(...)")
- [x] Total confirmed fusions: 4 (within 3–8 expectation)
- [x] Cluster 1 evaluation: 4 pairwise evaluations (within 4–8 expectation)
