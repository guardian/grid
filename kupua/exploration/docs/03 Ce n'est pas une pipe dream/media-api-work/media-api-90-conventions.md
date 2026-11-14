# media-api Conventions Reference

**Produced:** 2026-05-30
**Method:** Codebase read (media-api + common-lib), drawing heavily on Tom's and
Andrew's code and PR discussions (#4122 #4145 #4201 #4334), plus Guardian org
guides (scala.md, pull-requests.md).
**Ground truth priority:** the target revision's code and explicit review decisions >
relevant reviewed PR examples > org guides. Section 16 supplements that foundation
with bounded evidence from Lindsey's work; open proposals are not merged team policy.

**Scope:** the original survey is a dated snapshot, not a set of universal bans.
Check the branch being changed. D3-specific provisions describe the prototype's
adopted contract and do not establish that every choice has merged into Grid main.
Keep authorization, data safety and the owning API contract intact when applying
style guidance. The detailed reference is this file; the short operational summary
is [media-api-91-instructions-for-agents.md](media-api-91-instructions-for-agents.md),
whose local auto-loaded mirror is maintained separately.

---

## 1. Controller Anatomy

For protected image/resource endpoints, the usual `media-api` controller extends `BaseController` with `ArgoHelpers`
(and any response-helper traits like `AggregateResponses`), wired in
`MediaApiComponents.scala` via compile-time constructor injection.
Deliberately public static configuration has a different existing contract; see
section 16. That exception is not permission to omit authentication on image APIs.

### Canonical example — `getImage`

**Route** (`media-api/conf/routes:19`):
```
GET     /images/:id     controllers.MediaApi.getImage(id: String)
```

**Controller** (`media-api/app/controllers/MediaApi.scala:157`):
```scala
def getImage(id: String) = auth.async { request =>
  implicit val logMarker: LogMarker = MarkerMap(
    "requestType" -> "get-image",
    "requestId"   -> RequestLoggingFilter.getRequestId(request),
    "imageId"     -> id,
  ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

  getImageResponseFromES(id, request) map {
    case Some((_, imageData, imageLinks, imageActions)) =>
      respond(imageData, imageLinks, imageActions)
    case _ => ImageNotFound(id)
  }
}
```

Walk-through:
1. **`auth.async { request => ... }`** — all authenticated routes use this.
2. **`implicit val logMarker`** — created first, always `MarkerMap(...)` merged with
   `RequestLoggingFilter.loggablePrincipal(request.user)`. Keys: `requestType`,
   `requestId`, and any relevant entity ids.
3. **ES call** — returns a `Future[Option[...]]`.
4. **`isVisibleToAccessor` guard** — checked inside any helper that returns
   `Option[Image]`; syndication tier sees 404 if image not available for syndication.
5. **`respond(data, links, actions)`** — Argo envelope.

### Class declaration

```scala
class MediaApi(
  auth: Authentication,
  ...
)(implicit val ec: ExecutionContext) extends BaseController with MessageSubjects with ArgoHelpers with ContentDisposition {
```
Cite: `MediaApi.scala:37`. Constructor args are the dependencies. No `@Inject`.
Wired in `MediaApiComponents.scala:34`:
```scala
val mediaApi = new MediaApi(auth, messageSender, ..., authorisation, embedder)
```

---

## 2. Route Definitions

File: `media-api/conf/routes`.

**Ordering rule:** more specific paths must appear before generic path-param routes.
The existing ordering is:
1. `GET /images/metadata/:field` (specific)
2. `GET /images/aggregations/date/:field` (specific)
3. `GET /images/:id` (generic id param)
4. `GET /images` (search)

New routes must respect this. A route like `GET /images/search-after` must appear
**before** `GET /images/:id` to avoid Play routing it to `getImage("search-after")`.

**GET vs POST for read-only endpoints:**
- `GET /images` uses query-string params, the established ordinary-search pattern.
- All new AI search params (`useAISearch`, `similar:` embedded in `q`, `vecWeight`
  added in PR #4738) are URL query params parsed via `request.getQueryString()`.
- D3 adopted POST with `auth.async(parse.json)` for body-heavy cursor reads in the
  prototype. Sections 14-15 record that decision and its team-sign-off limit.
  Do not treat the earlier absence of POST reads as a ban, or prototype adoption
  as automatic approval for a new endpoint. Preserve each existing wire contract.

**Path naming:** kebab-case path segments (`/images/search-after`, not `searchAfter`).
Cite: existing routes file — all multi-word paths are kebab.

**Route format:** two-space-aligned columns of method, path, controller ref.
Cite: `conf/routes:1-48`.

---

## 3. Argo Response Patterns

All response helpers live in `com.gu.mediaservice.lib.argo.ArgoHelpers`
(common-lib). Import via `with ArgoHelpers` mixin.
Content-type for all responses: `application/vnd.argo+json`.

### `respond` — single item

```scala
respond(data, links = Nil, actions = Nil)
```
Wraps in `EntityResponse[T]`. Used for: single image, scalar data, simple JSON
objects. Cite: `ArgoHelpers.scala:17`.

### `respondCollection` — list

```scala
respondCollection(data, offset, total, maybeExtraCounts, links)
```
Wraps in `CollectionResponse[T]`. Used for search results, aggregation results.
Cite: `ArgoHelpers.scala:28`, `AggregationController.scala:18`.

### `respondError` — error

```scala
respondError(BadRequest, "error-key", "human message")
respondError(NotFound, "image-not-found", s"No image found with the given id $id")
```
Error key: kebab-case. Logs a warning automatically (inside `ArgoHelpers`).
Cite: `ArgoHelpers.scala:58`, `MediaApi.scala:134-138`.

Existing error keys in MediaApi:
- `"image-not-found"`, `"export-not-found"`, `"cannot-delete"`, `"delete-not-allowed"`,
  `"edit-not-allowed"`, `"cannot-get"`, `"invalid-uri-parameters"`.

### `respondNotFound` — 404 shorthand

```scala
respondNotFound("No soft-deleted metadata found for image id: ...")
```
Uses the fixed key `"not-found"`. Cite: `ArgoHelpers.scala:66`.

### When to populate `links` and `actions`

- `links`: always include at minimum a back-reference to the primary resource
  (e.g. `Link("image", s"${config.rootUri}/images/$id")`). Cite: `MediaApi.scala:242`.
- `actions`: only for mutating operations; only for `Internal` tier.
  Cite: `ImageResponse.scala:85`.
- New read-only endpoints: provide relevant links, no actions.

### Bare scalars in `data`

Yes — `respond(Json.toJson(image.exports))`, `respond(Json.toJson(image.fileMetadata))`.
Any `Writes[T]` works. Cite: `MediaApi.scala:244, 258`.

---

## 4. Image Enrichment

For endpoints that return full image representations, call:

```scala
val (imageData, imageLinks, imageActions) = imageResponse.create(
  id,
  source,            // SourceWrapper[Image]
  writePermission,   // Boolean
  deleteImagePermission,
  deleteCropsOrUsagePermission,
  include,           // List[String] from ?include= query param
  request.user.accessor.tier
)
```
Cite: `MediaApi.scala:660-668`, `ImageResponse.scala:52`.

`SourceWrapper[Image]` is what `getImageWithSourceById` returns. It carries both
the parsed `Image` and the raw ES `JsValue` source (used for S3 URL injection).

For search results, each hit becomes an `EmbeddedEntity`:

```scala
def hitToImageEntity(elasticId: String, image: SourceWrapper[Image]): EmbeddedEntity[JsValue] = {
  val writePermission = authorisation.isUploaderOrHasPermission(...)
  val deletePermission = authorisation.isUploaderOrHasPermission(...)
  val deleteCropsOrUsagePermission = canUserDeleteCropsOrUsages(request.user)
  val (imageData, imageLinks, imageActions) =
    imageResponse.create(elasticId, image, writePermission, deletePermission,
                         deleteCropsOrUsagePermission, include, request.user.accessor.tier)
  val id = (imageData \ "id").as[String]
  val imageUri = URI.create(s"${config.rootUri}/images/$id")
  EmbeddedEntity(uri = imageUri, data = Some(imageData), imageLinks, imageActions)
}
```
Cite: `MediaApi.scala:556-565`.

**Never** construct image JSON manually. `imageResponse.create` handles S3 URL
signing, thumb URLs, validity, persistence state, syndication status, aliases.

---

## 5. elastic4s Usage

### Imports

```scala
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.searches._
import com.sksamuel.elastic4s.requests.searches.queries.Query
```
DSL wildcard import is standard. Cite: `ElasticSearch.scala:9-13`.
Version: `elastic4s 8.19.1` (tracking ES 8.18.x). Bumped in PR #4738. Cite: `build.sbt:81`.

### Style

Fluent DSL, not explicit case-class builders:

```scala
val query = boolQuery() must someQuery filter someFilter
val searchRequest = prepareSearch(query)
  .trackTotalHits(trackTotalHits)
  .storedFields("_source")
  .from(params.offset)
  .size(params.length)
  .sortBy(sort)
```
Cite: `ElasticSearch.scala:315-325`.

### `prepareSearch` — preserve live-query routing

```scala
private def prepareSearch(query: Query): SearchRequest
```
Handles migration-aware index selection (current alias vs migration index).
Existing live keyword/filter searches use this helper; do not alter their routing for Kupua.
Cite: `ElasticSearch.scala:440`.

Exceptions include current-index KNN and D3's PIT branch, which searches the PIT target and
deliberately bypasses `prepareSearch`. Apply the timeout separately there. New target-specific
methods need an explicit ordinary-operation contract; do not blindly copy multi-index routing.

### `executeAndLog` — always use this

```scala
executeAndLog(searchRequest, "description of query").map { r =>
  // r.result is SearchResponse
  val hits = r.result.hits.hits.map(resolveHit)
  ...
}
```
Wraps execution with logging and metrics. Defined in `ElasticSearchClient`
(common-lib). Cite: `ElasticSearch.scala:332`.

### Timeout

Apply `withSearchQueryTimeout(sr)` to search requests. Already applied inside
`prepareSearch`. For any `SearchRequest` built outside `prepareSearch`, apply
manually. Cite: `ElasticSearch.scala:437`.
The timeout is `10 seconds`; there is also a cluster-level 15s timeout.

### Async

ES I/O methods compose `Future[...]`; pure query-building helpers need not be async.
Do not block production request paths with `Await`. Existing historical tests use
blocking harness code, which is not a production-handler pattern. Use the existing
Future/Option style rather than introducing a new effect stack for a small change.

### `resolveHit`

```scala
private def resolveHit(hit: SearchHit) = mapImageFrom(
  hit.sourceAsString, hit.id, hit.index,
  fields = hit.fields match { case null => JsObject.empty; case _ => ... }
)
```
Returns `Option[SourceWrapper[Image]]`. Cite: `ElasticSearch.scala:145`.
Used in all search result mappings.

---

## 6. Permission / Auth

### Entry point

```scala
def myEndpoint = auth.async { request => ... }
```
Authenticated async endpoints use `auth.async`; D3 explicitly selects its JSON
body parser with `auth.async(parse.json)`. Choose the form required by the owning
route, not an obsolete assumption that all bodies are parsed manually. Preserve
authentication and principal-derived authorization regardless of body format.

### Tier visibility

```scala
private def isVisibleToAccessor(principal: Principal, image: Image): Boolean =
  principal.accessor.tier match {
    case Syndication => isAvailableForSyndication(image)
    case _ => true
  }
```
Always check this before returning an image to the caller, using a guard in the
`map` pattern match:
```scala
case Some(image) if isVisibleToAccessor(request.user, image) => ...
case _ => ImageNotFound(id)
```
Returning 404 (not 403) for syndication-tier blocked images is deliberate.
Cite: `MediaApi.scala:153-156, 211`.

### Write / delete permission checks

```scala
val writePermission  = authorisation.isUploaderOrHasPermission(request.user, image.uploadedBy, EditMetadata)
val deletePermission = authorisation.isUploaderOrHasPermission(request.user, image.uploadedBy, DeleteImagePermission)
```
Cite: `MediaApi.scala:660-662`. These are needed only when constructing the full
image response or performing mutations. Read-only endpoints that don't return the
full image representation do not need write/delete permission checks.

---

## 7. Error Handling

### Private error vals / defs

Group at the top of the class:
```scala
private def ImageNotFound(id: String)  = respondError(NotFound,           "image-not-found",   s"No image found with the given id $id")
private def ExportNotFound             = respondError(NotFound,           "export-not-found",  "No export found with the given id")
private def ImageCannotBeDeleted       = respondError(MethodNotAllowed,   "cannot-delete",     "Cannot delete persisted images")
private def ImageDeleteForbidden       = respondError(Forbidden,          "delete-not-allowed","No permission to delete this image")
```
Cite: `MediaApi.scala:134-138`. New endpoints should follow this pattern.

### Status code conventions

- `404 NotFound` — resource not found, or syndication-tier access denied.
- `403 Forbidden` — authenticated but not permitted to mutate.
- `405 MethodNotAllowed` — valid image but operation not permitted (e.g. deleting
  a persisted image).
- `422 UnprocessableEntity` — malformed query params (`InvalidUriParams`).
- `500 InternalServerError` — unexpected server-side failure (used sparingly).

### From ES layer

The owning method defines its result and failure contract, commonly
`Future[Option[...]]` or `Future[SearchResults]`. Known failures can have explicit
types and controller mappings; D3's expiry/invalid-parameter handling is one such
prototype contract. Do not turn every failed Future into `None`, an empty result
or a generic 500 merely to simplify control flow. Inspect the actual caller.

---

## 8. Test Conventions

### Framework

ScalaTest `AnyFunSpec` with `Matchers`. Cite:
`ElasticSearchTestBase.scala:16`, `ImageResponseTest.scala:16`.

Not `PlaySpec`. Not Specs2. Not `WordSpec`.

### ES integration tests

Extend `ElasticSearchDockerBase` (from `common-lib/testlib`). Runs a real ES
instance via Docker/Testcontainers. Images inserted in `beforeAll`, cleaned in
`afterAll`. Uses `eventually(timeout(...), interval(...))` for eventual consistency.
Cite: `ElasticSearchTest.scala:28`, `ElasticSearchTestBase.scala:16`.

### Mocking

`org.scalatestplus.mockito.MockitoSugar`. Version: `mockito-3-4:3.1.4.0`.
Cite: `build.sbt:53`, `ElasticSearchTest.scala:24`.

### Location & naming

- `media-api/test/lib/` — unit tests for lib classes
- `media-api/test/lib/elasticsearch/` — ES layer tests
- File naming: `XyzTest.scala` (not `XyzSpec.scala`)
- The original survey emphasized ES/model tests. The current prototype also has
  controller policy tests and controller-to-ES contract fixtures. Check the
  selected main revision before assuming those exact helpers are available.

### Test method style

```scala
it("should return images matching the query") { ... }
describe("search") { it("should ...") { ... } }
```
Cite: `ElasticSearchTest.scala:83`, `ImageResponseTest.scala:31`.

### Coverage expectation

Non-trivial ES query logic needs real-ES membership coverage in the established
integration-test home. Decoder, authorization and response contracts may also need
controller coverage; a pure builder test cannot prove them. Avoid duplicating tests
for a genuinely trivial pass-through, but do not mistake admission/policy work for
mere forwarding. Section 16 explains how to make fixtures discriminate the claimed
behavior; test quantity and passing CI alone are not that evidence.

---

## 9. Comment Density

The measurements below describe the original snapshot, not a target or maximum.
Do not turn a comment count into a review rule.

Measured across four key files (comments counted with `grep -c '^\s*//'`):

| File | Comments | Lines | Per 100 LOC |
|---|---|---|---|
| `MediaApi.scala` | 23 | 744 | 3.1 |
| `ElasticSearch.scala` | 9 | 474 | 1.9 |
| `ImageResponse.scala` | 8 | 453 | 1.8 |
| `MediaApiConfig.scala` | 2 | 89 | 2.2 |
| **Average** | | | **~2.2** |

When comments appear:
- Above a non-obvious algorithm or workaround that would confuse a future reader.
  Example: `ElasticSearch.scala:72` explains `allow_partial_search_results` behaviour.
- `// FIXME`/`// TODO` for known technical debt. Example: `MediaApi.scala:726`.
- Inline `// fire and forget` or `// ^ Flatten None away` — very short, explaining
  intent where the code isn't obvious.

What is absent:
- No Scaladoc (`/** */`) on private or package-private methods.
- No Scaladoc on controller action methods.
- No "this method does X" comments above methods whose names already say it.

Prefer clear names and control flow over narration of obvious steps. Add a short
reason where an invariant, ordering dependency or intentional exception would
otherwise look like a mistake. The reviewed examples in section 16 contain such
comments; inherited comments are not proof of an author's preferred density.

---

## 10. Logging

### Trait

Mix in `GridLogging` (extends `StrictLogging` from typesafe-scalalogging).
Provides an implicit `logger` of type `Logger`. Cite: `GridLogging.scala:8`.

```scala
class MyController(...) extends BaseController with ArgoHelpers with GridLogging
```
`MediaApi` gets `GridLogging` via `ArgoHelpers → GridLogging`. No need to re-mix.

### Calling convention

```scala
logger.info(logMarker, s"Syndicate image: $id from user: ${Authentication.getIdentity(request.user)}")
logger.error(logMarker, s"Failed to parse image ...: ${e.getMessage}")
```
Always pass `logMarker` first (the `LoggerWithHelpers` implicit class makes this
work). Never use the bare `logger.info(s"message")` form without a marker in
controller code. Cite: `MediaApi.scala:460, ElasticSearch.scala:89`.

### Log levels

- `info` — business events (image downloaded, reindex triggered, syndication started).
- `debug` — operational noise, verbose internal steps (rarely used in MediaApi controllers).
- `warn` — `respondError` logs at warn automatically; do not double-log.
- `error` — parse failures, unexpected exceptions.

### logMarker construction pattern

```scala
implicit val logMarker: LogMarker = MarkerMap(
  "requestType" -> "my-action",
  "requestId"   -> RequestLoggingFilter.getRequestId(request),
  "imageId"     -> id,
) ++ RequestLoggingFilter.loggablePrincipal(request.user)
```
`requestType` key is the primary identifier for log filtering.
Additional entity ids (`imageId`, `exportId`, etc.) for tracing.
`loggablePrincipal` adds tier and identity. This marker is declared `implicit`
and used throughout the action's scope. Cite: `MediaApi.scala:160-163`.

Andrew's review note (PR #4145): log markers threading through a request
makes backlog debugging and log filtering significantly easier.

### No metric calls in new endpoints

MediaApi metrics (`mediaApiMetrics.searchQueries`, `.incrementImageDownload`) are
called only in specific established paths. Do not add metric calls to new endpoints
without confirming with the team which metric makes sense.

---

## 11. Imports & Formatting

### scalafmt

No `.scalafmt.conf` in the repository root (confirmed: `find` returned empty).
Mechanical style must therefore be inferred from the codebase as-is.

### Import style observed

```scala
// stdlib
import java.net.URI
import scala.concurrent.{ExecutionContext, Future}

// external
import com.sksamuel.elastic4s.ElasticDsl._
import org.joda.time.{DateTime, DateTimeZone}
import play.api.libs.json._
import play.api.mvc._

// gu common-lib
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.model._

// local
import lib._
import lib.elasticsearch._
```
Wildcard imports (`._`) are used freely for packages where multiple items are needed.
Cite: `MediaApi.scala:1-33`.
There is no rigid alphabetical ordering — grouping by origin is the pattern.

### Line length

Observed lines are typically 80-120 chars. Some longer lines exist without
complaint (cite: `MediaApi.scala:495` is ~115 chars). There is no enforced limit.

### Indentation

2 spaces throughout (standard Scala).

---

## 12. Naming

### Methods

camelCase, verb prefix where it describes an action:
- `getImage`, `deleteImage`, `imageSearch`, `uploadedBy`, `getImageExports`
- ES layer: `getImageById`, `lookupIds`, `search`, `dateHistogramAggregate`

`imageSearch` (no verb prefix) is an existing anomaly — new search-like endpoints
should follow `getImage` / `imageSearch` convention; either is acceptable.

### Case classes for params / results

- `SearchParams` — controller query param parsing (cite: `ElasticSearchModel.scala:55`)
- `SearchResults` — ES return type (cite: `ElasticSearchModel.scala:16`)
- `AggregateSearchParams` — aggregation query (cite: `ElasticSearchModel.scala:39`)
- `AggregateSearchResults` — aggregation result (cite: `ElasticSearchModel.scala:17`)

For ES operation params/results, retain the `*Params`/`*Results` convention and
their existing home in `ElasticSearchModel.scala`. This is not a rule to put every
domain or response type there: recent examples put content-usage models in
`models` and crop configuration in its owning `lib.crops` package (section 16).

### Error key strings

kebab-case: `"image-not-found"`, `"cannot-delete"`, `"invalid-uri-parameters"`.
Cite: `MediaApi.scala:134-138, ElasticSearchModel.scala:85`.

### File naming

Scala files: PascalCase for classes (`MediaApi.scala`, `ElasticSearch.scala`).
Exception: `sorts.scala` — lowercase singleton object file. Follow the
existing file's case when adding to it; for new files use PascalCase.

---

## 13. Anti-Patterns to Avoid

1. **Skipping `isVisibleToAccessor`** — every endpoint that returns image data
   must guard with this check. Syndication tier breakage is a security issue.

2. **Logging without a logMarker** — `logger.info(s"...")` without structured
   markers. Always pass `logMarker` to every logger call in controller scope.
  Raised in PR #4145 review (Andrew).

3. **Using `var`** — `var` should not appear in controllers. Raised in PR #4201
   review: "factor out mutable Map".

4. **Changing live routing accidentally** — bypassing `prepareSearch` in an existing live
  search changes migration-aware behavior. Conversely, adding it to D3's PIT branch is wrong.
  Preserve each established path; review a new target-specific method's contract explicitly.

5. **Constructing image JSON manually** — always use `imageResponse.create(...)`.
   S3 URL signing, thumb URL selection, validity maps etc. are all handled there.

6. **Guice-style DI** — no `@Inject`, no runtime DI. Add new dependencies to the
   constructor and wire in `MediaApiComponents.scala`.

7. **Pattern-matching on ES response status codes directly** — use the higher-level
   `executeAndLog` wrapper, not raw `client.execute(...)`.

---

## 14. Patterns I'm Uncertain About

1. **POST body parsing in MediaApi — RESOLVED by D3 (2026-06-15).** D3 (`POST /images/search-after`)
   adopted `auth.async(parse.json)` + body parsing (deviations §27); this is now the pattern for
   cursor/body-heavy endpoints. **Team sign-off still pending (N-3).** Background (still accurate):
   media-api previously used GET + URL query params for all read endpoints — confirmed by PRs #4554,
   #4708, #4738 — but 6 other Grid services (collections, cropper, leases, metadata-editor, usage,
   image-loader) use `auth.async(parse.json)` + `request.body.validate[T]` across ~25 endpoints,
   the exact same `auth` wrapper media-api has. media-api was the outlier; D3 brought it in line.
   See **Appendix A** for the full analysis.

2. **`SearchParams.validate`** — called in `imageSearch()` for standard (non-AI)
   searches: `SearchParams.validate(searchParams).fold(errors => respondError(...), params => performSearchAndRespond(params))`.
   The AI search path bypasses validate entirely — it checks `useAISearch` first
   and takes a completely separate code path. For new standard endpoints that use
   `SearchParams`, call validate before dispatching to ES. Cite: `MediaApi.scala:672`.

3. **Whether `trackTotalHits` should always be true for new endpoints** — the
   existing search exposes it as a `countAll` param. For new pagination endpoints,
   the right default is unclear without understanding the ES cluster's performance
   profile at scale.

4. **PIT (`point_in_time`) API availability** — ~~open question, now resolved~~.
   `elastic4s 8.18.2` (and 8.19.1) **does** expose `createPointInTime(index): CreatePitRequest`
   and `deletePointInTime(id): DeletePitRequest` via `PitApi` (mixed into `ElasticDsl`).
   `SearchRequest` has a `.pit(id, keepAlive)` field serialised by `SearchBodyBuilderFn`.
   Cite: `PitApi.scala` at v8.18.2, `SearchBodyBuilderFn.scala`.

5. **Request body size limits** — Play's default is 100KB. For `searchAfter` style
   endpoints passing sort values, this is likely fine, but `fetchPositionIndex`
   (full position map) might push large responses that require streaming or chunking.
   Not clear from codebase what the team's preferred approach is.

---

## 15. Questions for the Team

1. **GET vs POST for new endpoints — RESOLVED by D3 (2026-06-15):** adopted **POST +
   `auth.async(parse.json)`** for cursor/body-heavy endpoints (deviations §27). Kupua's endpoints
   need compound cursor values (`sortValues`: mixed-type JSON arrays with nulls) and large ID
   lists (>200 IDs) that strain or break GET+query-string. The model implementation is
   `leases/MediaLeaseController.scala:97` (`postLease`); **see Appendix A** for the trade-offs.
   **Still open: team sign-off (N-3)** — confirm this as the standing convention before the `main`
   PR; it was a unilateral implementation choice the team had reserved.

2. **Testing bar for new read-only endpoints** — Agree the relevant admission,
  authorization, query and response coverage. Controller tests now exist in the
  prototype; their presence does not by itself settle the testing bar on main.
  Use section 8 and the actual target-revision test homes.

3. **`SearchResponse.nextSortValues` return shape** — Should `search_after` endpoints
   return `nextSortValues` as a raw `List[Any]`? What is the agreed serialisation
   format for sort values that mix Long (date) and String (field)?

4. ~~**Argo vs plain JSON for new endpoints** — effectively resolved.~~ All AI
   search PRs (#4554, #4708) use full `respondCollection` + `EmbeddedEntity`. Use
   full Argo everywhere, even for kupua-only endpoints.

5. ~~**PIT API in elastic4s 8.18.2** — resolved.~~ `createPointInTime`/`deletePointInTime`
   are exposed. `SearchRequest.pit(id, keepAlive)` serialises the `pit` object in the
   request body. No raw HTTP client needed.

6. **Cluster PIT memory overhead** — What is the current median number of concurrent
   active users of Grid? Needed to estimate PIT session cost at scale before committing
   to a server-side PIT implementation.

7. **`_source` filtering** — Is there precedent for `fetchSourceInclude` on search
   results (as opposed to single-document `get`), or does the team prefer always
   returning full `_source` and filtering at the serialisation layer?

---

## 16. Reviewable Scala: Recent PR Evidence

**Evidence scope, 21 September 2026:** these are observable coding practices, not a
profile of a reviewer or a guarantee of approval. The Getty rewrite
[#4893](https://github.com/guardian/grid/pull/4893) and its date-parser follow-up
[#4930](https://github.com/guardian/grid/pull/4930) are open. The original
[#4663](https://github.com/guardian/grid/pull/4663) is also open. Distinguish their
proposed changes from merged examples, and Lindsey-authored changes from inherited
code or other reviewers' requests. No code or tests were executed for this reading.
This is a bounded sample, not a review of every PR in the author search.

| Evidence | Status when read | What was inspected and what it supports |
| --- | --- | --- |
| #4663 to #4893 | Both open | Both complete changed-file diffs and ten Lindsey-authored refactor/test commits, separated from inherited work and main merges. Explicit readability intent; concrete helper, guard, fallback and fixture changes. |
| [#4930](https://github.com/guardian/grid/pull/4930/files/7c57db7d323e0c3f220884aa60538cd4bc57afd8) | Open, targeting the #4893 branch | Both authored commits and all three changed-file diffs: library parsing, a small domain value, and added unit assertions. The test request came from Junyuan; it is not evidence of a universal author test-first practice. |
| [#4940](https://github.com/guardian/grid/pull/4940/files/1656e4017daba4c4599fbee6871c1fc652f16223) | Merged | Complete changed Scala/test diff and both new Scala files: short orchestration, optional response fields, existing pagination/retry machinery and domain naming. Test fixture configuration changed, not behavioral assertions. |
| [#4857](https://github.com/guardian/grid/pull/4857/files) | Merged | Complete diff and changed S3 file: client construction moved behind an owning helper with explicit local-environment handling. No test changes; SDK builder internals are not a pure-immutability example. |
| [#4743](https://github.com/guardian/grid/pull/4743/files/b09475af35473b6cd9b0594f9a00310b1e08091a) | Merged | Complete diff and new Scala files: a small response model and deliberately simple static-configuration action. The comment explaining its public nature followed Andrew's request. No test changes. |

### Make Control Flow Reviewable

The [Getty rewrite](https://github.com/guardian/grid/pull/4893/files/d5199357424dce6c23cf0a7dbd10f091ad975deb)
explicitly aims to make control flow easier to read. `cleanDescription` uses named
matching predicates and a guarded successful case, with the unchanged description
as the fallback. `fixMisplacedBylineCredit` composes optional prerequisites and
guards, then falls back once to the original values. The entry point names an
ordered description-cleaning pipeline instead of expanding every detail inline.

**Guidance:** make prerequisites, transformation order and fallback visible. Use
named domain predicates, pattern guards, Option composition or a for-comprehension
when they reduce branching and repeated fallbacks. Do not minimize line count at
the expense of readability, require a for-comprehension for every condition, or
copy incidental wrappers and one-use helpers mechanically.

The authored changes are particularly clear in
[predicate extraction](https://github.com/guardian/grid/commit/14abf7efbb844a39d21778c839364fcd4bf5ac77),
[pipeline composition](https://github.com/guardian/grid/commit/a567ae0e7bf068c13d6b21d30d65f1956a74702d)
and [optional prerequisites with one fallback](https://github.com/guardian/grid/commit/3f25d868516a3586359b5db7132655792e9fe0b4).
These are strong evidence of the direction of this rewrite, not a ban on ordinary
`if` statements or pattern matching.

### Give Helpers and Types a Real Job

The [location/date refactor](https://github.com/guardian/grid/commit/55e97881b663acb976f16c9f00bcbb8f94b4344e)
replaces numeric regex-group access with named extractor bindings, separates
location matching, date matching and prefix preservation, and passes the existing
`ImageMetadata` value instead of a long list of related optional fields. In merged
#4940, the controller delegates response mapping to `UsagesInContent.fromSearchResponse`;
#4857 puts presigner construction in its existing S3 owner.

**Guidance:** extract a helper when its name exposes a meaningful decision or
operation, not just to move lines elsewhere. Use a coherent existing domain value
when it clarifies the inputs; do not pass an entire request/application object to
a tiny helper merely to shorten the signature. Keep simple forwarding simple.
New types should capture domain meaning, optionality or a useful boundary, not
create a framework for a one-off transformation.

### Parse with Established Libraries, Preserve Meaning

In [#4930's authored change](https://github.com/guardian/grid/commit/e514b6e6b4f5c5313658b1c3f8beeeb2f14e65f5),
Joda formatters replace a manual month-name table and ad hoc conversion at the
caller. `PartialDate` represents the parsed value, including an actually absent
year, and names its domain matching operation. In merged #4940,
`findContentUsingImage` delegates pagination to `paginateAccum` and uses the
client library's retry mechanism rather than hand-building those loops.

**Guidance:** use an established compatible parser/client for its actual task,
then keep domain-specific rules explicit. Preserve missing information as `Option`
rather than inventing a value to make the pipeline fit. Evaluate accepted input
forms, boundaries, fallback and failure behavior before claiming equivalence;
library reuse is not permission to change them silently. Do not collapse service
failures into missing data unless the owning contract explicitly calls for it.

### Make Tests Discriminate

The rewrite's [case-insensitivity correction](https://github.com/guardian/grid/commit/5dc43772db61ecd64b54637d929b23b4d4622191)
changes inputs that previously shared the same case. Its
[separate city/country cases](https://github.com/guardian/grid/commit/4df9ef78a04b91313e446e14963d394a8ac30d0d)
exercise each successful alternative without the other masking it.

**Guidance:** ask what plausible wrong implementation would still pass each test.
Vary the decisive property, include nonmatching/preservation controls, and test
alternatives independently as well as in combination. This is concrete evidence
about these changes, not proof that every PR by this author uses test-first work.

The [PartialDate tests](https://github.com/guardian/grid/commit/7c57db7d323e0c3f220884aa60538cd4bc57afd8)
separately exercise parsing, invalid dates, missing years and matching boundaries.
They were added after a reviewer request. The three merged examples above added
no behavioral tests, so the appropriate lesson is the quality of discriminators,
not a claimed universal testing habit or permission to omit required coverage.

### A Refactor Still Needs Behavior Checks

The Getty rewrite states a functionality-preservation goal. Nevertheless, an
[intermediate helper extraction](https://github.com/guardian/grid/commit/0a017ffc86769055a4fe4eca7c3f091070d6176b)
reversed the operands of suffix matching; the
[subsequent correction](https://github.com/guardian/grid/commit/e2932831c6a57d104a03a5670fb59ad0495197f7)
restored their direction. The date-library follow-up also changes parsing and
validation machinery. These source observations are not a claim that either PR
has been independently runtime-verified here.

**Guidance:** distinguish structural cleanup from changed behavior. Preserve
transformation order and test the unchanged/fallback path as well as the intended
successful change. Neither a refactor title nor a passing test whose fixture
cannot discriminate is proof of equivalence. Avoid opportunistic semantic changes
inside a readability refactor.

### Respect Domain and API Boundaries

In #4940, the requests to use a domain-specific model name and a namespaced feature
flag came from Junyuan and were adopted by Lindsey. The resulting
`UsagesInContent` is distinct from Grid usage records. #4743's explanatory public-route
comment was an accepted request from Andrew. Attribute those as reviewed decisions,
not private preferences inferred from authorship alone.

The [public crop-configuration action](https://github.com/guardian/grid/blob/b09475af35473b6cd9b0594f9a00310b1e08091a/media-api/app/controllers/ConfigurationController.scala)
uses plain JSON and a synchronous Action for static, non-sensitive data. That does
not authorize removing auth, Argo enrichment or logging from image/resource paths.
The [content-usage response model](https://github.com/guardian/grid/blob/1656e4017daba4c4599fbee6871c1fc652f16223/media-api/app/models/UsagesInContent.scala)
derives both JSON directions, while CropOption uses `Json.format`; neither supports
a claim that this reviewer universally requires one serialization style.

**Guidance:** name models for their actual domain, place them with their owning
feature, and preserve the established API/security/failure contract. Derive the
JSON directions required by consumers and follow local patterns; do not add
unused codecs or mechanically remove existing formats. Explain intentional
exceptions briefly rather than filling code with comments that repeat its steps.

For the usage-search repair, these conventions favor named operations with clear
Boolean meaning, existing query/parser facilities and discriminating fixtures.
They do not decide the search semantics, authorize an abstraction rewrite, or
change any of the task's safety and scope limits.

---

## Appendix A — GET+Query-String vs POST Body for New Endpoints

### Context

The team's established pattern is GET + URL query params for all read endpoints (§2).
Kupua's new endpoints need to carry **compound cursor values** (`sortValues`) that
don't fit cleanly into this pattern. `sortValues` is kupua's pagination primitive —
without it, ES's `search_after` can't work, and kupua becomes a DOA (no scrolling, no seeking, no position awareness).
This appendix lays out the concrete trade-offs to inform the team discussion.

### What `sortValues` actually is

A `sortValues` cursor is an **ordered, mixed-type JSON array** returned by ES as
`hit.sort`. For the default `uploadTime desc` + `id` tiebreaker sort:

```json
[1716000000000, "abc123def456"]
```

For a `dateTaken` sort where the image has no `dateTaken` (null-zone):

```json
[null, "abc123def456"]
```

For a keyword sort (e.g. `byline asc`) with a value containing special characters:

```json
["Reuters/Landov, Inc.", "abc123def456"]
```

### Option 1: GET with `sortValues` as a query param

Convention: URL-encode a JSON array.

```
GET /images/search-after?q=cats&orderBy=-uploadTime&sortValues=%5B1716000000000%2C%22abc123def456%22%5D&length=50
```

Decoded, the query string is:
```
?q=cats&orderBy=-uploadTime&sortValues=[1716000000000,"abc123def456"]&length=50
```

Null-zone cursor:
```
?sortValues=[null,"abc123def456"]
```

Keyword with special chars:
```
?sortValues=["Reuters/Landov, Inc.","abc123def456"]
```

**Advantages:**
- Consistent with existing team pattern
- Debuggable with curl / browser address bar
- No new Play body-parser plumbing

**Problems:**
- Type information relies on JSON parse of a single param (unusual for Play routes)
- `null` representation requires JSON — no simpler encoding can distinguish
  `null` (doc has no value for this field) from the string `"null"` or empty string
- Special characters in keyword values require double-encoding (URL-encode the
  JSON string that already contains URL-unsafe chars like commas and quotes)
- Unusual ergonomics: no other `SearchParams` field is a JSON array. Every other
  param is a scalar or comma-separated list of simple strings
- Error-prone for manual testing: forgetting to URL-encode the brackets/quotes breaks
  the request silently

### Option 2: POST with JSON body

```
POST /images/search-after
Content-Type: application/json

{
  "q": "cats",
  "orderBy": "-uploadTime",
  "sortValues": [1716000000000, "abc123def456"],
  "length": 50
}
```

Null-zone: `"sortValues": [null, "abc123def456"]` — native JSON, unambiguous.

**Advantages:**
- Native representation of mixed-type arrays, nulls, nested structure
- No encoding gymnastics
- Standard REST pattern for search endpoints with complex parameters
  (ES itself uses POST for `_search`)
- Body size limit (Play default 100KB) is generous — even the largest cursor is <1KB
- Scales cleanly to future needs (nested filter objects, etc.)

**Problems:**
- First POST-for-reads in MediaApi — but NOT a new pattern for Grid (6 services,
  ~25 endpoints already use `auth.async(parse.json)` with the same auth wrapper).
  (Adopted by D3 — see deviations §27.)
- Slightly harder to test with curl (need `-d` flag)
- Breaks the assumption that all `SearchParams` come from `getQueryString()`

### The hard case: `mget` with large ID lists (Gap 12)

Kupua fetches batches of up to 500 image IDs at once. As a query string:

```
GET /images/mget?ids=abc001,abc002,abc003,...,abc500
```

At ~20 chars per ID × 500 IDs = **~10KB of query string**. Most web servers and
proxies enforce a URL length limit of 2KB–8KB (nginx default: 4KB; AWS ALB: 8KB;
CloudFront: 8KB). This exceeds safe limits.

The existing `?ids=` param on `GET /images` enforces a 200-ID cap
(`SearchParams.maxSize = 200` at `ElasticSearchModel.scala:220`) partly for this
reason. Kupua needs more.

**Verdict:** `mget` with >200 IDs **requires** POST. No query-string encoding solves
the URL length problem.

### Endpoints where GET+query-string is fine

| Endpoint | Params beyond existing `SearchParams` | Verdict |
|---|---|---|
| Gap 4 `sort-percentile` | `field` (string), `percentile` (int) | GET trivially |
| Gap 7 `date-distribution` | `direction`, `adaptive` (booleans) | GET trivially |
| Gap 9 `reverse sort` | `reverse` (bool), `missingFirst` (bool) | GET trivially |
| Gap 11 `_source filtering` | `includeFields` (comma-sep strings) | GET trivially |
| Gap 17 `count` | No new params | GET trivially |

### Endpoints where GET is awkward but possible

| Endpoint | Problematic param | Why awkward |
|---|---|---|
| Gap 1 `searchAfter` | `sortValues` (mixed-type array) | JSON-in-URL, null handling |
| Gap 3 `countBefore` | `sortValues` (same) | Same as Gap 1 |
| Gap 8 `fetchPositionIndex` | `sortValues` (same) | Same as Gap 1 |
| Gap 13 `getIdRange` | `fromCursor`, `toCursor` (both mixed-type arrays) | Two cursors = worse |
| Gap 10 null-zone seek | `sortValues` with null | null encoding critical |

### Endpoints where POST is effectively required

| Endpoint | Why |
|---|---|
| Gap 12 `mget` | 500 IDs exceeds URL length limits |
| Gap 2 `PIT create` | Semantically a resource-creation (POST) + DELETE lifecycle |

### Recommendation for team discussion

**Hybrid approach:** Keep GET+query-string for endpoints whose params are simple
scalars (Gaps 4, 7, 9, 11, 17). Introduce POST for endpoints that carry cursors
or large payloads (Gaps 1, 2, 3, 8, 10, 12, 13).

This isn't introducing a new pattern — it's bringing media-api in line with what
collections, cropper, leases, metadata-editor, usage, and image-loader already do.
The exact `auth.async(parse.json)` + `request.body.validate[T]` pattern is used
across ~25 endpoints in Grid. The cleanest model implementation is
`leases/app/controllers/MediaLeaseController.scala:97` (`postLease`).

The alternative (forcing JSON arrays into URL params) is technically possible but
creates an inconsistency with every other param in `SearchParams`, makes debugging
harder, and introduces a fragile encoding contract that only kupua uses.

If the team strongly prefers GET-only, the `sortValues` encoding would need to be:
- URL-encoded JSON array: `?sortValues=%5B1716000000000%2C%22abc123def456%22%5D`
- Server parses with `Json.parse(request.getQueryString("sortValues").get)`
- Null represented as JSON `null` (not empty string)
- This works but is unusual and harder to debug
