# Current Task

Implement Phase 3 D3: `POST /images/search-after` endpoint (Leg A: Scala media-api) and kupua DAL wiring (Leg B: TypeScript). Full workplan in `phase-3-d3-searchafter-workplan.md`.

**BLOCKED** on PR [guardian/grid#4752](https://github.com/guardian/grid/pull/4752) ("Add chips and filtering to AI Search", author: ellenmuller). See Session Log for details. Do not start implementation until that PR is merged.

## Session Log

2026-06-05 — Fresh agent. Orientation complete. **Implementation not yet started.**

### Reading done — do NOT redo this research

All reference docs read in full:
- `ref--media-api-gap-01-searchAfter-findings-1.md` — No `Reads[SearchParams]`, no `Reads[Condition]`; use `Parser.run(q)`; `tier` from auth, not body; all parse helpers are string-based; `Option B` recommended (compose `SearchParams` inside `SearchAfterParams`)
- `ref--media-api-gap-01-searchAfter-findings-2.md` — elastic4s 8.19.1; `.pit()` auto-zeroes indexes; `SearchRequest.searchAfter(Seq[Any])`; PIT/searchAfter serialised into body automatically; `/_search` routing automatic
- `ref--media-api-gap-01-searchAfter-findings-3.md` — `respondCollection` returns `Result` directly; use `Ok(Json.obj(...)).as(ArgoMediaType)` for the new endpoint (Option b); do NOT extend `CollectionResponse` in common-lib
- `ref--media-api-gap-01-searchAfter-findings-4.md` — 22 call-site matrix; E1 anomaly is NOW FIXED in B1 (search-store.ts:2813 sends `[null, uploadTimeEstimate, ""]` as full-form null-prefixed cursor, not the 2-element stripped form); all B-group sites use `detectNullZoneCursor`; `extraFilter` always has one shape: `must_not exists field`; `sortOverride` always derivable from `params.orderBy`
- `ref--media-api-gap-closure-feasibility.md` — difficulty ratings, file locations
- `media-api-conventions.md` — full conventions including §14 (POST body parsing is fine, other Grid services do it)
- `media-api-instructions-for-agents.md` — all 22 rules

Source files read:
- `ElasticSearch.scala` — `search()` method (lines 280–470); `resolveHit`; `prepareSearch`; `withSearchQueryTimeout`; `executeAndLog`; `buildFilteredQuery` extraction target (the ~80-line filter block inside `search()`)
- `ElasticSearchModel.scala` — `SearchParams` case class; `SearchParams.apply(request)`; parse helpers; `PayType`; `InvalidUriParams`
- `sorts.scala` — `createSort`; `SortReplacements`; `UploadTimeDescending`; currently no `reverseSorts` or `appendTiebreaker`
- `MediaApi.scala` — `imageSearch()`; `hitToImageEntity` (nested def at line ~556); `getIncludedFromParams`; `canUserDeleteCropsOrUsages`; `isVisibleToAccessor`
- `conf/routes` — ordering; `POST /images/search-after` must go before `GET /images/:id`
- `filters.scala` — `existsOrMissing`, `mustNot`, `and`, `not`, `exists`, `missing` all available
- `ElasticSearchTest.scala` — `AnyFunSpec`; `ElasticSearchDockerBase`; `eventually`; insert in `beforeAll`; `Await.ready`
- `null-zone.ts` — `detectNullZoneCursor`; `remapNullZoneSortValues`; full algorithm read
- `es-adapter.ts` — `_searchAfterImpl`; reverse handling (outer only); `_shard_doc` strip; `sortValues.take(sortLen)`

### Five Q&A answers (confirmed by user)

**Q1 (sv.reverse bug):** Drop the inner `sv.reverse` — it was a copy-paste error in the workplan pseudocode. Only reverse the **outer** sequence of per-hit sort-value arrays. Additionally: strip `_shard_doc` by doing `hit.sort.take(effectiveSort.length)` before converting to JsValue.

**Q2 (sequencing):** Leg A first. Verify with curl against local media-api:
```
curl -s -X POST http://localhost:9001/images/search-after \
  -H 'Content-Type: application/json' \
  -d '{"q":"","length":5}' | jq .
```
Check: non-empty `data`, `total > 0`, `sortValues` array, `pitId` present. Then test null-zone with keyword sort. Only start Leg B after curl confirms server is correct.

**Q3 (readOrderBy visibility):** Duplicate the 3 lines inline in `fromJson`. Do NOT widen to `private[elasticsearch]`.

**Q4 (sort value conversion helpers):** Add to `ElasticSearch.scala`:
```scala
private def sortValueToJsValue(v: AnyRef): JsValue = v match {
  case null               => JsNull
  case n: java.lang.Long  => JsNumber(BigDecimal(n))
  case n: java.lang.Double => JsNumber(BigDecimal(n))
  case n: java.lang.Integer => JsNumber(BigDecimal(n))
  case s: String          => JsString(s)
  case other              => JsString(other.toString)
}
private def sortValuesToJsValues(sort: Array[AnyRef]): Seq[JsValue] = sort.toSeq.map(sortValueToJsValue)
private def jsValueToAny(v: JsValue): AnyRef = v match {
  case JsNull      => null
  case JsNumber(n) => if (n.isValidLong) java.lang.Long.valueOf(n.toLong) else java.lang.Double.valueOf(n.toDouble)
  case JsString(s) => s
  case _           => v.toString
}
```
Use `sortValuesToJsValues(hit.sort.take(effectiveSort.length))` for rawSortValues, and `.map(jsValueToAny)` when passing cursor to elastic4s `.searchAfter(...)`.

**Q5 (timeout on PIT path):** Apply `withSearchQueryTimeout` explicitly to the PIT branch since it bypasses `prepareSearch`:
```scala
case Some(pid) =>
  withSearchQueryTimeout(
    ElasticDsl.search(Nil).query(query).pit(Pit(pid).keepAlive(1.minute))
  )
case None =>
  prepareSearch(query)  // already applies timeout
```

### PR #4752 — BLOCKER

PR [guardian/grid#4752](https://github.com/guardian/grid/pull/4752) ("Add chips and filtering to AI Search", ellenmuller) is **open and active** (last updated hours before this session). It touches three of our planned files:

| File | What PR #4752 changes | Risk |
|---|---|---|
| `ElasticSearch.scala` | Changes `knnSearch`/`hybridSearch` signatures; **moves filter construction logic into `QueryBuilder.buildFilterOpt`** | HIGH — our `buildFilteredQuery` extraction operates on code this PR may restructure |
| `ElasticSearchModel.scala` | Adds `AiQueryParts` class; adds `aiQueryParts: lazy val` to `SearchParams` | LOW — additive, but merging will require care with the case class |
| `MediaApi.scala` | Updates `performAiSearchAndRespond`/`semanticSearch` | LOW-MED — different methods, but may touch `imageSearch()` too (not confirmed) |

**Critical risk:** If PR #4752 moves the filter assembly from inline in `search()` into `QueryBuilder`, our `buildFilteredQuery` extraction plan is working against a code shape that no longer exists. Worse: the *correct* implementation post-merge would call `QueryBuilder.buildFilterOpt` (or whatever it ends up named) rather than duplicating the logic.

### What the next agent must do before starting

1. Confirm PR #4752 is merged. Check: `git log --oneline main | head -20` or look at the PR URL.
2. **Re-read the three overlapping files** (do not rely on this session's reading):
   - `ElasticSearch.scala` — specifically how `search()` now builds its query. If filter assembly moved to `QueryBuilder`, `buildFilteredQuery` extraction is obsolete; call `queryBuilder.buildFilterOpt(params)` instead.
   - `ElasticSearchModel.scala` — current shape of `SearchParams` (may have new fields from the PR).
   - `MediaApi.scala` — does `imageSearch()` still have `hitToImageEntity` as a nested def, or did it move?
3. Then proceed with implementation using the workplan as the guide, adapting as needed for the post-merge code shape.

### Note on 2026-06-09 kupua changes

Today's work added two things relevant to D3 implementation:

**`usagesDateAdded` sort:** Added a nested sort (`usages.dateAdded`, `mode:max`, `nested:{path:"usages"}`, `missing:"_last"`) as a new `orderBy` value. This is exactly the case the Sort Companion describes as "cannot be expressed by `createSort`" — it reinforces Option B (client sends resolved sort clause) as the correct D3 build. No action needed for D3 Leg A; Option B already handles it by construction.

**`must_not: nested(usages.status:replaced)` default filter:** Added to `buildQuery` to mirror Kahuna's `thingsToHideByDefault`. This fires on ALL kupua queries (not just cursor pagination). When Leg B wires the new `POST /images/search-after` endpoint, verify the ES queries flowing to the server still include this `must_not` clause (it comes from `buildQuery(params)` which is called client-side in the ES adapter — it will be present in the query the server endpoint receives in its `q`/filter params). No action needed for Leg A (server never builds this rule). For Option A (future): this rule must be added to `buildFilteredQuery` on the server.

**`UsageFilterAggRequest` / nested aggs in `getAggregations`:** Not relevant to D3 itself, but affects the future C1/C2 aggregations endpoint — see phase-3 findings §7 observation 11.
