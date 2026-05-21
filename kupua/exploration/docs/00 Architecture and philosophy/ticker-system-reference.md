# Grid Ticker System Reference

Reference for the ticker system as implemented in Kupua and its relationship to the
Grid backend. Covers wire format, backend pipeline, Kahuna UI, and Kupua implementation.

---

## Section 1: Wire Format

The `actions` field in a search response (top level of `CollectionResponse`) carries the ticker data.

**Case class chain** (`CollectionResponse.scala:9-33`):
- `ExtraCountConfig` — config-time struct (searchClause, backgroundColour, optional sub-agg)
- `ExtraCount` — result-time struct (value, searchClause, backgroundColour, optional subCounts)
- `ExtraCounts(tickerCounts: Map[String, ExtraCount])` — the `actions` payload

**Serialisation** uses `Json.writes[ExtraCount]` and `Json.writes[ExtraCounts]` (Play JSON, camelCase field names). The `subCounts` `Option` is omitted from JSON when `None`. The `subCounts` value is filtered to `None` if all counts are zero (`ElasticSearch.scala:357-359`).

```json
{
  "total": 1234,
  "data": [],
  "actions": {
    "tickerCounts": {
      "GNM-owned": {
        "value": 450,
        "searchClause": "is:GNM-owned",
        "backgroundColour": "#005689"
      },
      "agency picks": {
        "value": 12,
        "searchClause": "is:agency-pick",
        "backgroundColour": "#7d0068",
        "subCounts": {
          "Reuters": 5,
          "AP": 4,
          "Getty Images": 2,
          "other": 1
        }
      }
    }
  }
}
```

`subCounts` for agency picks: buckets sorted descending by count, with an `"other"` key for the ES `otherDocCount` (`ElasticSearch.scala:351-357`). `"other"` is omitted if 0.

**Note:** Kupua does not consume media-api ticker data. It computes ticker counts directly from ES, so the wire format above is informational only. `SearchResponseActions.tickerCounts` in `types.ts` has a latent type mismatch (`TickerCount[]` should be a map), but it is unused.

---

## Section 2: Backend Pipeline

**Config** (`CommonConfig.scala:46-49, 218-220`):
- `staffPhotographerOrganisation`: defaults `"GNM"`. Used as the org-owned ticker key and searchClause prefix.
- `shouldDisplayOrgOwnedCountAndFilterCheckbox`: boolean; gates the org-owned ticker entirely.
- `agencyPicksIngredients: Option[Map[String, Seq[String]]]`: field→values map for matching agency images (e.g. `metadata.description → ["topshot", "bestpix"]`).
- `agencyPicksColour: String`: defaults `"#7d0068"`.

**`maybeAgencyPickQuery`** (`MediaApiConfig.scala:82-90`): maps `agencyPicksIngredients` to a boolean-OR of `matchPhraseQuery` calls. Returns `None` if config absent.

**`IsQueryFilter`** (`IsQueryFilter.scala:26-40`): maps `is:X` tokens to ES queries. `is:gnm-owned` → terms query on `usageRights.category` against `UsageRights.whollyOwned` categories. `is:agency-pick` → wraps `maybeAgencyPickQuery` in `IsAgencyPick`. Config-keyed: `organisation` is lowercased, client sends uppercase `GNM`.

**Aggregation wiring** (`ElasticSearch.scala:44-68`): two `Option[(String, ExtraCountConfig)]` values composed via `List(...).flatten.toMap`. Each ticker is a named `filterAgg` whose filter is the compiled `searchClause` query.

**Request** (`ElasticSearch.scala:314-321`): `.aggregations(aggregationsNameToSearchClauseMap.map { case (name, ExtraCountConfig(searchClause, _, maybeSubAgg)) => filterAgg(name, queryBuilder.makeQuery(Parser.run(searchClause))).subAggregations(maybeSubAgg) })`.

**Result mapping** (`ElasticSearch.scala:331-360`): for each agg name, extracts `aggResult.docCount` and optionally the `byAgency` terms sub-agg buckets. Sub-buckets are sorted descending; `otherDocCount` is stored under key `"other"`. Wraps everything in `ExtraCounts` and attaches to `SearchResults.extraCounts`.

**Response dispatch** (`ArgoHelpers.scala:28-40`): `respondCollection` takes `maybeExtraCounts` and passes it as `actions` on the `CollectionResponse`.

---

## Section 3: Kahuna UI

**Initial load** (`results.js:235`):
```js
ctrl.tickerCounts = images.$response?.$$state?.value?.actions?.tickerCounts;
```
The `$$state.value` unwrap is needed because Kahuna uses AngularJS `$resource`, which wraps responses in a promise-like object.

**Polling merge** (`results.js:443-458`): `checkForNewImages()` fires a length-0 search with `since: latestTime`. On response, it adds `newTickerCounts[key].value` into `ctrl.tickerCounts[key].value` and merges `subCounts` by key, with unknowns folded into `"other"`.

**Badge template** (`results.html:35-55`): `ng-repeat="(name, tickerCount) in ctrl.tickerCounts"` with `ng-if="tickerCount.value !== ctrl.totalResults && tickerCount.value > 0"`. Hides when the ticker matches all results (meaningless) or zero results.

**Badge click** (`results.js:480-493`): `applyFilter(searchClause)` — idempotent append of the searchClause to `$stateParams.query`, then `$state.transitionTo` with `reload: true`.

**Tooltip** (`results.html:43-54`): shows "last updated X ago", then a table of `subCounts` if present (non-zero entries only).

**OrgOwned checkbox** (`query.js:60, 172-191`): `ctrl.maybeOrgOwnedValue` is set from `window._clientConfig.maybeOrgOwnedValue`. When ticked, `manageOrgOwnedSetting` inserts an `is:GNM-owned` chip into the CQL query bar. Unticking removes it.

**Image borders**: no dedicated ticker code — borders are driven by `usageRights.category` CSS classes in Kahuna. The `#005689` colour is applied to staff/contract/commissioned photographer images.

---

## Section 4: Kupua Implementation

Kupua computes ticker counts directly from ES rather than consuming media-api, so
tickers work in all setups (standalone, dev, prod) with no Grid API dependency.

| Component | Status | Location |
|-----------|--------|----------|
| `gridConfig.tickerDefinitions` array | ✅ Implemented | `grid-config.ts` |
| `is:gnm-owned` CQL compilation | ✅ Implemented | `cql.ts` |
| `is:agency-pick` CQL compilation | ✅ Implemented | `cql.ts` — bool/should of match_phrase across `agencyPicksIngredients` fields |
| `is:` case-insensitive matching | ✅ Fixed | `cql.ts` `buildIsQuery` lowercases both sides; ES standard analyser lowercases at index time |
| Ticker filter aggs in `_doSearch` | ✅ Implemented | `es-adapter.ts` — injected on initial search only (`includeTickers=true`), not on `searchRange` page-fills |
| `countWithTickers` for polling | ✅ Implemented | `es-adapter.ts` — `size:0` + ticker filter aggs; replaces `count()` |
| `getFilterAggregations` in `ImageDataSource` | ✅ Implemented | `es-adapter.ts` — fires named `filter` aggs for composite queries (not simple terms fields); used by `fetchAggregations` (parallel with main agg) and typeahead cold path |
| `tickerCounts` / `tickersLastUpdated` in store | ✅ Implemented | `search-store.ts` — reset on new search; additive merge on each poll tick |
| `isFilterCounts` in store | ✅ Implemented | `search-store.ts` — deleted/under-quota counts from `fetchAggregations`; read by `FacetFilters` `Is` section and typeahead warm path |
| `getImageBorderColour(image)` | ✅ Implemented | `image-borders.ts` — wraps all border logic; `isAgencyPick` checks case-insensitively |
| StatusBar ticker badges | ✅ Implemented | `StatusBar.tsx` — hides when 0 or equals total; native tooltip with "last updated X ago" + subCounts table |
| Filters panel `Is` section | ✅ Implemented | `FacetFilters.tsx` — all `is:` values from `buildIsOptions()`; ticker-backed values annotated with counts; zero-count values hidden unless active/excluded |
| `is:` typeahead counts | ✅ Implemented | `typeahead-fields.ts` — ticker store (ticker-backed), category agg buckets (photo/illustration), `isFilterCounts` cache (warm path); direct `getFilterAggregations` cold fallback issues 4 requests (deleted, under-quota, photo, illustration) |
| `is:reapable` | ❌ Not implemented | `useReaper: false` in mock config; `buildIsQuery` has no reapable case (would need `persistenceIdentifiers` in `gridConfig` to build the query) |
| OrgOwned checkbox | ❌ Deferred | Ticker click achieves the same effect; checkbox is a persistent-filter convenience |

**`gridConfig.tickerDefinitions` shape** (`grid-config.ts`):
```ts
{ name: string; searchClause: string; backgroundColour: string; subAggField?: string }
```
Adding a new ticker = one array entry. ES query builder, store, and UI all iterate the definitions.

**`_doSearch` ticker injection**: `buildTickerAggs()` (`es-adapter.ts`) compiles each definition's `searchClause` via `parseCql` and builds named `filter` agg objects. Definitions with `subAggField` get a nested `byAgency` terms agg (size 9), mirroring Scala. Only injected when `includeTickers=true`; `searchRange` passes `false`.

**Polling**: `countWithTickers` fires `_search` with `size:0`, `track_total_hits:true`, and ticker filter aggs. Returns `{ count, tickerCounts }`. The store performs additive merge: each new ticker delta is added to the running total, and `subCounts` entries are merged by key. `uploadTime` is immutable so an image crosses the `since` threshold at most once — no drift.

**`is:agency-pick` query**: bool/should of `match_phrase` clauses across `gridConfig.agencyPicksIngredients` fields (`metadata.description`, `metadata.keywords`, `metadata.title`). These are editorial metadata fields, not `usageRights.*` — wire agencies embed selection keywords (e.g. "topshot", "epaselect") in image metadata. `minimum_should_match: 1`.

**`is:under-quota` in local/mock mode**: `parseCql("is:under-quota")` calls `getOverQuotaSuppliers()` and builds `mustNot: { terms: { "usageRights.supplier": [...] } }`. When the quota-store has no over-quota suppliers (local Docker ES, mock data source, Playwright), the terms array is empty and ES treats `mustNot: { terms: { field: [] } }` as a no-op — the query matches all documents (`match_all` semantics). This is correct for local dev (no suppliers are over-quota), but means the `is:under-quota` filter panel entry will show the total count and the typeahead option will have a full-index count. Not a bug; expected local behaviour.

---

## Section 5: Known Gaps

**`is:reapable`**: The Scala-side `IsReapable` query uses `persistenceIdentifiers` (a list of collection/label identifiers marking images as "do not delete") and optionally `maybePersistOnlyTheseCollections`. These config values are not in `gridConfig`. Without them, `buildIsQuery("reapable")` falls through to `match_none`. `useReaper: false` in the mock config keeps the option hidden. Implementing it properly requires adding those config values and a `reapable` case in `buildIsQuery`.

**OrgOwned checkbox**: Kahuna has a persistent checkbox that injects `is:GNM-owned` as a CQL chip. The ticker badge in StatusBar and the `Is` section chip in the Filters panel both achieve the same effect via click. The checkbox adds persistent-filter UX but is not blocked on anything — deferred.

**Stale counts when editing an `is:` chip**: When a user edits an existing `is:X` chip (e.g. removes the value to change it), the `@guardian/cql` ProseMirror resolver fires *before* the `queryChange` event reaches the store. At resolver time, `tickerCounts` and `isFilterCounts` still reflect the previous query, so displayed counts may be stale for one render cycle. Two fixes were attempted and reverted (the store params haven't updated yet at resolver time in both cases). Declared an acceptable edge case — the counts correct themselves as soon as the new search completes.

**Overquota ticker concept**: If an overquota ticker were ever added, it would *hide* results rather than highlight them (images over-quota should not be surfaced, not counted). This is the inverse of the current model. The `tickerDefinitions` shape may eventually need a `filterMode: "include" | "exclude"` discriminant — do not add it until a concrete case exists.

---

## Section 6: Design Notes

**Home state**: When the query is empty (match_all), ticker counts represent global totals across the entire index — same as Kahuna. No special-casing needed; `buildQuery(params)` on an empty query produces match_all, and filter aggs run over that.

**Performance**: Filter aggs on the main search add negligible cost. ES builds the doc set once (for the top-level query) and each filter agg is a post-filter over that set — no additional index scan. There are three layers: (1) 2 ticker filter aggs injected into `_doSearch` (`buildTickerAggs()`); (2) 2 filter aggs for `is:deleted` / `is:under-quota` fired in parallel with the main agg request (`getFilterAggregations`); (3) the agency-picks sub-agg (terms on `usageRights.supplier`, size 9) adds one small cardinality count on top of the agency-picks filter agg. The poll request (`size:0` + ticker filter aggs over the tiny `since` window) is similarly trivial.

**Why not consume media-api ticker data**: Kupua uses direct-to-ES as its data layer. Computing tickers from ES avoids a dependency on the Grid API proxy being available, which would break standalone mode, Playwright tests, and any setup without a running media-api. The computation is cheap and the result is identical.

**Ticker visibility rule** (matches Kahuna): hidden when value = 0 or when value equals total results (the ticker matches everything — adding the filter would be a no-op).

