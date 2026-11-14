# Gap 1 — `searchAfter` Cursor Pagination — Workplan

**Goal:** Kupua paginates via media-api `POST /images/search-after` when
media-api is running; falls back to direct ES when it's not.

---

## Endpoint Contract

```
POST /images/search-after
Content-Type: application/json
Cookie: <panda>

{
  "q": "cats",
  "orderBy": "-uploadTime",             // any valid orderBy (tiebreaker appended server-side)
  "length": 50,
  "sortValues": [1716000000000, "abc123def456"],   // omit for first page
  "pitId": "abc...",                                // optional
  "reverse": false,                                 // optional, default false
  "missingFirst": false,                            // optional, default false
  "countAll": true,                                 // optional, default true (set false after first page)
  // All filter fields flat at root (same keys as GET /images query params):
  "since": "2024-01-01T00:00:00Z",
  "labels": "foo,bar",
  "uploadedBy": "joe.bloggs",
  ...
}

→ 200  Content-Type: application/vnd.argo+json
{
  "data": [ <EmbeddedEntity per image> ],
  "total": 1300000,
  "sortValues": [[1716000000000, "abc"], [1715999999000, "def"], ...],
  "nextSortValues": [1715999000000, "ghi"],
  "pitId": "refreshed-pit-id-or-null"
}
```

**Body shape:** All params flat at root (no nested `"filters": {}` object).
Rationale: mirrors the query-string keys exactly; simpler parsing; no depth.

**`orderBy`:** Accepted as-is — any sort field `SearchParams` supports. Server
always appends `_id` tiebreaker via `sorts.appendTiebreaker()`. This is a
correctness requirement for `search_after` (deterministic ordering), not a
restriction on the caller.

**`countAll`:** Optional, default `true`. Kupua sends `true` on first page
(needs total for scrubber) and `false` on subsequent pages (skip the cost).

**`sortValues`:** Opaque round-trip. Whatever the server returns in `nextSortValues`,
the client sends back unchanged. `Seq[JsValue]` on the wire. Server validates
length against sort clause; ES validates content.

**Validation:** `sortValues.length == sortClause.length` → 422 if mismatched.
All other sort-value validation delegated to ES (surfaces as 400 from ES).

**Auth:** Standard panda cookie via `auth.async(parse.json)`.

---

## Leg A — media-api (Scala)

### Refactoring extractions (done inline with new code, single commit)

Four small extractions prepare the codebase for Gap 1 and later gaps. Each is
justified by concrete near-term reuse (not speculative cleanup). All are
extract-and-call — existing behaviour unchanged.

| Extraction | LOC | Reused by (known roadmap) | Current state |
|---|---|---|---|
| `buildFilteredQuery(params: SearchParams): Query` | ~5 new, ~80 moved | Gaps 1, 3, 4, 5, 6, 7, 8, 12, 13 (9 of 15) | Inlined in `ElasticSearch.search()` lines 280–370 |
| Lift `hitToImageEntity` to private def on `MediaApi` | ~5 signature | Gaps 1, 8, 12 | Nested closure inside `imageSearch()` |
| `SearchParamsBody.fromJson(body: JsValue, tier: Tier)` | ~50 | Gaps 1, 3, 5, 6, 8, 13 (all POST-with-filters) | Doesn't exist |
| `sorts.appendTiebreaker(sorts: Seq[Sort]): Seq[Sort]` | ~5 | Gaps 1, 3, 8, 9, 13 | Each gap would need to remember manually |

**What was deliberately NOT extracted** (premature until multiple consumers exist):
- Splitting `search()` into build/execute phases — `searchAfter()` doesn't need it.
- Response mapping abstraction — each endpoint has different shapes (Gap 3 returns a scalar).
- Shared "cursor endpoint" base trait — wait until 3+ cursor endpoints exist and
  the *actual* shared surface is visible, not the *predicted* one.

### Files to touch

| File | Change |
|------|--------|
| `media-api/conf/routes` | Add `POST /images/search-after` before `GET /images/:id` |
| `media-api/app/lib/elasticsearch/ElasticSearchModel.scala` | New `SearchAfterParams`, `SearchAfterResults`, `SearchParamsBody.fromJson` |
| `media-api/app/lib/elasticsearch/ElasticSearch.scala` | Extract `buildFilteredQuery`; new `searchAfter()` method |
| `media-api/app/lib/elasticsearch/sorts.scala` | Add `reverseSorts()` + `appendTiebreaker()` |
| `media-api/app/controllers/MediaApi.scala` | Lift `hitToImageEntity`; new `searchAfterImages()` handler |
| `media-api/app/MediaApiComponents.scala` | No change (handler on existing `MediaApi` class) |
| `media-api/test/lib/elasticsearch/ElasticSearchTest.scala` | Integration test for new ES method |

### Implementation sketch

#### 1. `buildFilteredQuery` extraction (`ElasticSearch.scala`)

Extract the ~80-line filter-assembly block from `search()` (lines 280–370) into:

```scala
private def buildFilteredQuery(params: SearchParams): Query = {
  // existing filter-building logic, unchanged
  // returns the `withFilter` value that search() currently computes inline
}
```

`search()` becomes: `val withFilter = buildFilteredQuery(params)` — one-line call
replacing the inline block. `searchAfter()` calls the same method.

#### 2. `hitToImageEntity` lift (`MediaApi.scala`)

Currently a nested `def` inside `imageSearch()` that closes over `request`,
`include`, `authorisation`. Lift to a private method on the class:

```scala
private def hitToImageEntity(
  request: Authentication.Request[_],
  include: List[String]
)(elasticId: String, image: SourceWrapper[Image]): EmbeddedEntity[JsValue] = {
  val writePermission = authorisation.isUploaderOrHasPermission(request.user, image.instance.uploadedBy, EditMetadata)
  val deletePermission = authorisation.isUploaderOrHasPermission(request.user, image.instance.uploadedBy, DeleteImagePermission)
  val deleteCropsOrUsagePermission = canUserDeleteCropsOrUsages(request.user)
  val (imageData, imageLinks, imageActions) =
    imageResponse.create(elasticId, image, writePermission, deletePermission, deleteCropsOrUsagePermission, include, request.user.accessor.tier)
  val id = (imageData \ "id").as[String]
  val imageUri = URI.create(s"${config.rootUri}/images/$id")
  EmbeddedEntity(uri = imageUri, data = Some(imageData), imageLinks, imageActions)
}
```

`imageSearch()` calls `hits map (hitToImageEntity(request, include) _).tupled`.
`searchAfterImages()` uses the same method.

#### 3. `SearchParamsBody.fromJson` (`ElasticSearchModel.scala`)

Parses the ~20 filter fields from a JSON body into a `SearchParams`. Reuses
existing helpers (`parseDateFromQuery`, `parseIntFromQuery`, etc.) — they all
take `String`, so we read string values from JSON.

```scala
object SearchParamsBody {
  def fromJson(body: JsValue, tier: Tier): Either[String, SearchParams] = {
    def str(key: String): Option[String] = (body \ key).asOpt[String]
    def commaSep(key: String): List[String] = str(key).toList.flatMap(SearchParams.commasToList)

    val query = str("q")
    val structuredQuery = query.map(Parser.run).getOrElse(List.empty)
    // ... all fields parsed same pattern as SearchParams.apply(request)
    // offset forced to 0, countAll accepted as optional (default true on first page)
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

#### 5. `SearchAfterParams` + `SearchAfterResults` (`ElasticSearchModel.scala`)

```scala
case class SearchAfterParams(
  searchParams: SearchParams,        // composed, not duplicated
  sortValues: Option[Seq[JsValue]],  // opaque cursor — raw ES hit.sort
  pitId: Option[String],
  reverse: Boolean = false,
  missingFirst: Boolean = false
)

case class SearchAfterResults(
  data: Seq[EmbeddedEntity[JsValue]],
  total: Long,
  sortValues: Seq[Seq[JsValue]],       // per-hit sort arrays
  nextSortValues: Option[Seq[JsValue]],
  pitId: Option[String]
)
object SearchAfterResults {
  implicit val jsonWrites: OWrites[SearchAfterResults] = Json.writes[SearchAfterResults]
}
```

#### 6. `ElasticSearch.searchAfter()` method

```scala
def searchAfter(params: SearchAfterParams)(implicit ec: ExecutionContext, logMarker: LogMarker): Future[SearchAfterResults] = {
  val query = buildFilteredQuery(params.searchParams)

  val baseSorts = params.searchParams.orderBy match {
    case Some("dateAddedToCollection") => sorts.dateAddedToCollectionDescending
    case _ => sorts.createSort(params.searchParams.orderBy)
  }
  val withTiebreaker = sorts.appendTiebreaker(baseSorts)
  val withReverse = if (params.reverse) sorts.reverseSorts(withTiebreaker) else withTiebreaker
  val finalSorts = if (params.missingFirst) {
    withReverse.headOption match {
      case Some(fs: FieldSort) => fs.missing("_first") +: withReverse.tail
      case _ => withReverse
    }
  } else withReverse

  // Validate cursor length
  params.sortValues.foreach { sv =>
    if (sv.length != finalSorts.length)
      return Future.failed(new InvalidUriParams(
        s"sortValues length ${sv.length} != sort clause length ${finalSorts.length}"))
  }

  // Build request — branch on PIT presence
  val baseRequest = params.pitId match {
    case Some(pid) =>
      ElasticDsl.search(Nil)
        .query(query)
        .pit(Pit(pid).keepAlive(1.minute))
    case None =>
      prepareSearch(query)
  }

  val searchRequest = baseRequest
    .size(params.searchParams.length)
    .sortBy(finalSorts)
    .trackTotalHits(params.searchParams.countAll.getOrElse(true))

  val withSearchAfter = params.sortValues match {
    case Some(sv) => searchRequest.searchAfter(sv.map(_.as[Any]))
    case None => searchRequest
  }

  executeAndLog(withSearchAfter, "search-after").map { r =>
    val rawHits = r.result.hits.hits.map(resolveHit).toSeq.flatten
    val hits = if (params.reverse) rawHits.reverse else rawHits

    val sortValsFromHits = r.result.hits.hits.map { hit =>
      hit.sort.take(finalSorts.length).map(v => Json.toJson(v))
    }.toSeq
    val sortValsOrdered = if (params.reverse) sortValsFromHits.reverse else sortValsFromHits

    val nextSortValues = sortValsOrdered.lastOption
    val refreshedPitId = Option(r.result.pitId).filter(_.nonEmpty)

    SearchAfterResults(
      data           = Seq.empty, // populated by controller after hitToImageEntity
      total          = r.result.totalHits,
      sortValues     = sortValsOrdered,
      nextSortValues = nextSortValues,
      pitId          = refreshedPitId.orElse(params.pitId)
    )
  }
}
```

**Note:** The ES layer returns raw `(id, SourceWrapper[Image])` tuples + sort values.
The controller maps through `hitToImageEntity` to produce `EmbeddedEntity[JsValue]`.
The split: ES returns a lighter result type; controller enriches into `SearchAfterResults`.

Actually — cleaner to have ES return hits + sortValues separately, controller composes:

```scala
// ES layer returns:
case class SearchAfterRawResults(
  hits: Seq[(String, SourceWrapper[Image])],
  total: Long,
  sortValues: Seq[Seq[JsValue]],
  nextSortValues: Option[Seq[JsValue]],
  pitId: Option[String]
)

// Controller maps hits → EmbeddedEntity, builds final SearchAfterResults for JSON response
```

#### 7. Controller handler

```scala
def searchAfterImages() = auth.async(parse.json) { request =>
  implicit val logMarker: LogMarker = MarkerMap(
    "requestType" -> "search-after",
    "requestId"   -> RequestLoggingFilter.getRequestId(request),
  ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

  SearchParamsBody.fromJson(request.body, request.user.accessor.tier) match {
    case Left(err) => Future.successful(respondError(BadRequest, "invalid-params", err))
    case Right(searchParams) =>
      val params = SearchAfterParams(
        searchParams = searchParams,
        sortValues   = (request.body \ "sortValues").asOpt[Seq[JsValue]],
        pitId        = (request.body \ "pitId").asOpt[String],
        reverse      = (request.body \ "reverse").asOpt[Boolean].getOrElse(false),
        missingFirst = (request.body \ "missingFirst").asOpt[Boolean].getOrElse(false),
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

#### 8. PIT + index handling (resolved)

elastic4s 8.19.1's `.pit(Pit(...))` automatically clears `indexes` on the
`SearchRequest` (confirmed: `copy(pit = Some(pit), indexes = Indexes(Nil))`).
The request handler routes to `/_search` (no index in URL) when PIT is present.
No manual URL manipulation needed. See findings-2 §2, §5.

#### 9. Response shape (resolved)

Custom `SearchAfterResults` with `OWrites` via `Json.writes` macro (Play JSON).
Content-type `ArgoMediaType` ("application/vnd.argo+json"). Does NOT use
`respondCollection` — avoids modifying shared `common-lib` `CollectionResponse`.
See findings-3 §6.

---

## Leg B — Kupua (TypeScript)

### Files to touch

| File | Change |
|------|--------|
| `kupua/vite.config.ts` | Add `READ_VIA_POST` whitelist, update write guard |
| `kupua/src/dal/media-api-search-adapter.ts` | **New file** — API client for `POST /api/images/search-after` |
| `kupua/src/dal/strangler-adapter.ts` | **New file** — implements `ImageDataSource`, delegates |
| `kupua/src/dal/index.ts` | Export new adapter, wire based on env var |
| `kupua/src/stores/search-store.ts` (or wherever DS is wired) | Swap to strangler adapter |

### Implementation sketch

**`vite.config.ts`** — write guard update:
```typescript
const READ_VIA_POST_PATHS = ["/api/images/search-after"];

function gridApiWriteGuard(): Plugin {
  return {
    name: "grid-api-write-guard",
    configureServer(server) {
      for (const prefix of GRID_API_PROXY_PREFIXES) {
        server.middlewares.use(prefix, (req, res, next) => {
          const fullPath = prefix + (req.url ?? "");
          const isWhitelistedPost = READ_VIA_POST_PATHS.some(p => fullPath.startsWith(p));
          if (req.method !== "GET" && !isWhitelistedPost && process.env.VITE_GRID_API_WRITES_ENABLED !== "true") {
            // ... existing block logic
          }
          next();
        });
      }
    },
  };
}
```

**`media-api-search-adapter.ts`** — thin API client:
```typescript
export async function apiSearchAfter(
  params: SearchParams,
  searchAfterValues: SortValues | null,
  pitId: string | null,
  signal?: AbortSignal,
  reverse?: boolean,
  missingFirst?: boolean,
): Promise<SearchAfterResult> {
  const t0 = Date.now();
  const body = {
    q: params.query,
    orderBy: params.orderBy,
    length: params.length ?? 200,
    sortValues: searchAfterValues,
    pitId,
    reverse: reverse ?? false,
    missingFirst: missingFirst ?? false,
    countAll: !searchAfterValues,  // true on first page, false after
    // ... all filter fields flat
  };

  const res = await fetch("/api/images/search-after", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) throw new Error(`search-after API: ${res.status}`);

  const json = await res.json();
  const fetchDuration = Date.now() - t0;

  return {
    hits: json.data.map(unwrapArgoEntity),  // parse EmbeddedEntity → Image
    total: json.total,
    sortValues: json.data.map(entity => entity.sortValues),  // or from response
    pitId: json.pitId,
    fetchDuration,
  };
}
```

**`strangler-adapter.ts`** — delegation:
```typescript
export class StranglerDataSource implements ImageDataSource {
  constructor(
    private es: ElasticsearchDataSource,
    private useApi: boolean,
  ) {}

  async searchAfter(...args): Promise<SearchAfterResult> {
    if (this.useApi) return apiSearchAfter(...mappedArgs);
    return this.es.searchAfter(...args);
  }

  // All other methods: pass through to ES
  search(...args) { return this.es.search(...args); }
  openPit(...args) { return this.es.openPit(...args); }
  // ... (17 methods, 16 of which just delegate)
}
```

**Wiring** (in `dal/index.ts` or store init):
```typescript
const useMediaApi = import.meta.env.VITE_USE_MEDIA_API === "true";
const es = new ElasticsearchDataSource(config);
export const dataSource: ImageDataSource = useMediaApi
  ? new StranglerDataSource(es, true)
  : es;  // or: new StranglerDataSource(es, false) — same effect
```

### Response mapping concern

The media-api returns images wrapped in Argo `EmbeddedEntity` with full enrichment
(S3 URLs, thumbs, validity, actions). Kupua's `Image` type (from `types.ts`) is
shaped differently from the Argo response. The adapter needs a mapper:
`ArgoImageEntity → Image`.

This mapper already partially exists in `grid-api-adapter.ts` (`unwrapResponse`,
`unwrapSearchHits`). Reuse or import those utilities.

**Per-hit sort values:** The response carries a top-level `sortValues` array (array
of arrays, one per hit, in hit order). Kupua's `SearchAfterResult.sortValues` is
already this shape. The adapter reads `json.sortValues` directly — no per-entity
extraction needed.

---

## Test Plan

### Leg A (Scala)

- **Integration test** in `ElasticSearchTest.scala`: insert N images with known
  uploadTimes, call `searchAfter` with length=2, verify 2 hits returned + valid
  `nextSortValues`. Call again with those `nextSortValues`, verify next 2.
- **Reverse test:** same data, `reverse=true`, verify hits come in opposite order.
- **Validation test:** send `sortValues` with wrong length → 422.
- **No controller test** (consistent with existing media-api pattern).

### Leg B (Kupua)

- **Unit test** for `media-api-search-adapter.ts`: mock fetch, verify request shape,
  verify response mapping.
- **Unit test** for `StranglerDataSource`: verify delegation routing (useApi=true →
  calls apiSearchAfter; useApi=false → calls es.searchAfter).
- **Existing e2e tests** must pass unchanged with `VITE_USE_MEDIA_API=false` (default).
- **Manual validation** with `VITE_USE_MEDIA_API=true` + local media-api running
  (via `start.sh --use-TEST`): scroll through results, verify no jank difference.

---

## Done When

- [ ] `POST /images/search-after` responds correctly on local media-api (via curl)
- [ ] Kupua scrolls using the API path with `VITE_USE_MEDIA_API=true`
- [ ] Kupua scrolls using direct ES with `VITE_USE_MEDIA_API=false` (no regression)
- [ ] PIT ID passthrough works (open PIT via ES, pass to API endpoint, get consistent results)
- [ ] Reverse sort works through the API path
- [ ] Integration test passes in media-api
- [ ] Unit tests pass in kupua
- [ ] Existing e2e tests pass (default mode = ES)
- [ ] Write guard blocks arbitrary POST but allows `/api/images/search-after`

---

## Out of Scope / Anti-Goals

- **No null-zone handling (Gap 10).** If `sortValues[0]` is null, it passes through
  to ES unchanged. ES handles it — it just won't get the two-phase correctness.
  That's fine for uploadTime sort (never null). Keyword sorts with nulls = future gap.
- **No shadow/comparison mode yet.** The worknotes describe a shadow traffic mode
  for perf measurement. That's a follow-up after this workplan ships and works.
  This workplan delivers the "single mode selected at startup" behaviour only.
- **No `_source` filtering (Gap 11).** Full images always returned.
- **No streaming.** Response is a single JSON payload. Fine for length≤200.
- **No `noSource` param.** Only needed for position-map (Gap 8). Omit from contract.
- **No `sortOverride` or `extraFilter` params.** These are kupua-internal concerns
  for sort-around-focus. The ES adapter handles them locally — they don't need to
  traverse the API. The strangler adapter can apply them by falling back to ES for
  those specific call patterns (detect non-null `sortOverride`/`extraFilter` → ES path).
- **No changes to `start.sh`.** The env var is enough; `--with-media-api` flag is a
  nice-to-have for later.

---

## Commit Strategy (per worknotes)

- **Commit A:** media-api files only (`media-api/conf/routes`, `media-api/app/...`,
  `media-api/test/...`). Extractable to PR branch `media-api/search-after`.
- **Commit B:** kupua files only (`kupua/vite.config.ts`, `kupua/src/dal/...`,
  `kupua/src/stores/...` if wiring changes). Stays on `mk-next-next-next`.

---

## Appendix: Refactoring Justification (for PR reviewers)

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
| Null-zone detection | Gap 10 only — premature |
| `_source: false` mode | Gaps 8, 13 only — premature |

These will be extracted when their second consumer arrives, not before.
