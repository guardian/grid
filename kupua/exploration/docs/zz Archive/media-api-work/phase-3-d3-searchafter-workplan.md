# Phase 3 — D3: `searchAfter` Cursor Pagination — Workplan

**Status:** READY TO IMPLEMENT. PR [guardian/grid#4752](https://github.com/guardian/grid/pull/4752) ("Add chips and filtering to AI Search") merged to `main` (commit `cdf30a5ca`) and is now in `mk-next-next-next` (merged 2026-06-10). **That merge changed the landscape and this workplan has been revised accordingly:**

- 4752 already extracted the ~80-line filter-assembly block out of `ElasticSearch.search()` into `QueryBuilder.buildFilterOpt(params, searchFilters, syndicationFilter): Option[Query]` (`QueryBuilder.scala:131`). The planned `buildFilteredQuery` extraction is therefore **obsolete** — `searchAfter()` calls the merged `buildFilterOpt` directly and **does not modify Kahuna's `search()`** at all (strictly safer than the original plan).
- 4752 added `SearchParams.aiQueryParts` — a `lazy val` derived from `structuredQuery`, **not** a constructor parameter — so `SearchParamsBody.fromJson` and `SearchParams` construction are unaffected.
- 4752 refactored only the AI-search methods (`performAiSearchAndRespond`/`semanticSearch*`/`parseAiSearchMode` + new `buildAiFilter`). **`imageSearch()` and the nested `hitToImageEntity` were NOT touched**, so the `hitToImageEntity` lift still applies cleanly.
- New caller of `buildFilterOpt`: AI `buildAiFilter`. This widens the blast radius of the one allowed shared-code change (matching both `dateAddedToCollection` tokens) — see the `buildFilterOpt` note in Implementation sketch §1.

Full diff analysis in the 2026-06-10 entry of `phase-3-d3-searchafter-worklog.md`.

**Status:** B1 and B2 refactors complete; 4752 merged. Ready to implement.
**Supersedes:** `ref--media-api-gap-01-searchAfter-workplan.md`
**Key difference from the old plan:** Gap 10 (null-zone) is now **mandatory**,
not out-of-scope. B1 moved null-zone handling into the ES adapter; the store
sends full null-prefixed cursors. The server must replicate this or kupua
breaks on every keyword sort with missing values.

---

## Endpoint Contract

```
POST /images/search-after
Content-Type: application/json
Cookie: <panda>

{
  "q": "cats",
  "orderBy": "-dateAddedToCollection",              // see “Sorts” note below
  "sort": [                                         // see “Sorts” note below
    { "collections.actionData.date": { "order": "desc", "missing": "_last" } },
    { "uploadTime": "desc" },
    { "id": "asc" }
  ],
  "length": 50,
  "sortValues": [1716000000000, 1716000000000, "abc123def456"], // omit for first page
  "pitId": "abc...",                                // optional
  "reverse": false,                                 // optional, default false
  "seekToEnd": false,                               // optional, default false
  "countAll": true,                                 // optional, default true
  // All filter fields flat at root (same keys as GET /images query params):
  "since": "2024-01-01T00:00:00Z",
  "uploadedBy": "joe.bloggs",
  ...
}

→ 200  Content-Type: application/vnd.argo+json
{
  "data": [ <EmbeddedEntity per image> ],
  "total": 1300000,
  "sortValues": [[1716000000000, "abc"], ...],
  "nextSortValues": [1715999000000, "ghi"],
  "pitId": "refreshed-pit-id-or-null"
}
```

**Sorts — the `sort` clause is authoritative (Option B).** The client sends the
**fully-resolved ES sort clause** in `sort`; the server applies it verbatim and
does **not** build the clause from `orderBy`. This is the deliberate “Option B”
shape: kupua already owns a single, tested clause builder (`buildSortClause` in
`sort-builders.ts`) that resolves every alias, appends the `uploadTime` fallback
and the `id` tiebreaker, and expresses both nested sorts (`dateAddedToCollection`,
`usagesDateAdded`) in both orders. Re-deriving that clause server-side would create
a second source of truth that must stay byte-identical forever (the cursor shape is
derived from this exact clause — see validation note). The full rationale, the
breakage analysis for the “server builds the clause” alternative, the longer-term
**Option A** (server owns a *semantic* `orderBy`), and the production-Kahuna safety
constraints live in the companion: `phase-3-d3-searchafter-sort-companion-workplan.md`.
**Build the companion's Option B changes in the SAME Scala and TS commits as this
endpoint — never land this endpoint with `orderBy`-driven sorting.**

**`orderBy` is still sent, but read for ONE thing only:** the
`dateAddedToCollection` companion `collections.pathHierarchy` filter (the
“for reasons unknown” scoping filter in `search()`). The server inspects `orderBy`
(both `dateAddedToCollection` and `-dateAddedToCollection`) solely to decide whether
to add that filter — it never builds the sort clause from it. `orderBy` does **not**
drive sorting on this endpoint.

**`seekToEnd`** (renamed from old `missingFirst`): sets `missing: "_first"` on
the primary sort field. Needed for reverse-seek-to-end on keyword fields.

**`sortValues`:** Opaque round-trip. The server round-trips them exactly —
whatever ES returns as hit sort values, the server returns to the client, and
the client sends back unchanged. One exception: **null-zone cursors** — see
mandatory Gap 10 section below.

**Validation:** `sortValues.length == effectiveSortClause.length` → 422.
The `effectiveSortClause` here is the client-sent `sort` array (after any
null-zone stripping), NOT a server-derived clause — this is exactly why Option B
is safe: the cursor and the clause come from the same builder on the client, so
their lengths agree by construction. Note: when null-zone is detected,
`effectiveSortClause` is the stripped clause (no primary field), so `sortValues`
must equal the full clause length minus 1. Simplest approach: validate AFTER
null-zone stripping, against the effective (possibly stripped) sort clause.

**`countAll`:** default `true`. Send `false` on pages after the first.

---

## Leg A — media-api (Scala)

### Production-Kahuna safety (read first)

media-api currently serves **production Kahuna**. This endpoint is **purely
additive** and MUST NOT alter anything Kahuna depends on:

- **Do NOT touch `sorts.createSort`, `sorts.dateAddedToCollectionDescending`, or
  the `dateAddedToCollectionFilter` / `collections.pathHierarchy` logic in
  `search()`.** Under Option B the new endpoint does not call `createSort` at all
  (the client sends the resolved clause), so there is no reason to modify it. The
  shared sort code stays exactly as-is, still serving Kahuna's `GET /images`.
- The new endpoint reuses the merged `QueryBuilder.buildFilterOpt` (already shared by
  `search()` and AI search) — it must not change that method's behaviour for existing
  callers. The one allowed change (matching both `dateAddedToCollection` tokens) is
  behaviour-preserving for `search()` and AI search — see the `buildFilterOpt` note in
  Implementation sketch §1.
- The remaining extraction (`hitToImageEntity` lift) DOES modify Kahuna-serving code.
  It MUST be **strictly behaviour-preserving** and the existing `imageSearch()` tests
  MUST stay green unchanged.

### Refactoring extractions (revised after 4752)

| Extraction | Status / Justification |
|---|---|
| ~~`buildFilteredQuery(params: SearchParams): Query`~~ | **Done by 4752.** The ~80-line filter block was lifted out of `search()` into `QueryBuilder.buildFilterOpt(params, searchFilters, syndicationFilter): Option[Query]`. `searchAfter()` calls it directly — no new extraction, and `search()` is untouched. |
| Lift `hitToImageEntity` to private method on `MediaApi` | Currently a closure inside `imageSearch()`; needed by this endpoint and Gap 12/8. **Still required** — 4752 did not touch `imageSearch()`. |
| `SearchParamsBody.fromJson(body: JsValue, tier: Tier)` | All POST endpoints need body→SearchParams; write once. Unaffected by 4752. |

> **Note (Option B):** the old plan's `sorts.appendTiebreaker` extraction is **not**
> needed for this endpoint. Under Option B the client's `buildSortClause` already
> appends the `id` tiebreaker, so the server applies the clause verbatim. Keep this
> extraction out of D3 to avoid touching shared sort code (see Kahuna-safety note).

### Files to touch

| File | Change |
|------|--------|
| `media-api/conf/routes` | Add `POST /images/search-after` before `GET /images/:id` |
| `media-api/app/lib/elasticsearch/ElasticSearchModel.scala` | New `SearchAfterParams`, `SearchAfterRawResults`, `SearchParamsBody.fromJson` |
| `media-api/app/lib/elasticsearch/ElasticSearch.scala` | New `searchAfter()` method (null-zone detection) calling the merged `queryBuilder.buildFilterOpt`; sort-value conversion helpers. **No `buildFilteredQuery` extraction — done by 4752.** |
| `media-api/app/lib/elasticsearch/sorts.scala` | Add `reverseSorts()` only (used by reverse pagination). **No `createSort` changes** — Option B applies the client clause verbatim. |
| `media-api/app/controllers/MediaApi.scala` | Lift `hitToImageEntity`; new `searchAfterImages()` handler |
| `media-api/test/lib/elasticsearch/ElasticSearchTest.scala` | Integration tests |

### Implementation sketch

#### 1. Filtered query — call the merged `buildFilterOpt` (no extraction needed)

4752 already extracted the filter-assembly block out of `search()` into
`QueryBuilder.buildFilterOpt(params, searchFilters, syndicationFilter): Option[Query]`
(`QueryBuilder.scala:131`). `searchAfter()` builds its filtered query exactly as
`search()` now does (`ElasticSearch.scala:286–293`):

```scala
val query: Query = queryBuilder.makeQuery(params.searchParams.structuredQuery)
val filterOpt: Option[Query] =
  queryBuilder.buildFilterOpt(params.searchParams, searchFilters, syndicationFilter)
val withFilter: Query = filterOpt.map(f => boolQuery() must query filter f).getOrElse(query)
```

`searchFilters`, `syndicationFilter` and `queryBuilder` are public `val`s on
`ElasticSearch` (lines 90, 91, 93), so the method is directly callable. **No code in
`search()` changes** — the original "extract `buildFilteredQuery`" task is gone.

> **Companion `pathHierarchy` filter — both orders.** The merged `buildFilterOpt`
> retains the `dateAddedToCollectionFilter` block, matching `Some("dateAddedToCollection")`
> only. kupua sends BOTH `dateAddedToCollection` (asc) and `-dateAddedToCollection`
> (desc), so the new endpoint needs the filter to fire for **both**. Match both tokens
> inside `buildFilterOpt`.
>
> **Blast-radius note (new after 4752):** `buildFilterOpt` is now shared by three
> callers — `search()` (Kahuna `GET /images`), AI `buildAiFilter`, and (new)
> `searchAfter()`. Adding the asc token is still behaviour-preserving for the first
> two: the filter only fires when `orderBy` is the asc token AND a `HierarchyField`
> phrase is present, and neither Kahuna nor AI search sends the asc token today. The
> sort clause itself is unaffected — it comes from the client `sort` array, not from
> `orderBy`. Confirm the existing `search()` and AI-search tests stay green after this
> one-line widening. (If you prefer zero blast radius, gate the asc token so only this
> endpoint can trigger it — but the both-token match is acceptable given the argument
> above.)

#### 2. `hitToImageEntity` lift

Currently a nested `def` inside `imageSearch()`. Lift to private method on `MediaApi`:

```scala
private def hitToImageEntity(
  request: Authentication.Request[_],
  include: List[String]
)(elasticId: String, image: SourceWrapper[Image]): EmbeddedEntity[JsValue] = {
  val writePermission = authorisation.isUploaderOrHasPermission(...)
  val deletePermission = authorisation.isUploaderOrHasPermission(...)
  val deleteCropsOrUsagePermission = canUserDeleteCropsOrUsages(request.user)
  val (imageData, imageLinks, imageActions) =
    imageResponse.create(elasticId, image, writePermission, deletePermission,
      deleteCropsOrUsagePermission, include, request.user.accessor.tier)
  val id = (imageData \ "id").as[String]
  EmbeddedEntity(uri = URI.create(s"${config.rootUri}/images/$id"),
    data = Some(imageData), imageLinks, imageActions)
}
```

#### 3. `SearchParamsBody.fromJson`

Parses the POST body into `SearchParams`. All ~20 fields read as strings from JSON,
same parsing helpers as `SearchParams.apply(request)`. `tier` comes from the
authenticated request, not the body.

> **Post-4752 note:** `SearchParams.aiQueryParts` is a `lazy val` derived from
> `structuredQuery`, not a constructor parameter — constructing `SearchParams` is
> unchanged and `aiQueryParts` auto-computes if ever read. This endpoint is non-AI
> (`useAISearch` is not set on the cursor path), so it never reads it.

```scala
object SearchParamsBody {
  def fromJson(body: JsValue, tier: Tier): Either[String, SearchParams] = {
    def str(key: String): Option[String] = (body \ key).asOpt[String]
    val query = str("q")
    val structuredQuery = query.map(Parser.run).getOrElse(List.empty)
    // ... all fields, same pattern as SearchParams.apply(request)
    Right(SearchParams(..., tier = tier))
  }
}
```

#### 4. `sorts.scala` additions + client-clause parsing

**Option B: the server does not build the sort clause.** It deserialises the
client-sent `sort` array into elastic4s `Sort` objects and applies them. Two
helpers:

```scala
// Reverse pagination: flip asc<->desc on every sort entry.
def reverseSorts(sorts: Seq[Sort]): Seq[Sort] = sorts.map {
  case fs: FieldSort =>
    fs.order(if (fs.order == SortOrder.ASC) SortOrder.DESC else SortOrder.ASC)
  case other => other
}
```

**Clause deserialisation (`jsonToSort`).** Each entry in the client `sort` array is
either a flat `{ field: "asc"|"desc" }` or a nested-object
`{ field: { order, missing?, mode?, nested?: { path } } }`. Map both to `FieldSort`:

```scala
// In sorts.scala (or a small private helper near searchAfter()).
// Mirrors the shapes produced by kupua buildSortClause:
//   { "uploadTime": "desc" }
//   { "id": "asc" }
//   { "collections.actionData.date": { order, missing } }
//   { "usages.dateAdded": { order, mode, nested: { path }, missing } }
def jsonToSort(entry: JsObject): Sort = {
  val (field, spec) = entry.fields.head
  spec match {
    case JsString(dir) =>
      fieldSort(field).order(orderOf(dir))
    case obj: JsObject =>
      val base = fieldSort(field).order(orderOf((obj \ "order").as[String]))
      val withMissing = (obj \ "missing").asOpt[String].fold(base)(base.missing)
      val withMode    = (obj \ "mode").asOpt[String]
        .flatMap(sortModeOf).fold(withMissing)(withMissing.mode)
      val withNested  = (obj \ "nested" \ "path").asOpt[String]
        .fold(withMode)(p => withMode.nested(p))
      withNested
    case _ => throw new InvalidUriParams(s"unrecognised sort spec for field $field")
  }
}
private def orderOf(s: String): SortOrder =
  if (s == "desc") SortOrder.DESC else SortOrder.ASC
```

> Note: `_id` vs `id` — kupua sends `id` (the document id field). Keep it as `id`
> unless an integration test shows the alias does not resolve as a sort field, in
> which case map `id` → `_id` at this boundary only. Do NOT change Kahuna's tiebreaker.

> Note: elastic4s `FieldSort.nested(path)`/`.mode(...)` signatures — confirm exact
> method names against 8.19.1 when unblocked (see References). The shape above is
> the intent; the DSL spelling may differ slightly.

#### 5. Data types

```scala
case class SearchAfterParams(
  searchParams: SearchParams,
  sort:         Seq[JsObject],         // client-resolved ES sort clause (Option B)
  sortValues:   Option[Seq[JsValue]],  // null-prefixed cursors allowed: JsNull at [0]
  pitId:        Option[String],
  reverse:      Boolean = false,
  seekToEnd:    Boolean = false,
)

// ES layer returns raw hits + sort values; controller enriches
case class SearchAfterRawResults(
  hits:           Seq[(String, SourceWrapper[Image])],
  total:          Long,
  sortValues:     Seq[Seq[JsValue]],         // per-hit, full shape (null-remapped)
  nextSortValues: Option[Seq[JsValue]],
  pitId:          Option[String],
)

case class SearchAfterResults(
  data:           Seq[EmbeddedEntity[JsValue]],
  total:          Long,
  sortValues:     Seq[Seq[JsValue]],
  nextSortValues: Option[Seq[JsValue]],
  pitId:          Option[String],
)
object SearchAfterResults {
  implicit val jsonWrites: OWrites[SearchAfterResults] = Json.writes[SearchAfterResults]
}
```

#### 6. `ElasticSearch.searchAfter()` — including mandatory null-zone detection

This is the core of the gap. The null-zone logic is mandatory (see above).
The authoritative TS implementation to port is:
- `kupua/src/dal/null-zone.ts` — `detectNullZoneCursor` + `remapNullZoneSortValues`
- `kupua/src/dal/es-adapter.ts` — `_searchAfterImpl` (~lines 964–1135)

**Null-zone algorithm (port from `null-zone.ts`):**

A cursor is in the null zone when `sortValues.head == JsNull` (the primary sort
field is missing on these documents — ES rejects `null` in `search_after`).

When detected:
1. Identify `primaryField` from `baseSorts.head` (as `FieldSort`)
2. Derive effective sort: `baseSorts` minus the primary field (typically `[uploadTime, id]`)
   — read the uploadTime direction from the existing sort clause rather than hardcoding
3. Effective cursor: `sortValues.tail` (strip the null prefix)
4. Add extra filter: `must_not: { exists: { field: primaryField } }`
5. After receiving results: remap returned sort values back to full shape by
   re-inserting `JsNull` at the primary field position

For remapping: iterate the original (full) sort clause; at the primary field
position emit `JsNull`; at all other positions consume from the hit's sort values.
This mirrors `remapNullZoneSortValues` in `null-zone.ts` exactly.

```scala
def searchAfter(params: SearchAfterParams)
               (implicit ec: ExecutionContext, logMarker: LogMarker)
    : Future[SearchAfterRawResults] = {

  // Filtered query, mirroring search() (ElasticSearch.scala:286-293). buildFilterOpt is
  // the merged 4752 method; no buildFilteredQuery extraction needed. `query` (the filtered
  // query) is used throughout the rest of this method, exactly as the old sketch did.
  val rawQuery: Query = queryBuilder.makeQuery(params.searchParams.structuredQuery)
  val filterOpt: Option[Query] =
    queryBuilder.buildFilterOpt(params.searchParams, searchFilters, syndicationFilter)
  val query: Query = filterOpt.map(f => boolQuery() must rawQuery filter f).getOrElse(rawQuery)

  // --- Sorts (Option B): apply the client-resolved clause verbatim ---
  // The client (kupua buildSortClause) has already resolved aliases, appended
  // the uploadTime fallback + the id tiebreaker, and expressed any nested sort
  // (dateAddedToCollection / usagesDateAdded). The server NEVER calls createSort
  // here — see Production-Kahuna safety note. orderBy is read only for the
  // companion pathHierarchy filter below.
  val baseSorts    = params.sort.map(sorts.jsonToSort)
  val withReverse  = if (params.reverse) sorts.reverseSorts(baseSorts) else baseSorts
  val withSeekToEnd = if (params.seekToEnd) {
    withReverse.headOption match {
      case Some(fs: FieldSort) => fs.missing("_first") +: withReverse.tail
      case _                   => withReverse
    }
  } else withReverse

  // --- Null-zone detection (mandatory) ---
  val isNullZone = params.sortValues.exists(sv => sv.headOption.contains(JsNull))

  val (effectiveSortValues, effectiveSort, extraMustNot) = if (isNullZone) {
    val sv = params.sortValues.get
    // primaryField: first field in the base sort clause (before reverse/seekToEnd)
    val primaryField = baseSorts.collectFirst { case fs: FieldSort => fs.field }
      .getOrElse(throw new InvalidUriParams("cannot detect primary field for null-zone"))
    // Stripped cursor: remove the null at position 0 (the primary field slot)
    val stripped = sv.tail
    // Effective sort: drop the primary field
    val nzSort = withSeekToEnd.filter {
      case fs: FieldSort => fs.field != primaryField && fs.field != "_id" || fs.field == "id"
      case _             => true
    }
    // actually: drop the first FieldSort that matches primaryField
    val nzSort2 = withSeekToEnd.filterNot {
      case fs: FieldSort => fs.field == primaryField
      case _             => false
    }
    val filter = existsQuery(primaryField).asInstanceOf[Query] // reused via filters.missing
    // Use common-lib filters.missing or build inline:
    val mustNotExists: Option[Query] = Some(not(existsQuery(primaryField)))
    (Some(stripped), nzSort2, mustNotExists)
  } else {
    (params.sortValues, withSeekToEnd, None)
  }

  // Validate cursor length against effective sort clause
  effectiveSortValues.foreach { sv =>
    if (sv.length != effectiveSort.length)
      return Future.failed(new InvalidUriParams(
        s"sortValues length ${sv.length} != sort clause length ${effectiveSort.length}"))
  }

  // Build request
  val baseRequest = params.pitId match {
    case Some(pid) =>
      import scala.concurrent.duration._
      ElasticDsl.search(Nil).query(query).pit(Pit(pid).keepAlive(1.minute))
    case None =>
      prepareSearch(query)
  }

  // Apply extra must_not filter (null-zone)
  val requestWithFilter = extraMustNot match {
    case Some(nf) =>
      val combined = boolQuery().must(query).not(nf)
      baseRequest.query(combined)
    case None => baseRequest
  }

  val withSort = requestWithFilter
    .size(params.searchParams.length)
    .sortBy(effectiveSort)
    .trackTotalHits(params.searchParams.countAll.getOrElse(true))

  val withCursor = effectiveSortValues match {
    case Some(sv) => withSort.searchAfter(sv.map(jsValueToAny))
    case None     => withSort
  }

  executeAndLog(withCursor, "search-after").map { r =>
    val rawHits     = r.result.hits.hits.map(resolveHit).toSeq.flatten
    val orderedHits = if (params.reverse) rawHits.reverse else rawHits

    val sortLen = effectiveSort.length
    val rawSortValues: Seq[Seq[JsValue]] = r.result.hits.hits.toSeq.map { hit =>
      val sv = hit.sort.take(sortLen).map(Json.toJson(_))
      if (params.reverse) sv.reverse else sv  // mirror hit ordering
    }
    val orderedSortValues = if (params.reverse) rawSortValues.reverse else rawSortValues

    // Remap null-zone sort values back to full shape
    val finalSortValues = if (isNullZone) {
      val primaryField = baseSorts.collectFirst { case fs: FieldSort => fs.field }.get
      remapNullZoneSortValues(orderedSortValues, baseSorts, primaryField)
    } else orderedSortValues

    SearchAfterRawResults(
      hits           = orderedHits,
      total          = r.result.totalHits,
      sortValues     = finalSortValues,
      nextSortValues = finalSortValues.lastOption,
      pitId          = Option(r.result.pitId).filter(_.nonEmpty).orElse(params.pitId),
    )
  }
}

// Remap: re-insert JsNull at the primary field position in each sort-values array.
// Mirrors remapNullZoneSortValues in kupua/src/dal/null-zone.ts.
private def remapNullZoneSortValues(
  sortValues:   Seq[Seq[JsValue]],
  fullSortClause: Seq[Sort],
  primaryField: String,
): Seq[Seq[JsValue]] =
  sortValues.map { sv =>
    var svIdx = 0
    fullSortClause.map {
      case fs: FieldSort if fs.field == primaryField => JsNull
      case _ =>
        val v = if (svIdx < sv.length) sv(svIdx) else JsNull
        svIdx += 1
        v
    }
  }
```

**Note on `jsValueToAny`:** elastic4s's `searchAfter` takes `Seq[Any]`. Extract
primitive from `JsValue`: `JsNull → null`, `JsNumber(n) → n.toLong or n.toDouble`,
`JsString(s) → s`. A simple pattern match suffices (~10 lines).

**Note on `common-lib` filter helpers:** `filters.scala` in `common-lib` provides
`existsQuery`, `not`, etc. Use these rather than inline DSL where available.

#### 7. Controller handler

```scala
def searchAfterImages() = auth.async(parse.json) { request =>
  implicit val logMarker = MarkerMap("requestType" -> "search-after", ...)

  SearchParamsBody.fromJson(request.body, request.user.accessor.tier) match {
    case Left(err) =>
      Future.successful(respondError(BadRequest, "invalid-params", err))
    case Right(searchParams) =>
      val params = SearchAfterParams(
        searchParams = searchParams,
        sort         = (request.body \ "sort").asOpt[Seq[JsObject]].getOrElse(Nil),
        sortValues   = (request.body \ "sortValues").asOpt[Seq[JsValue]],
        pitId        = (request.body \ "pitId").asOpt[String],
        reverse      = (request.body \ "reverse").asOpt[Boolean].getOrElse(false),
        seekToEnd    = (request.body \ "seekToEnd").asOpt[Boolean].getOrElse(false),
      )
      val include = getIncludedFromParams(request)

      elasticSearch.searchAfter(params).map { raw =>
        val imageEntities = raw.hits.map((hitToImageEntity(request, include) _).tupled)
        val results = SearchAfterResults(
          data           = imageEntities,
          total          = raw.total,
          sortValues     = raw.sortValues,
          nextSortValues = raw.nextSortValues,
          pitId          = raw.pitId,
        )
        Ok(Json.toJson(results)).as(ArgoMediaType)
      }.recover {
        case e: InvalidUriParams =>
          respondError(UnprocessableEntity, InvalidUriParams.errorKey, e.message)
      }
  }
}
```

#### 8. PIT handling (resolved — no manual wiring needed)

elastic4s 8.19.1's `.pit(Pit(...))` automatically zeroes `indexes` and routes to
`/_search`. No manual URL manipulation. Reference: `ref--media-api-gap-01-searchAfter-findings-2.md` §2–§5.

#### 9. Response shape (resolved)

Custom `SearchAfterResults` with `Json.writes` macro. Content-type `ArgoMediaType`.
Does NOT use `respondCollection` — avoids modifying shared `CollectionResponse` in
`common-lib`. Reference: `ref--media-api-gap-01-searchAfter-findings-3.md` §6.

---

## Leg B — Kupua (TypeScript)

**Significantly simpler than the old plan.** B1 removed all `sortOverride`/`extraFilter`
params. The strangler adapter is now a straight pass-through — no conditional fallback
logic needed. Every `searchAfter` call routes to the API when `VITE_USE_MEDIA_API=true`.

### Files to touch

| File | Change |
|------|--------|
| `kupua/vite.config.ts` | Whitelist `POST /api/images/search-after` in write guard |
| `kupua/src/dal/grid-api-search-adapter.ts` | **New** — thin API client for the endpoint |
| `kupua/src/dal/strangler-adapter.ts` | **New** — `ImageDataSource` that delegates `searchAfter` to API, all else to ES |
| `kupua/src/dal/index.ts` | Wire based on `VITE_USE_MEDIA_API` env var |

### `vite.config.ts` — write guard whitelist

```typescript
const READ_VIA_POST_PATHS = ["/api/images/search-after"];
// Add to existing write guard logic: allow POST to whitelisted paths
```

### `grid-api-search-adapter.ts` — API client

```typescript
import type { SearchAfterResult, SearchParams, SortValues } from "./types";
import { unwrapArgoSearchResult } from "./grid-api/argo";
import { buildSortClause } from "./adapters/elasticsearch/sort-builders";

export async function apiSearchAfter(
  params: SearchParams,
  searchAfterValues: SortValues | null,
  pitId: string | null | undefined,
  signal: AbortSignal | undefined,
  reverse: boolean | undefined,
  seekToEnd: boolean | undefined,
): Promise<SearchAfterResult> {
  const t0 = Date.now();
  const body = {
    q: params.query,
    orderBy: params.orderBy,                         // server reads only for the
                                                     // dateAddedToCollection filter
    sort: buildSortClause(params.orderBy),           // authoritative ES sort clause
    length: params.length ?? 200,
    ...(searchAfterValues ? { sortValues: searchAfterValues } : {}),
    ...(pitId ? { pitId } : {}),
    reverse: reverse ?? false,
    seekToEnd: seekToEnd ?? false,
    countAll: !searchAfterValues,
    // spread all filter fields flat:
    ...(params.since         ? { since: params.since }               : {}),
    ...(params.until         ? { until: params.until }               : {}),
    ...(params.uploadedBy    ? { uploadedBy: params.uploadedBy }     : {}),
    // ... all SearchParams filter fields
  };

  const res = await fetch("/api/images/search-after", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`search-after API ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  return {
    hits: unwrapArgoSearchResult(json.data),  // EmbeddedEntity[] → Image[]
    total: json.total,
    sortValues: json.sortValues,              // already full-shape (null-remapped by server)
    pitId: json.pitId ?? null,
    fetchDuration: Date.now() - t0,
  };
}
```

**`unwrapArgoSearchResult`**: reuse or extend existing helpers in
`kupua/src/dal/grid-api/argo.ts`. The response shape mirrors `GET /images` hits
(same `EmbeddedEntity` wrapping, same enrichment fields).

### `strangler-adapter.ts` — delegation

```typescript
export class StranglerAdapter implements ImageDataSource {
  constructor(private es: ElasticsearchDataSource) {}

  // Only searchAfter is delegated to the API
  async searchAfter(
    params, searchAfterValues, pitId, signal, reverse, seekToEnd,
  ): Promise<SearchAfterResult> {
    return apiSearchAfter(params, searchAfterValues, pitId, signal, reverse, seekToEnd);
  }

  // All other methods delegate to ES unchanged
  search(params) { return this.es.search(params); }
  searchRange(params, signal) { return this.es.searchRange(params, signal); }
  openPit(keepAlive) { return this.es.openPit(keepAlive); }
  closePit(pitId) { return this.es.closePit(pitId); }
  // ... all 15 remaining methods
}
```

### Wiring

```typescript
// kupua/src/dal/index.ts (or wherever dataSource is constructed)
const useMediaApi = import.meta.env.VITE_USE_MEDIA_API === "true";
const es = new ElasticsearchDataSource(config);
export const dataSource: ImageDataSource = useMediaApi
  ? new StranglerAdapter(es)
  : es;
```

---

## Test Plan

### Leg A (media-api)

Integration tests in `ElasticSearchTest.scala`:
- Basic pagination: insert 5 images, fetch page of 2, verify hits + nextSortValues, fetch next page using cursor
- Reverse: `reverse=true` returns hits in opposite order
- `seekToEnd=true`: cursor stops at docs without the primary sort field
- **Null-zone**: insert images where `metadata.dateTaken` is absent, use a keyword/date
  sort whose primary field is missing, verify the null-zone cursor `[null, uploadTime, id]`
  round-trips correctly and returns the right images
- **Sort coverage (Option B)**: the server applies the client `sort` clause verbatim.
  Cover the clause shapes kupua emits:
  - flat clause `[{uploadTime:desc},{id:asc}]` paginates correctly
  - keyword-alias clause `[{metadata.credit:asc},{uploadTime:desc},{id:asc}]`
    paginates correctly (proves alias resolution is honoured — server does NOT
    re-resolve)
  - nested clause `dateAddedToCollection` **both orders**:
    `[{collections.actionData.date:{order,missing:_last}},{uploadTime:order},{id:asc}]`
    — and assert the companion `collections.pathHierarchy` filter fires for BOTH
    `orderBy=dateAddedToCollection` and `orderBy=-dateAddedToCollection`
  - nested clause `usagesDateAdded` **both orders**:
    `[{usages.dateAdded:{order,mode:max,nested:{path:usages},missing:_last}},...]`
    paginates correctly (no companion filter)
- Validation: `sortValues` wrong length vs the client `sort` clause → 422

### Leg B (kupua)

- Unit test: `apiSearchAfter` — mock fetch, verify request body shape, verify response mapping
- Unit test: `StranglerAdapter` — verify `searchAfter` calls `apiSearchAfter`, other methods call ES
- Existing e2e tests must pass with `VITE_USE_MEDIA_API=false` (default, no regression)
- Manual validation with `VITE_USE_MEDIA_API=true` + local media-api:
  - Scroll through results on `-uploadTime` sort
  - Scroll through results on a keyword sort (e.g. photographer) that has images with missing field → null-zone path fires
  - Reverse scroll
  - Verify no jank difference vs direct-ES mode

---

## Done When

- [ ] `POST /images/search-after` responds on local media-api (verify with curl)
- [ ] Kupua scrolls correctly with `VITE_USE_MEDIA_API=true`
- [ ] Kupua scrolls correctly with `VITE_USE_MEDIA_API=false` (no regression)
- [ ] **All kupua sorts** work via the API path (Option B — client `sort` clause):
      `uploadTime` (both), `taken` (both), every keyword/numeric alias,
      `dateAddedToCollection` (both orders), `usagesDateAdded` (both orders, once
      it ships). See companion `phase-3-d3-searchafter-sort-companion-workplan.md`.
- [ ] Null-zone cursors round-trip correctly (keyword sort, images missing primary field)
- [ ] `reverse=true` works through API path
- [ ] `seekToEnd=true` works through API path
- [ ] PIT passthrough works (open PIT via ES, pass to API, get consistent results)
- [ ] `createSort` / `dateAddedToCollectionDescending` / Kahuna's `search()` sort
      behaviour are **unchanged** (existing tests green)
- [ ] `QueryBuilder.buildFilterOpt` behaviour is unchanged for `search()` and AI
      search except the documented both-token `dateAddedToCollection` match
      (behaviour-preserving for those callers; their tests stay green)
- [ ] Leg A integration tests pass
- [ ] Leg B unit tests pass
- [ ] Existing e2e tests pass (default ES mode)

---

## Out of Scope

- **Gap 9 (reverse sort as standalone):** Covered by `reverse` param on this endpoint.
- **Gap 10 (null-zone):** No longer out of scope — mandatory, implemented above.
- **Gap 11 (`_source` filtering):** Full images always returned.
- **Shadow/comparison mode:** Implement after this ships and is proven stable.
- **`noSource` param:** Internal to `getIdRange` — never exposed via API.
- **`sortOverride` / `extraFilter` params:** Eliminated by B1. Server handles null-zone
  transparently. These params no longer exist in the kupua DAL interface.
- **Streaming:** Response is a single JSON payload. Fine for length ≤ 200.
- **Server-owned semantic sorting (Option A):** Deferred. This endpoint uses
  Option B (client sends the resolved `sort` clause). The rationale, the breakage
  analysis, the Option A general shape, and the migration trigger live in
  `phase-3-d3-searchafter-sort-companion-workplan.md`. The Option B *build steps*
  are in THIS doc — they are not out of scope; they are the buildable core that
  makes the keyword/nested sort acceptance criteria pass.

---

## Reference documents

These contain verified Scala implementation details. Hand to the implementing agent:

| Doc | What's in it |
|-----|-------------|
| `ref--media-api-gap-01-searchAfter-findings-1.md` | No `Reads[SearchParams]` exists; available JSON codecs; how to parse body |
| `ref--media-api-gap-01-searchAfter-findings-2.md` | elastic4s 8.19.1 PIT + searchAfter API signatures; `.pit()` zeroes indexes; URL routing |
| `ref--media-api-gap-01-searchAfter-findings-3.md` | `respondCollection` / `CollectionResponse` shape; why to use custom writes instead |
| `ref--media-api-gap-01-searchAfter-findings-4.md` | 22 call-site matrix; E1 anomaly; proof that `extraFilter` is always one shape |
| `ref--media-api-gap-closure-feasibility.md` | Per-gap Scala file locations, method names, risk analysis |
| `media-api-conventions.md` | Scala conventions extracted from the codebase |
| `media-api-instructions-for-agents.md` | Agent instructions for media-api work |

---

## Commit strategy (commits wait until testing confirmed by user)

- **Commit A:** media-api files only. Branch: `mk-next-next-next`.
- **Commit B:** kupua files only (`vite.config.ts`, `src/dal/`). Branch: `mk-next-next-next`.

**Sort work lands in these same two commits.** The Option B sort handling is part
of this endpoint, not a follow-up: the Scala clause-deserialisation goes in Commit A,
the kupua `sort: buildSortClause(...)` goes in Commit B. **Never land this endpoint
with `orderBy`-driven server sorting** — doing so ships a build where most of the
sort dropdown is silently corrupt or 422s (see companion's breakage table).

---

## Appendix: Refactoring justification (for PR reviewers)

This commit includes two small extractions alongside the new endpoint (a third,
`buildFilteredQuery`, was already banked by PR #4752; a fourth, `appendTiebreaker`,
is dropped under Option B). They are motivated by concrete near-term reuse across
the 15-gap media-api expansion roadmap, not speculative cleanup. Each passes the
test: "would it be obviously wrong NOT to do this if you knew the full roadmap?"

### What was extracted and why

**1. ~~`buildFilteredQuery(params: SearchParams): Query`~~ — already done by PR #4752**

PR #4752 extracted the filter-assembly block out of `search()` into
`QueryBuilder.buildFilterOpt(params, searchFilters, syndicationFilter): Option[Query]`.
The new endpoint calls it directly, so there is **no extraction in this commit** and
`search()` is untouched. (The original justification — 9 of 15 planned endpoints need
the same filter assembly — still holds; 4752 happened to bank the win first.)

**2. `hitToImageEntity` lifted to private method** (~5 LOC signature change)

Was a nested `def` inside `imageSearch()` closing over `request` + `include`.
Three endpoints (this one, `mget`, `fetchPositionIndex`) need the same
hit-to-Argo-entity mapping. A nested closure isn't callable from other methods.

**3. `SearchParamsBody.fromJson(body: JsValue, tier: Tier)`** (~50 LOC)

Six planned endpoints accept filters via POST body. Each would need the same
20-field JSON→SearchParams parsing. Writing it once, tested once, wrong once max.

**4. ~~`sorts.appendTiebreaker(sorts: Seq[Sort])`~~ — dropped under Option B**

`search_after` requires a unique tiebreaker for deterministic pagination. Under
Option B the client's `buildSortClause` already appends the `id` tiebreaker, so the
server applies it as part of the verbatim clause — no server-side helper is needed,
and keeping it out avoids touching shared sort code (see Production-Kahuna safety).
If a future endpoint builds sorts server-side (e.g. Option A), revisit this then.

### What was deliberately NOT extracted

| Potential extraction | Why not |
|---|---|
| Split `search()` into build/execute phases | `searchAfter()` calls `buildFilteredQuery` + `prepareSearch` directly; no consumer for a split |
| Response mapping abstraction | Each endpoint has different response shapes; Gap 3 returns a scalar |
| Shared "cursor endpoint" base trait | Wait until 3+ cursor endpoints exist and the actual shared surface is visible, not the predicted one |
| `_source: false` mode | Gaps 8, 13 only — premature |

Null-zone detection is **not** in this table — it is mandatory in this endpoint
and is implemented directly in `ElasticSearch.searchAfter()` (Leg A §6).

These remaining candidates will be extracted when their second consumer arrives,
not before.
