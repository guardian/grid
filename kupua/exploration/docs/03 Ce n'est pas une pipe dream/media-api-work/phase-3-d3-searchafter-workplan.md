# Phase 3 — D3: `searchAfter` Cursor Pagination — Workplan

**Status:** Ready to implement. B1 and B2 refactors are complete.
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
  "orderBy": "-uploadTime",
  "length": 50,
  "sortValues": [1716000000000, "abc123def456"],   // omit for first page
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

**`seekToEnd`** (renamed from old `missingFirst`): sets `missing: "_first"` on
the primary sort field. Needed for reverse-seek-to-end on keyword fields.

**`sortValues`:** Opaque round-trip. The server round-trips them exactly —
whatever ES returns as hit sort values, the server returns to the client, and
the client sends back unchanged. One exception: **null-zone cursors** — see
mandatory Gap 10 section below.

**Validation:** `sortValues.length == effectiveSortClause.length` → 422.
Note: when null-zone is detected, `effectiveSortClause` is the stripped clause
(no primary field), so `sortValues` must equal the full clause length minus 1.
Simplest approach: validate AFTER null-zone stripping, against the effective
(possibly stripped) sort clause.

**`countAll`:** default `true`. Send `false` on pages after the first.

---

## Leg A — media-api (Scala)

### Refactoring extractions (same as old plan — still valid)

| Extraction | Justification |
|---|---|
| `buildFilteredQuery(params: SearchParams): Query` | ~80 lines inlined in `ElasticSearch.search()` — needed by 9+ endpoints |
| Lift `hitToImageEntity` to private method on `MediaApi` | Currently a closure inside `imageSearch()`; needed by this endpoint and Gap 12/8 |
| `SearchParamsBody.fromJson(body: JsValue, tier: Tier)` | All POST endpoints need body→SearchParams; write once |
| `sorts.appendTiebreaker(sorts: Seq[Sort])` | Deterministic pagination requires `_id` tiebreaker — cannot be forgotten per-endpoint |

### Files to touch

| File | Change |
|------|--------|
| `media-api/conf/routes` | Add `POST /images/search-after` before `GET /images/:id` |
| `media-api/app/lib/elasticsearch/ElasticSearchModel.scala` | New `SearchAfterParams`, `SearchAfterRawResults`, `SearchParamsBody.fromJson` |
| `media-api/app/lib/elasticsearch/ElasticSearch.scala` | Extract `buildFilteredQuery`; new `searchAfter()` method with null-zone detection |
| `media-api/app/lib/elasticsearch/sorts.scala` | Add `reverseSorts()`, `appendTiebreaker()` |
| `media-api/app/controllers/MediaApi.scala` | Lift `hitToImageEntity`; new `searchAfterImages()` handler |
| `media-api/test/lib/elasticsearch/ElasticSearchTest.scala` | Integration tests |

### Implementation sketch

#### 1. `buildFilteredQuery` extraction

Extract the ~80-line filter-assembly block from `ElasticSearch.search()` (lines
280–370) into a private method:

```scala
private def buildFilteredQuery(params: SearchParams): Query = {
  // existing filter-building logic unchanged
}
```

`search()` becomes a one-line call. All new endpoints call the same method.

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

#### 4. `sorts.scala` additions

```scala
def reverseSorts(sorts: Seq[Sort]): Seq[Sort] = sorts.map {
  case fs: FieldSort =>
    fs.order(if (fs.order == SortOrder.ASC) SortOrder.DESC else SortOrder.ASC)
  case other => other
}

def appendTiebreaker(sorts: Seq[Sort]): Seq[Sort] = {
  val hasTiebreaker = sorts.exists {
    case fs: FieldSort => fs.field == "_id" || fs.field == "id"
    case _ => false
  }
  if (hasTiebreaker) sorts
  else sorts :+ fieldSort("_id").order(SortOrder.ASC)
}
```

#### 5. Data types

```scala
case class SearchAfterParams(
  searchParams: SearchParams,
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

  val query = buildFilteredQuery(params.searchParams)

  val baseSorts    = sorts.appendTiebreaker(sorts.createSort(params.searchParams.orderBy))
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
    orderBy: params.orderBy,
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
- **Null-zone**: insert images where `metadata.dateTaken` is absent, use `orderBy="-taken"`, verify null-zone cursor `[null, uploadTime, id]` round-trips correctly and returns the right images
- Validation: `sortValues` wrong length → 422

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
- [ ] Null-zone cursors round-trip correctly (keyword sort, images missing primary field)
- [ ] `reverse=true` works through API path
- [ ] `seekToEnd=true` works through API path
- [ ] PIT passthrough works (open PIT via ES, pass to API, get consistent results)
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

## Commit strategy

- **Commit A:** media-api files only. PR branch: `media-api/search-after`.
- **Commit B:** kupua files only (`vite.config.ts`, `src/dal/`). Branch: `mk-next-next-next`.

---

## Appendix: Refactoring justification (for PR reviewers)

This commit includes four small extractions alongside the new endpoint. They are
motivated by concrete near-term reuse across the 15-gap media-api expansion roadmap,
not speculative cleanup. Each passes the test: "would it be obviously wrong NOT to
do this if you knew the full roadmap?"

### What was extracted and why

**1. `buildFilteredQuery(params: SearchParams): Query`** (~5 new LOC, ~80 moved)

The filter-assembly block in `search()` (lines 280–370) is inlined. It constructs
the same bool query from `SearchParams` that 9 of the 15 planned endpoints need.
Not extracting it means copy-pasting 80 lines nine times — a defect factory where
a filter fix in one endpoint is missed in eight others.

**2. `hitToImageEntity` lifted to private method** (~5 LOC signature change)

Was a nested `def` inside `imageSearch()` closing over `request` + `include`.
Three endpoints (this one, `mget`, `fetchPositionIndex`) need the same
hit-to-Argo-entity mapping. A nested closure isn't callable from other methods.

**3. `SearchParamsBody.fromJson(body: JsValue, tier: Tier)`** (~50 LOC)

Six planned endpoints accept filters via POST body. Each would need the same
20-field JSON→SearchParams parsing. Writing it once, tested once, wrong once max.

**4. `sorts.appendTiebreaker(sorts: Seq[Sort])`** (~5 LOC)

`search_after` requires a unique tiebreaker for deterministic pagination. Five
endpoints need this guarantee. Without the helper, each endpoint must remember to
append `_id` manually — a correctness hazard (silent data loss on page boundaries
if forgotten, invisible in testing with small datasets).

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
