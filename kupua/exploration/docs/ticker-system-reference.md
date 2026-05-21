# Grid Ticker System Reference

Generated 2026-05-21. Reference for implementing ticker parity in Kupua.

---

## Section 0: Premise Check

1. **Ticker counts come from ES filter aggregations computed as part of the search request.**
   CONFIRMED. `ElasticSearch.scala:314-321` adds a `filterAgg` per ticker to the search request body.

2. **They are returned in `actions.tickerCounts` (the "argo hack").**
   CONFIRMED. `CollectionResponse.scala:32` defines `actions: Option[ExtraCounts]`. `ArgoHelpers.scala:39` passes `maybeExtraCounts` into that field with an inline `//FIXME` comment acknowledging the hack.

3. **There are exactly two ticker types today: org-owned and agency-picks.**
   CONFIRMED. `ElasticSearch.scala:44-68` defines exactly `maybeOrgOwnedExtraCount` and `maybeAgencyPicksExtraCount`, composed into `aggregationsNameToSearchClauseMap`.

4. **Agency-picks has a sub-aggregation by supplier; org-owned does not.**
   CONFIRMED. `ElasticSearch.scala:58-64` adds `termsAgg(name = "byAgency", field = "usageRights.supplier").size(9)` only to the agency picks config.

5. **Org-owned ticker is gated by `shouldDisplayOrgOwnedCountAndFilterCheckbox`.**
   CONFIRMED. `ElasticSearch.scala:45` and `CommonConfig.scala:49`.

6. **Agency-picks ticker is gated by `agencyPicksIngredients` being non-empty.**
   CONFIRMED. `MediaApiConfig.scala:82-90` returns `None` from `maybeAgencyPickQuery` when `agencyPicksIngredients` is `None`. `ElasticSearch.scala:53` gates the ticker on that.

7. **Kupua's `gridConfig` already acts as a mock of dynamic config with `staffPhotographerOrganisation` and `hasAgencyPicks`.**
   CONFIRMED. `grid-config.ts:22` has `staffPhotographerOrganisation: "GNM"` and `grid-config.ts:62` has `hasAgencyPicks: true`.

8. **Kupua's CQL→ES compiler handles `is:gnm-owned` AND `is:agency-pick`.**
   **PREMISE PARTIALLY WRONG.** `cql.ts:340-348` handles `is:gnm-owned`, `is:gnm-owned-photo`, `is:gnm-owned-illustration`, and `is:under-quota`. `is:agency-pick` is not handled — the `buildIsQuery` function falls through to `match_none` (`cql.ts:376`). This is a gap that must be filled.

9. **The new-images ticker in Kupua is a separate mechanism unrelated to category tickers.**
   CONFIRMED. `search-store.ts:576-601` polls `dataSource.count()` with a `since` parameter to get a bare integer. No aggregations involved.

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

`subCounts` for agency picks: buckets sorted descending by count, with an `"other"` key for the ES `otherDocCount` (`ElasticSearch.scala:351-357`). `"other"` is omitted if 0 (the `filter(_.exists { case (_, count) => count > 0 })` guard).

**Note:** Kupua's `SearchResponseActions.tickerCounts` in `types.ts:401` is typed as `TickerCount[]` (array), but the actual wire format is an object/map. This is a latent type bug — it doesn't matter because Kupua will not consume media-api ticker data.

---

## Section 2: Backend Pipeline

**Config** (`CommonConfig.scala:46-49, 218-220`):
- `staffPhotographerOrganisation`: defaults `"GNM"`. Used as the org-owned ticker key and searchClause prefix.
- `shouldDisplayOrgOwnedCountAndFilterCheckbox`: boolean; gates the org-owned ticker entirely.
- `agencyPicksIngredients: Option[Map[String, Seq[String]]]`: field→values map for matching agency images (e.g. `usageRights.category → ["agency", "agency-commissioned"]`).
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

**OrgOwned checkbox** (`query.js:60, 172-191`): `ctrl.maybeOrgOwnedValue` is set from `window._clientConfig.maybeOrgOwnedValue` (`KahunaController.scala:61-63`; value is `"GNM-owned"` or `undefined`). When the checkbox is ticked, `manageOrgOwnedSetting` inserts an `is:GNM-owned` chip into the CQL query bar. Unticking removes it. This is a persistent filter mechanism separate from ticker clicking.

**Image borders**: no dedicated ticker code — image borders are driven by `usageRights.category` CSS classes in Kahuna. The `#005689` colour is applied to staff/contract/commissioned photographer images.

---

## Section 4: Kupua Current State

| Item | Status | Location |
|------|--------|----------|
| `TickerCount` interface | Exists (minor type mismatch in `tickerCounts?: TickerCount[]` — should be a map, not array) | `types.ts:385-401` |
| `SearchResponseActions` with `tickerCounts` | Exists | `types.ts:400-402` |
| New-images ticker UI | Implemented (count-only, no category tickers) | `StatusBar.tsx:151-169` |
| `IMAGE_BORDERS` | Implemented — `#005689` for photographer categories | `image-borders.ts:7-10` |
| `gridConfig.staffPhotographerOrganisation` | `"GNM"` | `grid-config.ts:22` |
| `gridConfig.hasAgencyPicks` | `true` | `grid-config.ts:62` |
| `is:gnm-owned` CQL compilation | Implemented | `cql.ts:340-348` |
| `is:agency-pick` CQL compilation | **Missing** — falls through to `match_none` | `cql.ts:376` |
| Ticker filter aggregations in ES query | **Missing** | — |
| Ticker count state in search store | **Missing** | — |
| Ticker badge UI component | **Missing** | — |
| OrgOwned chip/checkbox | Referenced in DAL types; not implemented | — |

---

## Section 5: Gap Analysis

Kupua needs to build the following locally to reach parity:

1. **`is:agency-pick` in `cql.ts`**: Add a case in `buildIsQuery` for `"agency-pick"` that mirrors `maybeAgencyPickQuery` — a boolean-OR of `matchPhrase` queries on `usageRights.category` / `usageRights.supplier` derived from `gridConfig`. Without this, the ticker filter aggregation will always return 0.

2. **Ticker definitions in `gridConfig`**: Add a `tickerDefinitions` array to `grid-config.ts`. Each entry: `{ name, searchClause, backgroundColour, subAggField? }`. Initial entries: `is:GNM-owned` (colour `#005689`, no subAgg) and `is:agency-pick` (colour `#7d0068`, subAggField `usageRights.supplier`). Both gated by their existing config booleans.

3. **Filter aggregations in `_doSearch`**: Add an `aggs` block to the `_doSearch()` request body in `es-adapter.ts` — not to `getAggregations()`. Reasoning: `getAggregations` is a separate debounced `size: 0` request that runs terms aggs for typeahead/filter panel; it is fire-and-forget and may not fire at all during polling. Ticker counts must arrive atomically with the search result (zero extra round trips, consistent with how media-api does it). Concretely: when `gridConfig.tickerDefinitions` is non-empty, inject `aggs: { [name]: { filter: <compiledQuery> } }` (with optional `aggs` sub-agg for agency picks) into the body; extend `SearchResult` in `dal/types.ts` to carry an optional `tickerCounts` map; parse the agg buckets out of the ES response alongside `hits` and `total`. `getAggregations` is untouched — it keeps running its own terms aggs independently. No structural overlap between the two.

4. **Ticker count state in search store**: Parse the `filter` aggregation results from the ES response and store them alongside `total` and `newCount`. Reset on new search. Merge during new-images polling (same additive merge as Kahuna).

5. **Ticker UI — StatusBar badges + Filters panel "Is" section**: Tickers should appear in **both** the StatusBar (inline near result count, like Kahuna) and as a dedicated **"Is" section** in the left Filters panel.

   The Filters panel "Is" section is NOT limited to ticker-backed entries. It should show **all valid `is:` values** by iterating `buildIsOptions()` in `typeahead-fields.ts` (already config-aware: gates `agency-pick` on `hasAgencyPicks`, `reapable` on `useReaper`, etc.). Entries that have a corresponding ticker count display the count alongside; entries without counts (`deleted`, `under-quota`, etc.) are plain clickable chips. This means the section is populated entirely from existing infrastructure — ticker counts are an optional annotation layer on top.

   **Click action is identical to facet clicks** — no new code: `upsertFieldTerm(currentQuery, "is", value, false)` from `cql-query-edit.ts` + `updateSearch()`. Active-state detection: `findFieldTerm(currentQuery, "is", value)`. `formatCount()` already shared. The Filters panel section requires no extra fetch — it reads `tickerCounts` from store state already populated by `_doSearch()`.

   What's NOT shared with facets: data fetch (`_doSearch` not `getAggregations`), state slice (`tickerCounts` not `aggregations`). The ES agg type is also different (`filter` agg vs `terms` agg).

6. **Tooltip / subCounts breakdown**: Optional agency-picks breakdown table (supplier → count). Can be deferred — the badge is useful without it.

7. **OrgOwned checkbox**: Kahuna has a persistent checkbox that injects `is:GNM-owned` as a CQL chip. Kupua could replicate this, but ticker click may be sufficient for the initial cut. Decision deferred.

---

## Section 6: Genericisation Notes

**What's common to all tickers**: badge, background colour, count value, searchClause, click-to-filter, hide-when-zero, hide-when-value-equals-total.

**What varies**: subCounts breakdown (only agency-picks currently), checkbox pairing (only org-owned), tooltip content.

**Config-driven extensibility**: the `tickerDefinitions` array in `gridConfig` means adding a new ticker (e.g. "Has Crops", "Staff Portrait") = one array entry, zero code changes elsewhere. The ES query builder, store, and UI all iterate the definitions.

**`is:` section in Filters panel**: `buildIsOptions()` in `typeahead-fields.ts` is already the canonical list of all valid `is:` values, driven by `gridConfig`. The Filters panel "Is" section iterates this list — `tickerCounts` store state (populated by `_doSearch`) annotates entries that have counts. No new data fetching. No new CQL edit logic. `gridConfig.tickerDefinitions` only needs to carry the aggregation-specific extras: which `is:` values warrant a filter agg, their `backgroundColour`, and optional `subAggField`. The list of all `is:` values remains owned by `buildIsOptions()` — single source of truth, not duplicated.

**Known upcoming divergence — overquota ticker**: The overquota ticker concept would *hide* results (images that are over-quota should not be shown, not highlighted). This is the inverse of a counting ticker. It does not fit the current model of "count matching items and offer to filter to them". Implementing overquota as a ticker would require either a different visibility rule (`hide-when-value-equals-zero`) or a separate mechanism. Do not design a solution now — note that the `tickerDefinitions` shape may need a `filterMode: "include" | "exclude"` discriminant.

**Kupua advantage**: by computing tickers from direct ES aggs rather than consuming media-api, tickers work in all setups (standalone, dev, prod) with no Grid API dependency.
